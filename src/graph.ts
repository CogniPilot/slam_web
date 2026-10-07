import type { Project } from './project';
export type PortType = 'truth' | 'frame' | 'features' | 'estimate' | 'metrics';
export interface GraphNode { id: string; title: string; kind: 'physics'|'sensor'|'detector'|'slam'|'map'|'evaluation'|'modelica'; x: number; y: number; source?: string; inputType?: PortType; outputType?: PortType }
export interface Edge { from: string; output: string; to: string; input: string }
export interface Graph { nodes: GraphNode[]; edges: Edge[] }
export function nodeRuntimeLabel(node:GraphNode,_project:Pick<Project,'detectorLanguage'|'runtime'>):string {
  if(node.kind==='detector')return 'Modelica · native integration pending';
  if(['physics','detector','slam','modelica','evaluation'].includes(node.kind))return 'Modelica · Rumoca WASM';
  if(node.kind==='sensor')return 'Three.js + Modelica sensors';
  return 'Browser sink';
}
export const defaultGraph = (): Graph => ({ nodes: [
  {id:'physics',title:'Quadrotor physics',kind:'physics',x:20,y:25},
  {id:'sensor',title:'D435 + airframe IMU',kind:'sensor',x:250,y:25},
  {id:'detector',title:'Feature detector',kind:'detector',x:490,y:25},
  {id:'slam',title:'RGB-D / inertial SLAM',kind:'slam',x:490,y:220},
  {id:'map',title:'Point-cloud map',kind:'map',x:740,y:220},
  {id:'evaluation',title:'Trajectory evaluation',kind:'evaluation',x:740,y:25}
], edges: [
  {from:'physics',output:'truth',to:'sensor',input:'truth'},
  {from:'sensor',output:'frame',to:'detector',input:'frame'},
  {from:'sensor',output:'frame',to:'slam',input:'frame'},
  {from:'detector',output:'features',to:'slam',input:'features'},
  {from:'slam',output:'estimate',to:'map',input:'estimate'},
  {from:'map',output:'estimate',to:'evaluation',input:'estimate'},
  {from:'physics',output:'truth',to:'evaluation',input:'truth'}
] });
export function ports(node: GraphNode): { inputs: Record<string,PortType>; outputs: Record<string,PortType> } {
  switch(node.kind) {
    case 'physics': return {inputs:{},outputs:{truth:'truth'}};
    case 'sensor': return {inputs:{truth:'truth'},outputs:{frame:'frame'}};
    case 'detector': return {inputs:{frame:'frame'},outputs:{features:'features'}};
    case 'slam': return {inputs:{frame:'frame',features:'features'},outputs:{estimate:'estimate'}};
    case 'map': return {inputs:{estimate:'estimate'},outputs:{estimate:'estimate'}};
    case 'evaluation': return {inputs:{truth:'truth',estimate:'estimate'},outputs:{metrics:'metrics'}};
    case 'modelica': return {inputs:{in:node.inputType!},outputs:{out:node.outputType!}};
  }
}
export function validateGraph(graph: Graph): GraphNode[] {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  if(nodes.size!==graph.nodes.length || !graph.nodes.length) throw new Error('Node IDs must be unique');
  if(graph.nodes.filter(n=>n.kind==='physics').length!==1||graph.nodes.filter(n=>n.kind==='sensor').length!==1) throw new Error('A run requires one physics node and one camera/IMU source');
  const targets=new Set<string>();
  for(const e of graph.edges) {
    const from=nodes.get(e.from),to=nodes.get(e.to);
    if(!from||!to) throw new Error('Connection references a missing node');
    const source=ports(from).outputs[e.output],target=ports(to).inputs[e.input];
    if(!source||source!==target) throw new Error(`Incompatible connection: ${e.from}.${e.output} → ${e.to}.${e.input}`);
    const key=`${e.to}/${e.input}`;
    if(targets.has(key)) throw new Error(`Input ${key} has multiple publishers`);
    targets.add(key);
  }
  for(const n of graph.nodes) for(const input of Object.keys(ports(n).inputs)) if(!targets.has(`${n.id}/${input}`)) throw new Error(`Connect ${n.title}.${input} before running`);
  const result: GraphNode[]=[]; const visited=new Set<string>(); const active=new Set<string>();
  function visit(n: GraphNode) {
    if(active.has(n.id)) throw new Error('Zero-delay cycles are not supported; this graph must be acyclic');
    if(visited.has(n.id)) return;
    active.add(n.id);
    for(const e of graph.edges.filter(e=>e.to===n.id)) visit(nodes.get(e.from)!);
    active.delete(n.id);visited.add(n.id);result.push(n);
  }
  graph.nodes.forEach(visit); return result;
}
export function sourceFor(node: GraphNode, project: Project) {
  if(node.kind==='physics') return project.physics;
  if(node.kind==='detector') return project.detector;
  if(node.kind==='slam') return project.algorithm;
  if(node.kind==='sensor') return project.sensorModelica??'';
  if(node.kind==='evaluation') return project.evaluationModelica??'';
  return node.source ?? '';
}
export function setSource(node: GraphNode, project: Project, value: string) {
  if(node.kind==='physics') project.physics=value;
  else if(node.kind==='detector') project.detector=value;
  else if(node.kind==='slam') project.algorithm=value;
  else if(node.kind==='sensor') project.sensorModelica=value;
  else if(node.kind==='evaluation') project.evaluationModelica=value;
  else node.source=value;
}
export const portTopic=(node: string,port: string)=>`lab/node/${node}/${port}`;
