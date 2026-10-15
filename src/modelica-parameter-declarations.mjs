// Presentation metadata from compiler-issued declaration locations. Expressions
// are retained as text; the Modelica compiler evaluates parameter values.
function tokens(source,start=0){
  const result=[];const pattern=/\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|./gy;
  pattern.lastIndex=start;let match;
  while((match=pattern.exec(source))){const text=match[0];if(!/^\s|^\/\/|^\/\*/.test(text))result.push({text,start:match.index,end:pattern.lastIndex});}
  return result;
}
const unquote=text=>{try{return JSON.parse(text);}catch{return text.slice(1,-1);}};
const offset=(source,position)=>{let at=0;for(let i=0;i<position.line;i++)at=source.indexOf('\n',at)+1;return at+position.character;};
export const parameterLabel=name=>name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());

export function parameterDeclaration(source,symbol){
  const start=offset(source,symbol.selectionRange.start),all=tokens(source,start);let depth=0,end=all.length;
  const prefix=tokens(source.slice(0,offset(source,symbol.range.start)));let boundary=prefix.length-1;
  while(boundary>=0&&prefix[boundary].text!==';')boundary--;
  const modifiers=prefix.slice(boundary+1);
  const final=modifiers.some(token=>token.text==='final'),constant=modifiers.some(token=>token.text==='constant');
  for(let i=0;i<all.length;i++){
    const t=all[i].text;if(t===';'&&depth===0){end=i;break;}
    if(['(','[','{'].includes(t))depth++;if([')',']','}'].includes(t))depth--;
  }
  const list=all.slice(0,end);let description='',expression='',binding=-1,annotation=-1;depth=0;
  let dimensions=[];
  if(list[1]?.text==='['){let i=2,begin=i,nesting=0;
    for(;i<list.length;i++){const t=list[i].text;if((t===','||t===']')&&nesting===0){dimensions.push(source.slice(list[begin].start,list[i].start).trim());begin=i+1;if(t===']')break;}else if(['(','[','{'].includes(t))nesting++;else if([')',']','}'].includes(t))nesting--;}}
  for(let i=1;i<list.length;i++){
    const t=list[i].text;
    if(depth===0){
      if(t==='='&&binding<0)binding=i+1;
      if(t==='annotation'){annotation=i;break;}
      if(t.startsWith('"')){description=unquote(t);if(binding>=0&&!expression)expression=source.slice(list[binding].start,list[i].start).trim();}
    }
    if(['(','[','{'].includes(t))depth++;if([')',']','}'].includes(t))depth--;
  }
  if(binding>=0&&!expression)expression=source.slice(list[binding].start,annotation>=0?list[annotation].start:list.at(-1).end).trim();
  const attributes={};
  for(let i=0;i<list.length-2;i++)if(list[i+1].text==='='){
    const key=list[i].text,value=list[i+2].text;
    if(['unit','group','tab'].includes(key)&&value.startsWith('"'))attributes[key]=unquote(value);
    if(['min','max'].includes(key)){
      const n=Number(value==='-'?'-'+list[i+3]?.text:value);if(Number.isFinite(n))attributes[key]=n;
    }
  }
  return {name:symbol.name,type:(symbol.detail??'Real').split('[')[0],label:parameterLabel(symbol.name),description,final,...(constant?{constant:true}:{}),
    expression,dimensions,unit:attributes.unit,group:attributes.group,tab:attributes.tab,minValue:attributes.min,maxValue:attributes.max};
}

export function modelParameterDeclarations(source,symbols){
  const result=[];
  function visit(symbol,path=[]){
    if(symbol.name==='Parameters'||symbol.name==='Inputs'){
      for(const child of symbol.children??[])result.push({...parameterDeclaration(source,child),owner:path.join('.'),kind:symbol.name==='Parameters'?'parameter':'input'});
    }else for(const child of symbol.children??[])visit(child,[...path,symbol.name]);
  }
  for(const symbol of symbols)visit(symbol);
  return result;
}
