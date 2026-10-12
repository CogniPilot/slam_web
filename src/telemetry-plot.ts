import type {Estimate, Truth, SensorObservation} from './types';
import './telemetry-plot.css';

export const plotSignals = [
  ['z', 'World altitude z (m)'], ['x', 'World position x (m)'], ['y', 'World position y (m)'],
  ['vx', 'Velocity x (m/s)'], ['vy', 'Velocity y (m/s)'], ['vz', 'Velocity z (m/s)'],
  ['ax', 'IMU acceleration x (m/s²)'], ['ay', 'IMU acceleration y (m/s²)'], ['az', 'IMU acceleration z (m/s²)'],
  ['gx', 'Gyro x (rad/s)'], ['gy', 'Gyro y (rad/s)'], ['gz', 'Gyro z (rad/s)'],
  ['ex', 'Estimate map x (m)'], ['ey', 'Estimate map y (m)'], ['ez', 'Estimate map z (m)'], ['confidence', 'Estimate confidence (unitless)'],
] as const;
export type PlotSignal = typeof plotSignals[number][0];
export interface PlotSample {time:number; values:Partial<Record<PlotSignal, number>>}

/** Stores both vehicles independently, including signals not currently visible. Times are seconds. */
export class TelemetryHistory {
  private vehicles: PlotSample[][] = [[], []];
  constructor(readonly capacity = 600, readonly windowSeconds = 20) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new Error('Invalid telemetry history limits');
  }
  sample(vehicleIndex:number, time:number, truth?:Truth, estimate?:Estimate, imu?:SensorObservation['imu']) {
    if ((vehicleIndex !== 0 && vehicleIndex !== 1) || !Number.isFinite(time)) return;
    const samples = this.vehicles[vehicleIndex];
    const last = samples.at(-1);
    if (last && time < last.time) samples.length = 0;
    else if (last && time - last.time < 1 / 30) return;
    const values:PlotSample['values'] = {};
    const put = (signal:PlotSignal, value:number|undefined) => {if (value !== undefined && Number.isFinite(value)) values[signal] = value;};
    if (truth) {
      put('x', truth.x); put('y', truth.y); put('z', truth.z);
      (['vx','vy','vz'] as const).forEach((key, i) => put(key, truth.velocity[i]));
    }
    const acceleration = imu?.accel ?? truth?.accel;
    const gyro = imu?.gyro ?? truth?.gyro;
    (['ax','ay','az'] as const).forEach((key, i) => put(key, acceleration?.[i]));
    (['gx','gy','gz'] as const).forEach((key, i) => put(key, gyro?.[i]));
    if (estimate) {put('ex', estimate.x); put('ey', estimate.y); put('ez', estimate.z); put('confidence', estimate.confidence);}
    samples.push({time, values});
    while (samples.length > this.capacity || samples[0].time < time - this.windowSeconds) samples.shift();
  }
  samples(vehicleIndex:number):readonly PlotSample[] {return this.vehicles[vehicleIndex] ?? [];}
  reset() {this.vehicles = [[], []];}
}

