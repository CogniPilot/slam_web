import type {LoopClosureHistory,KeyframeImage} from './loop-closure-history';

export function mountLoopClosurePanel(container:HTMLElement){
  const panel=document.createElement('details');panel.className='panel loop-closure-panel';panel.open=true;
  const title=document.createElement('summary');title.textContent='Loop closures';
  const state=document.createElement('div');state.id='loop-closure-state';state.setAttribute('aria-live','polite');
  const history=document.createElement('div');history.className='loop-closure-history';
  const note=document.createElement('small');note.textContent='Orange trajectory edges connect geometrically verified keyframes. Similarity and candidate counts appear when reported by the estimator.';
  panel.append(title,state,history,note);container.append(panel);
  let previous:LoopClosureHistory|undefined,revision=-1;
  const image=(snapshot:KeyframeImage|undefined,label:string,id:number)=>{
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');
    caption.textContent=`${label} · keyframe ${id}${snapshot?` · ${snapshot.time.toFixed(2)} s`:''}`;
    if(snapshot){
      const canvas=document.createElement('canvas');canvas.width=snapshot.width;canvas.height=snapshot.height;canvas.setAttribute('aria-label',caption.textContent);
      const context=canvas.getContext('2d');if(context){const pixels=context.createImageData(snapshot.width,snapshot.height);pixels.data.set(snapshot.rgba);context.putImageData(pixels,0,0);}
      figure.append(canvas);
    }else{const missing=document.createElement('span');missing.textContent='Image unavailable';figure.append(missing);}
    figure.append(caption);return figure;
  };
  return {render(model:LoopClosureHistory,vocabularyReady?:number,words?:number,visual=false){
    const text=visual?`${model.acceptedCount} verified closures · ${model.candidateCount===undefined?'candidate count unavailable':`${model.candidateCount} retrieved candidates`}${words===undefined?'':` · ${words} visual words`}${vocabularyReady===0?' · learning vocabulary':''}`:
      'Visual loop closure is inactive. Select Native Modelica SLAM in Configuration to enable RGB-D mapping.';
    if(state.textContent!==text)state.textContent=text;
    if(previous===model&&revision===model.revision)return;
    previous=model;revision=model.revision;
    const cards=model.closures.map(closure=>{
      const card=document.createElement('article'),heading=document.createElement('div');
      heading.textContent=`Closure ${closure.edgeId} · t=${closure.time.toFixed(2)} s · ${closure.similarity===undefined?'similarity unavailable':`similarity ${closure.similarity.toFixed(3)}`}`;
      const pair=document.createElement('div');pair.className='loop-closure-pair';
      pair.append(image(closure.reference,'Matched',closure.referenceId),image(closure.current,'Current',closure.currentId));
      card.append(heading,pair);return card;
    });
    history.replaceChildren(...cards);
  }};
}
