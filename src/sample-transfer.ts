// Native-to-browser samples use bounded chunks because the current browser
// binding can lose large fragmented messages. One link keeps at most one frame.
export class SampleReceiver {
  private active?:{id:string;key:string;total:number;parts:Uint8Array[];bytes:number;started:number};
  constructor(private readonly topic:()=>string|undefined){}
  clear(){this.active=undefined;}
  receive(payload:Uint8Array):{ack:Record<string,unknown>;sample?:{key:string;bytes:Uint8Array}} {
    let requestId:unknown,received:unknown;
    try {
      if(payload.length>40_000)throw new Error('Live chunk exceeds limit');
      const chunk=JSON.parse(new TextDecoder().decode(payload));
      requestId=chunk.requestId;received=chunk.index+1;
      if(typeof requestId!=='string'||requestId.length>100||!Number.isInteger(chunk.index)||!Number.isInteger(chunk.total)||chunk.index<0||chunk.index>=chunk.total||chunk.total>334)throw new Error('Invalid live chunk index/count');
      if(chunk.key!==this.topic()||!this.topic())throw new Error('Unexpected live sensor topic');
      if(chunk.index===0)this.active={id:requestId,key:chunk.key,total:chunk.total,parts:[],bytes:0,started:performance.now()};
      const frame=this.active;
      if(!frame||frame.id!==requestId||frame.total!==chunk.total||frame.key!==chunk.key||frame.parts.length!==chunk.index||performance.now()-frame.started>15_000)throw new Error('Out-of-order or expired live frame');
      if(typeof chunk.data!=='string'||chunk.data.length>32_000)throw new Error('Live chunk data exceeds limit');
      const part=Uint8Array.from(atob(chunk.data),c=>c.charCodeAt(0));
      if(part.length>24_000||frame.bytes+part.length>8_000_000)throw new Error('Live frame exceeds limit');
      frame.parts.push(part);frame.bytes+=part.length;
      if(frame.parts.length<frame.total)return {ack:{requestId,received}};
      const bytes=new Uint8Array(frame.bytes);let offset=0;
      for(const part of frame.parts){bytes.set(part,offset);offset+=part.length;}
      this.clear();return {ack:{requestId,received},sample:{key:frame.key,bytes}};
    }catch(error){this.clear();return {ack:{requestId,received,error:String(error)}};}
  }
}
