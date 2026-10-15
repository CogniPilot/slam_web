import type {LoopClosureHistory,KeyframeImage,ClosureImage,LoopCandidateDecision} from './loop-closure-history';

export function mountLoopClosurePanel(container:HTMLElement){
  const panel=document.createElement('details');panel.className='panel loop-closure-panel';panel.open=true;
  const title=document.createElement('summary');title.textContent='Loop closures';
  const state=document.createElement('div');state.id='loop-closure-state';state.setAttribute('aria-live','polite');
  const history=document.createElement('div');history.className='loop-closure-history';
  const acceptedTitle=document.createElement('h3');acceptedTitle.textContent='Committed loop closures';
  const decisionsTitle=document.createElement('h3');decisionsTitle.textContent='Candidate decisions';
  const decisionState=document.createElement('p');decisionState.className='loop-decision-state';
  const filter=document.createElement('select');filter.setAttribute('aria-label','Loop candidate filter');
  for(const [value,label] of [['all','All decisions'],['rejected','Rejected / not added'],['accepted','Committed']])filter.add(new Option(label,value));
  const attempts=document.createElement('div');attempts.className='loop-closure-history loop-candidate-history';
  const note=document.createElement('small');note.textContent='Appearance retrieval, geometric verification and graph admission are separate stages. Reasons and fit statistics come from the Modelica estimator; missing measurements are not estimated by the viewer.';
  panel.append(title,state,acceptedTitle,history,decisionsTitle,decisionState,filter,attempts,note);container.append(panel);
  let previous:LoopClosureHistory|undefined,revision=-1;
  const closureCards=new Map<ClosureImage,HTMLElement>(),candidateCards=new Map<LoopCandidateDecision,HTMLElement>();
  const image=(snapshot:KeyframeImage|undefined,label:string,id:number,keyframe=true)=>{
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');
    caption.textContent=`${label} · ${keyframe?'keyframe':'frame'} ${keyframe?id:snapshot?.imageEpoch??id}${snapshot?` · ${snapshot.time.toFixed(2)} s`:''}`;
    if(snapshot){
      const canvas=document.createElement('canvas');canvas.width=snapshot.width;canvas.height=snapshot.height;canvas.setAttribute('aria-label',caption.textContent);
      const context=canvas.getContext('2d');if(context){const pixels=context.createImageData(snapshot.width,snapshot.height);pixels.data.set(snapshot.rgba);context.putImageData(pixels,0,0);}
      figure.append(canvas);
    }else{const missing=document.createElement('span');missing.textContent='Image unavailable';figure.append(missing);}
    figure.append(caption);return figure;
  };
  let lastOptions:{vocabularyReady?:number;words?:number;visual:boolean}={visual:false};
  const api={render(model:LoopClosureHistory,vocabularyReady?:number,words?:number,visual=false){
    lastOptions={vocabularyReady,words,visual};
    const text=visual?`${model.acceptedCount} verified closures · ${model.candidateCount===undefined?'candidate count unavailable':`${model.candidateCount} retrieved candidates`}${model.detailsAvailable?` · ${model.rejectedCount} rejected / not added`:''}${words===undefined?'':` · ${words} visual words`}${vocabularyReady===0?' · learning vocabulary':''}`:
      'Visual loop closure is inactive. Select Native Modelica SLAM in Configuration to enable RGB-D mapping.';
    if(state.textContent!==text)state.textContent=text;
    const decision=visual?`${model.lastDecision}${model.detailsAvailable?'':' · Per-candidate rejection diagnostics unavailable in this model build.'}`:'Enable RGB-D SLAM to inspect loop candidates.';
    if(decisionState.textContent!==decision)decisionState.textContent=decision;
    if(previous===model&&revision===model.revision)return;
    previous=model;revision=model.revision;
    for(const key of closureCards.keys())if(!model.closures.includes(key))closureCards.delete(key);
    for(const key of candidateCards.keys())if(!model.attempts.includes(key))candidateCards.delete(key);
    const cards=model.closures.map(closure=>{
      const retained=closureCards.get(closure);if(retained)return retained;
      const card=document.createElement('article'),heading=document.createElement('div');
      heading.textContent=`Closure ${closure.edgeId} · t=${closure.time.toFixed(2)} s · ${closure.similarity===undefined?'similarity unavailable':`similarity ${closure.similarity.toFixed(3)}`}`;
      const pair=document.createElement('div');pair.className='loop-closure-pair';
      pair.append(image(closure.reference,'Matched',closure.referenceId),image(closure.current,'Current',closure.currentId));
      card.append(heading,pair);closureCards.set(closure,card);return card;
    });
    history.replaceChildren(...cards);
    const decisions=model.attempts.filter(candidate=>filter.value==='all'||(filter.value==='accepted'?candidate.status==='accepted':candidate.status!=='accepted'));
    attempts.replaceChildren(...decisions.map(candidate=>{
      const retained=candidateCards.get(candidate);if(retained)return retained;
      const card=document.createElement('article');card.dataset.status=candidate.status;
      const heading=document.createElement('strong');heading.textContent=`${candidate.status==='accepted'?'Committed':candidate.status==='rejected'?'Rejected':'Not added'} · t=${candidate.time.toFixed(2)} s`;
      const reason=document.createElement('p');reason.textContent=candidate.reason;
      const metrics=document.createElement('p');metrics.className='loop-candidate-metrics';
      metrics.textContent=[`Similarity ${candidate.score.toFixed(3)}`,candidate.matchedCount===undefined?undefined:`${candidate.matchedCount} descriptor matches`,candidate.inlierCount===undefined?undefined:`${candidate.inlierCount} inliers`,candidate.rms===undefined?undefined:`Model RMS ${candidate.rms.toPrecision(3)}`].filter(Boolean).join(' · ');
      const pair=document.createElement('div');pair.className='loop-closure-pair';
      pair.append(image(candidate.reference,'Reference',candidate.referenceId),image(candidate.current,'Current',candidate.sequence,false));
      card.append(heading,reason,metrics,pair);candidateCards.set(candidate,card);return card;
    }));
  }};
  filter.onchange=()=>{if(previous){revision=-1;api.render(previous,lastOptions.vocabularyReady,lastOptions.words,lastOptions.visual);}};
  return api;
}
