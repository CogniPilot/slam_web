export interface FlowStat {count:number;bufferBytes:number|null}

/** Port activity for the UI. Numerical values travel directly along graph
 * edges; this monitor stores counters, never copies or serializes the data. */
export class DataFlow {
  readonly stats=new Map<string,FlowStat>();
  record(port:string,bufferBytes:number|null=null){
    const previous=this.stats.get(port);
    this.stats.set(port,{count:(previous?.count??0)+1,bufferBytes});
  }
}