export function mountTelemetryPlot(container:HTMLElement, options:{vehicleCount?:1|2} = {}) {
  const history = new TelemetryHistory();
  let vehicleCount = options.vehicleCount ?? 1;
  let dirty = true;
  let disposed = false;
  const panel = document.createElement('section'); panel.className = 'panel telemetry-plot';
  const header = document.createElement('header'); header.className = 'panel-header';
  const title = document.createElement('h2'); title.textContent = 'Plot';
  header.append(title);
  const body = document.createElement('div'); body.className = 'telemetry-plot-body';
  const controls = document.createElement('div'); controls.className = 'telemetry-plot-series';
  const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add series';
  const canvas = document.createElement('canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Live telemetry over the last 20 seconds');
  const note = document.createElement('div'); note.className = 'telemetry-plot-note'; note.textContent = 'Last 20 seconds · waiting for telemetry';
  body.append(controls, add, canvas, note); panel.append(header, body); container.append(panel);
  const colors = ['#50d9f1','#ffbd69','#c397ff','#81dc8a','#ff839d','#eee17b'];
  const series:{vehicle:number;signal:PlotSignal;row:HTMLElement;vehicleSelect:HTMLSelectElement;color:string}[] = [];
  function addSeries() {
    if (series.length >= 12) return;
    const row = document.createElement('div'); row.className = 'telemetry-plot-series-row';
    const color = colors[series.length % colors.length]; row.style.setProperty('--series-color', color);
    const vehicleSelect = document.createElement('select'); vehicleSelect.setAttribute('aria-label', 'Series drone');
    const signalSelect = document.createElement('select'); signalSelect.setAttribute('aria-label', 'Series signal');
    for (const [key, label] of plotSignals) {const option = document.createElement('option'); option.value = key; option.textContent = label; signalSelect.append(option);}
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove plot series');
    const entry = {vehicle:0, signal:'z' as PlotSignal, row, vehicleSelect, color}; series.push(entry);
    vehicleSelect.onchange = () => {entry.vehicle = Number(vehicleSelect.value); dirty = true;};
    signalSelect.onchange = () => {entry.signal = signalSelect.value as PlotSignal; dirty = true;};
    remove.onclick = () => {series.splice(series.indexOf(entry), 1); row.remove(); add.disabled = false; dirty = true;};
    row.append(vehicleSelect, signalSelect, remove); controls.append(row); updateVehicles(); add.disabled = series.length >= 12; dirty = true;
  }
  function updateVehicles() {
    for (const entry of series) {
      entry.vehicle = Math.min(entry.vehicle, vehicleCount - 1);
      entry.vehicleSelect.replaceChildren();
      for (let i = 0; i < vehicleCount; i++) {const option = document.createElement('option'); option.value = String(i); option.textContent = `Drone ${i + 1}`; entry.vehicleSelect.append(option);}
      entry.vehicleSelect.value = String(entry.vehicle);
    }
    dirty = true;
  }
  function render() {
    if (!dirty || disposed || document.hidden || !panel.isConnected || panel.classList.contains('pane-collapsed')) return;
    const width = Math.round(canvas.clientWidth), height = Math.round(canvas.clientHeight);
    if (!width || !height) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {canvas.width = pixelWidth; canvas.height = pixelHeight;}
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    dirty = false;
    const end = Math.max(...[0,1].map(i => history.samples(i).at(-1)?.time ?? 0));
    const start = end - history.windowSeconds;
    let low = Infinity, high = -Infinity;
    for (const entry of series) for (const sample of history.samples(entry.vehicle)) {
      const value = sample.values[entry.signal]; if (sample.time >= start && value !== undefined) {low = Math.min(low, value); high = Math.max(high, value);}
    }
    const hasValues = Number.isFinite(low);
    if (!hasValues) {low = -1; high = 1;}
    const margin = Math.max((high-low)*0.1, 0.1); low -= margin; high += margin;
    const left = 62, right = width - 12, top = 12, bottom = height - 26;
    context.font = '11px system-ui'; context.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + (bottom-top)*i/4;
      context.strokeStyle = '#324253'; context.beginPath(); context.moveTo(left,y); context.lineTo(right,y); context.stroke();
      context.fillStyle = '#aab9c8'; context.fillText((high-(high-low)*i/4).toPrecision(3), 3, y+4);
    }
    context.fillStyle = '#aab9c8'; context.fillText('−20 s',left,bottom+18); context.fillText('now',right-25,bottom+18);
    for (const entry of series) {
      context.strokeStyle = entry.color; context.lineWidth = 2; context.beginPath(); let connected = false;
      for (const sample of history.samples(entry.vehicle)) {
        const value = sample.values[entry.signal];
        if (sample.time < start || value === undefined) {connected = false; continue;}
        const x = left + (sample.time-start)/history.windowSeconds*(right-left), y = bottom-(value-low)/(high-low)*(bottom-top);
        if (connected) context.lineTo(x,y); else context.moveTo(x,y); connected = true;
      }
      context.stroke();
    }
    const status = hasValues ? 'Last 20 seconds · shared numeric scale; units shown per series · world and estimate map coordinates differ' : 'Last 20 seconds · waiting for telemetry';
    if (note.textContent !== status) note.textContent = status;
  }
  add.onclick = addSeries; addSeries();
  const observer = new ResizeObserver(() => {dirty = true;}); observer.observe(canvas);
  const timer = window.setInterval(render, 100);
  return {
    panel, header,
    sample(vehicleIndex:number, frameTime:number, truth?:Truth, estimate?:Estimate, imu?:SensorObservation['imu']) {history.sample(vehicleIndex, frameTime, truth, estimate, imu); dirty = true;},
    reset() {history.reset(); dirty = true;},
    setVehicleCount(count:1|2) {vehicleCount = count; updateVehicles();},
    dispose() {disposed = true; window.clearInterval(timer); observer.disconnect(); panel.remove();},
  };
}
