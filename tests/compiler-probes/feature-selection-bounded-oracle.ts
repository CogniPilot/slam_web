// Test-only numerical oracles. Production selection remains Modelica source.
export type SelectionSettings = [number,number,number,number,number,number,number,number];
export type SelectedFeature = [number,number,number];
export type SelectionResult = {valid:number;features:SelectedFeature[];scoreReads:number[];maximumSift:number};
type Candidate = {index:number;rank:number};
export type SelectionGeometry = {width:number;height:number;minimumBorder:number};
export const fullGeometry:SelectionGeometry={width:160,height:90,minimumBorder:0};

function settingsValid(p:SelectionSettings,g:SelectionGeometry,grid:boolean){
  const [a,r,s,radius,cap,spacing,border,start]=p;
  return a>=0&&a<=255&&r>=0&&r<=1&&s>=1&&s<=1e12&&
    radius>=0&&radius<=16&&Math.floor(radius)===radius&&
    cap>=1&&cap<=g.width*g.height&&Math.floor(cap)===cap&&
    spacing>=1&&spacing<=g.width&&Math.floor(spacing)===spacing&&
    border>=g.minimumBorder&&border<=Math.floor((g.height-1)/2)&&Math.floor(border)===border&&
    start>=border&&start<g.height-border&&Math.floor(start)===start&&
    (!grid||(a===0&&r===0&&s===1&&radius===0));
}
function evenRound(v:number){const lo=Math.floor(v),f=v-lo;return f<.5?lo:f>.5?lo+1:lo-Math.floor(lo/2)*2===0?lo:lo+1;}
function greater(a:Candidate,b:Candidate){return a.rank>b.rank||(a.rank===b.rank&&a.index<b.index);}

function heapOrder(input:Candidate[],fullSize:number,bounded:boolean){
  const a=input.slice(),n=a.length,levels=Math.ceil(Math.log2(fullSize));let maximumSift=0;
  const sift=(initial:number,size:number)=>{
    let root=initial,descending=true,trips=0;
    const body=()=>{
      let child=2*root+1;
      if(child+1<size&&greater(a[child+1],a[child]))child++;
      if(greater(a[child],a[root])){[a[root],a[child]]=[a[child],a[root]];root=child;}
      else descending=false;
      trips++;
    };
    if(bounded){for(let level=0;level<levels;level++)if(root<Math.floor(size/2)&&descending)body();}
    else while(root<Math.floor(size/2)&&descending)body();
    if(root<Math.floor(size/2)&&descending)throw new Error('incomplete bounded heap sift');
    maximumSift=Math.max(maximumSift,trips);
  };
  for(let build=0;build<n;build++)sift(n-build-1,n);
  for(let remove=0;remove<n;remove++){
    const size=n-remove;[a[size-1],a[0]]=[a[0],a[size-1]];sift(0,size-1);
  }
  return {ordered:a.reverse(),maximumSift};
}

// Independent specification: direct stable sorting and geometric suppression.
// The original-source control uses its while heap and occupied-array writes;
// the bounded control uses full raster eligibility, finite sifts and33x33 writes.
export function selectionOracle(
  scores:number[],p:SelectionSettings,grid=false,
  mode:'specification'|'original'|'bounded'='specification',g:SelectionGeometry=fullGeometry,
):SelectionResult{
  const result:SelectionResult={valid:0,features:[],scoreReads:[],maximumSift:0};
  if(scores.length!==g.width*g.height)throw new Error('actual score shape mismatch');
  if(!settingsValid(p,g,grid))return result;
  result.valid=1;
  const [absolute,relative,scale,radius,cap,spacing,border,start]=p;
  let maximum=0;
  if(!grid){
    for(let i=0;i<scores.length;i++){
      result.scoreReads.push(i);
      if(Math.abs(scores[i]*scale)<=Number.MAX_SAFE_INTEGER)maximum=Math.max(maximum,scores[i]);
      else result.valid=0;
    }
    if(!result.valid)return result;
  }
  const threshold=Math.max(absolute,maximum*relative),guard=Math.floor(threshold*scale)-1;
  const candidates:Candidate[]=[];
  const visit=(x:number,y:number)=>{
    const index=y*g.width+x;
    if(grid){
      if(result.features.length>=cap)return;
      result.scoreReads.push(index);
      if(Math.abs(scores[index])<=Number.MAX_VALUE)result.features.push([x,y,scores[index]]);
      else result.valid=0;
    }else{
      const rank=evenRound(scores[index]*scale);
      if(rank>=guard)candidates.push({index,rank});
    }
  };
  if(mode==='bounded'){
    for(let index=0;index<scores.length;index++){
      const x=index%g.width,y=Math.floor(index/g.width);
      if(x>=start&&y>=start&&x<g.width-border&&y<g.height-border&&
        (x-start)%spacing===0&&(y-start)%spacing===0)visit(x,y);
    }
  }else{
    for(let y=start;y<g.height-border&&(!grid||result.features.length<cap);y+=spacing)
      for(let x=start;x<g.width-border&&(!grid||result.features.length<cap);x+=spacing)visit(x,y);
  }
  if(grid){if(!result.valid)result.features=[];return result;}
  let ordered:Candidate[];
  if(mode==='specification')ordered=candidates.sort((a,b)=>b.rank-a.rank||a.index-b.index);
  else{const heap=heapOrder(candidates,scores.length,mode==='bounded');ordered=heap.ordered;result.maximumSift=heap.maximumSift;}
  const occupied=new Uint8Array(scores.length);
  for(const candidate of ordered){
    if(scores[candidate.index]<threshold)break;
    if(result.features.length>=cap)continue;
    const x=candidate.index%g.width,y=Math.floor(candidate.index/g.width);
    if(mode==='specification'){
      if(radius>0&&result.features.some(([px,py])=>Math.abs(px-x)<=radius&&Math.abs(py-y)<=radius))continue;
    }else if(occupied[candidate.index])continue;
    result.features.push([x,y,scores[candidate.index]]);
    if(mode==='original'){
      for(let yy=Math.max(border,y-radius);yy<=Math.min(g.height-border-1,y+radius);yy++)
        for(let xx=Math.max(border,x-radius);xx<=Math.min(g.width-border-1,x+radius);xx++)occupied[yy*g.width+xx]=1;
    }else if(mode==='bounded'){
      for(let offset=0;offset<1089;offset++){
        const dx=offset%33-16,dy=Math.floor(offset/33)-16,xx=x+dx,yy=y+dy;
        if(Math.abs(dx)<=radius&&Math.abs(dy)<=radius&&xx>=border&&xx<g.width-border&&yy>=border&&yy<g.height-border)
          occupied[yy*g.width+xx]=1;
      }
    }
  }
  return result;
}
