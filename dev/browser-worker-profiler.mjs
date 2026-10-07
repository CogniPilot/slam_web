// Diagnostic CPU sampling of one actual dedicated worker. Compiler probes keep
// their original first-worker/default-start behavior. Other probes can select a
// worker URL and defer sampling until initialization and shader warmup finish.
export async function startWorkerProfiler(page, {workerUrlIncludes, autoStart = true, interval = 5000} = {}) {
  if (!Number.isInteger(interval) || interval < 100) throw new Error('Invalid profiler sampling interval');
  const session = await page.context().newCDPSession(page);
  const pending = new Map();
  let sequence = 0, workerSession, workerInfo, startup, failure, started = false;
  session.on('Target.receivedMessageFromTarget', event => {
    const response = JSON.parse(event.message);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result);
  });
  function send(target, method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Worker profiler protocol timed out: ${method}`));
      }, 5000);
      pending.set(id, {resolve, reject, timer});
      session.send('Target.sendMessageToTarget', {
        sessionId: target, message: JSON.stringify({id, method, params}),
      }).catch(error => {
        clearTimeout(timer); pending.delete(id); reject(error);
      });
    });
  }
  session.on('Target.attachedToTarget', event => {
    if (event.targetInfo.type !== 'worker' || workerSession
      || (workerUrlIncludes && !event.targetInfo.url.includes(workerUrlIncludes))) {
      send(event.sessionId, 'Runtime.runIfWaitingForDebugger').catch(error => { failure ??= error.message; });
      return;
    }
    workerSession = event.sessionId;
    workerInfo = event.targetInfo;
    startup = (async () => {
      try {
        await send(workerSession, 'Profiler.enable');
        await send(workerSession, 'Profiler.setSamplingInterval', {interval});
        if (autoStart) { await send(workerSession, 'Profiler.start'); started = true; }
      } catch (error) { failure = error.message; }
      finally { await send(workerSession, 'Runtime.runIfWaitingForDebugger'); }
    })().catch(error => { failure = error.message; });
  });
  await session.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: false});
  return {
    async start() {
      await startup;
      if (failure) throw new Error(failure);
      if (!workerSession) throw new Error(`Worker was not attached for profiling: ${workerUrlIncludes ?? 'first worker'}`);
      if (started) throw new Error('Worker profiler already started');
      await send(workerSession, 'Profiler.start'); started = true;
    },
    async stop() {
      try {
        await startup;
        if (failure) throw new Error(failure);
        if (!workerSession || !started) throw new Error('Worker profiler was not started');
        return {status: 'ACTUAL_WORKER_CPU_PROFILE_CAPTURED', worker: workerInfo, interval,
          ...(await send(workerSession, 'Profiler.stop'))};
      } catch (error) {
        return {status: 'WORKER_CPU_PROFILE_FAILED', error: error.message};
      } finally {
        for (const request of pending.values()) {
          clearTimeout(request.timer); request.reject(new Error('Worker profiler stopped'));
        }
        pending.clear();
        await session.detach().catch(() => {}); // The owned browser closes next.
      }
    },
  };
}
