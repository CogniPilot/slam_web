import {modelParameterDeclarations,parameterLabel} from '../src/modelica-parameter-declarations.mjs';

/** Every Dialog-annotated tuning input is discovered from Modelica. Record
 * leaves, array shapes, storage types and evaluated defaults come from Rumoca. */
export function nativeParameterMetadata(declarations,layout,files){
  const viewFor=slot=>{
    const bytes=files[slot.lane==='f64'?'p.bin':'lanes.bin'];
    return {view:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset:slot.offset-(slot.lane==='f64'?layout.p_offset:layout.typed_offset)};
  };
  const result=[];
  for(const declaration of declarations.filter(d=>d.kind==='input'&&d.group)){
    for(const [slotName,slot]of Object.entries(layout.inputs)){
      if(slotName!==declaration.name&&!slotName.startsWith(declaration.name+'.'))continue;
      const {view,offset}=viewFor(slot);
      for(let index=0;index<slot.count;index++){
        const name=slotName+(slot.count>1?`[${index+1}]`:''),at=offset+index*(slot.lane==='u8'?1:8);
        const value=slot.lane==='f64'?view.getFloat64(at,true):slot.lane==='i64'?Number(view.getBigInt64(at,true)):view.getUint8(at);
        if(!Number.isFinite(value))throw Error(`Nonfinite native default ${name}`);
        const suffix=slotName.slice(declaration.name.length+1),parts=suffix.split('.');parts.pop();
        result.push({...declaration,name,label:slotName===declaration.name?declaration.label:parameterLabel(suffix.split('.').at(-1)),
          type:slot.lane==='u8'?'Boolean':slot.lane==='i64'?'Integer':'Real',defaultValue:value,slot:slotName,index,
          group:[declaration.group,...parts].filter(Boolean).join(' / ')});
      }
    }
  }
  return result;
}
