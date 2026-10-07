import {parentPort, workerData} from 'node:worker_threads';
import inspector from 'node:inspector';
import fs from 'node:fs';

// Keeping the control port open lets inspector requests complete before profiling.
parentPort.on('message', message => { if (message === 'stop') void stop(); });
const session = new inspector.Session();
session.connectToMainThread();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(watchdog);
  try {
    const {profile} = await post('Profiler.stop');
    fs.writeFileSync(workerData.output, JSON.stringify(profile));
  } finally {
    session.disconnect();
    parentPort.close();
  }
}
await post('Profiler.enable');
await post('Profiler.setSamplingInterval', {interval: 1000});
await post('Profiler.start');
const watchdog = setTimeout(() => void stop(), 15_000);
parentPort.postMessage('ready');
