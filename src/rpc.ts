export class WorkerRpc {
  private sequence = 0;
  private pending = new Map<number, { resolve: (x: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; started:number }>();
  lastTimings:Record<string,number>={};
  constructor(readonly worker: Worker) {
    worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer); this.pending.delete(data.id);
      this.lastTimings={roundTripMs:performance.now()-request.started,...data.timings};
      data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
    };
    worker.onerror = e => this.stop(new Error(e.message));
  }
  call<T = any>(type: string, args: Record<string, unknown> = {}, timeout = 60_000): Promise<T> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); this.stop(new Error(`${type} exceeded ${timeout / 1000}s; worker stopped`)); reject(new Error(`${type} timed out`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer,started:performance.now() });
      this.worker.postMessage({ id, type, ...args });
    });
  }
  stop(error = new Error('Worker stopped')) {
    this.worker.terminate();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
}
