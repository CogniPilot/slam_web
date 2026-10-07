// Independent scalar image oracle; production features remain Modelica-authored.
const width=160,height=90;
export function evenRound(value:number){const low=Math.floor(value),fraction=value-low;return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;}
export const scoreBits=(scores:Float64Array)=>Buffer.from(scores.buffer,scores.byteOffset,scores.byteLength).toString('hex');
function grayscale(rgb:Uint8Array,normalized:boolean){
  return Float64Array.from({length:width*height},(_,pixel)=>((rgb[4*pixel]+rgb[4*pixel+1])+rgb[4*pixel+2])/3/(normalized?255:1));
}
function rankedFeatures(scores:Float64Array,absolute:number,relative:number,scale:number,radius:number,cap:number,border:number){
  let maximum=0;for(const score of scores)maximum=Math.max(maximum,score);
  const threshold=Math.max(absolute,relative*maximum),guard=Math.floor(threshold*scale)-1;
  const indices=Array.from({length:width*height},(_,i)=>i).filter(i=>{
    const x=i%width,y=Math.floor(i/width);return x>=border&&x<width-border&&y>=border&&y<height-border&&evenRound(scores[i]*scale)>=guard;
  });
  indices.sort((i,j)=>evenRound(scores[j]*scale)-evenRound(scores[i]*scale)||i-j);
  const selected:number[][]=[];
  for(const index of indices){
    if(scores[index]<threshold)break;
    const x=index%width,y=Math.floor(index/width);
    if(selected.some(([px,py])=>Math.abs(px-x)<=radius&&Math.abs(py-y)<=radius))continue;
    selected.push([x,y,scores[index]]);if(selected.length===cap)break;
  }
  return selected;
}
export function harrisReference(rgb:Uint8Array,k:number){
  const gray=grayscale(rgb,true),scores=new Float64Array(width*height),condition=new Float64Array(width*height);
  for(let y=4;y<height-4;y++)for(let x=4;x<width-4;x++){
    let xx=0,yy=0,xy=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const p=(y+dy)*width+x+dx,gx=(gray[p+1]-gray[p-1])/2,gy=(gray[p+width]-gray[p-width])/2;
      xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;
    }
    xx/=25;yy/=25;xy/=25;const trace=xx+yy,p=y*width+x;
    scores[p]=xx*yy-xy*xy-k*(trace*trace);
    condition[p]=Math.abs(xx*yy)+xy*xy+Math.abs(k)*(trace*trace);
  }
  return {scores,condition:Array.from(condition),features:rankedFeatures(scores,1e-9,.01,1e12,3,240,0),bits:scoreBits(scores),expectedBits:scoreBits(scores)};
}
export function fastReference(rgb:Uint8Array,threshold:number,cap:number){
  const gray=grayscale(rgb,false),scores=new Float64Array(width*height);
  const circle=[[0,-3],[1,-3],[2,-2],[3,-1],[3,0],[3,1],[2,2],[1,3],[0,3],[-1,3],[-2,2],[-3,1],[-3,0],[-3,-1],[-2,-2],[-1,-3]];
  for(let y=3;y<height-3;y++)for(let x=3;x<width-3;x++){
    const center=gray[y*width+x],differences=circle.map(([dx,dy])=>gray[(y+dy)*width+x+dx]-center);let response=0;
    for(let start=0;start<16;start++){
      let low=differences[start],high=low;
      for(let offset=1;offset<9;offset++){const value=differences[(start+offset)%16];low=low<value?low:value;high=high>value?high:value;}
      const dark=-high,arc=low>dark?low:dark;response=response>arc?response:arc;
    }
    scores[y*width+x]=response;
  }
  return {scores,bits:scoreBits(scores),features:rankedFeatures(scores,threshold,0,1e8,3,cap,3)};
}
export function gridReference(spacing:number,cap:number){
  const scores=new Float64Array(width*height).fill(1),features:number[][]=[];
  for(let y=5;y<height-5;y+=spacing)for(let x=5;x<width-5;x+=spacing){features.push([x,y,1]);if(features.length===cap)return {scores,bits:scoreBits(scores),features};}
  return {scores,bits:scoreBits(scores),features};
}
// A separate direct WASM instance checks portable memory/packet replay. It is
// not a claim of acceptance in any external native host or a complete SLAM run.
export function replayRasterArtifact(artifact:{wasmBase64:string;inputOffset:number;scoreOffset:number},rgb:Uint8Array){
  const instance=new WebAssembly.Instance(new WebAssembly.Module(Buffer.from(artifact.wasmBase64,'base64')),{});
  const memory=instance.exports.memory as WebAssembly.Memory,inputs=new Float64Array(memory.buffer,artifact.inputOffset,43_200);
  for(let i=0;i<inputs.length;i++)inputs[i]=rgb[4*Math.floor(i/3)+i%3];
  (instance.exports.evaluate as (time:number)=>void)(0);
  return scoreBits(new Float64Array(memory.buffer,artifact.scoreOffset,14_400));
}
