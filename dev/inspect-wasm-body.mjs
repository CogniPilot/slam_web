// Inspect original WASM metadata/bytes only. No compilation, rewriting or execution.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [moduleFile,indexText,disassemblyFile,reportFile]=process.argv.slice(2);
const index=Number(indexText);
if(!reportFile||!Number.isSafeInteger(index)||index<0)throw Error('Expected MODULE FUNCTION_INDEX DISASSEMBLY REPORT');
const bytes=fs.readFileSync(moduleFile),text=fs.readFileSync(disassemblyFile,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
let position=8;
if(bytes.subarray(0,8).toString('hex')!=='0061736d01000000')throw Error('Expected a WASM v1 module');
function unsigned(){
  let value=0,shift=0,byte;
  do{
    if(position>=bytes.length||shift>28)throw Error('Invalid u32 LEB encoding');
    byte=bytes[position++];value+=(byte&127)*2**shift;shift+=7;
  }while(byte&128);
  if(value>0xffffffff)throw Error('u32 overflow');return value;
}
function name(){const length=unsigned(),end=position+length;
  if(end>bytes.length)throw Error('Truncated name');const result=bytes.toString('utf8',position,end);position=end;return result;}
function limits(){const flags=unsigned();if(flags&~3)throw Error('Unsupported limits encoding');unsigned();if(flags&1)unsigned();}
function valueType(){const code=bytes[position++];if(![0x7f,0x7e,0x7d,0x7c,0x70,0x6f].includes(code))throw Error('Unsupported value type');return code;}
const sections=new Map();
while(position<bytes.length){const id=bytes[position++],size=unsigned(),start=position,end=start+size;
  if(end>bytes.length||id!==0&&sections.has(id))throw Error('Invalid section inventory');
  if(id!==0)sections.set(id,{start,end});position=end;}
position=sections.get(2)?.start??0;let importedFunctions=0;
if(sections.has(2))for(let count=unsigned();count>0;count--){
  name();name();const kind=bytes[position++];
  if(kind===0){unsigned();importedFunctions++;}
  else if(kind===1){valueType();limits();}
  else if(kind===2)limits();
  else if(kind===3){valueType();position++;}
  else if(kind===4){unsigned();unsigned();}
  else throw Error('Unknown import kind');
}
if(index<importedFunctions)throw Error('Requested function is imported');
const definedIndex=index-importedFunctions;
position=sections.get(3).start;const definitionCount=unsigned();let typeIndex;
for(let ordinal=0;ordinal<definitionCount;ordinal++){const current=unsigned();if(ordinal===definedIndex)typeIndex=current;}
if(typeIndex===undefined)throw Error('Function index outside module');
position=sections.get(1).start;const typeCount=unsigned();let signature;
for(let ordinal=0;ordinal<typeCount;ordinal++){
  if(bytes[position++]!==0x60)throw Error('Unsupported non-function type');
  const parameters=Array.from({length:unsigned()},valueType),results=Array.from({length:unsigned()},valueType);
  if(ordinal===typeIndex)signature={parameters,results};
}
position=sections.get(10).start;const bodyCount=unsigned();
if(bodyCount!==definitionCount)throw Error('Function/code inventory mismatch');
let body;
for(let ordinal=0;ordinal<bodyCount;ordinal++){const length=unsigned(),start=position,end=start+length;
  if(end>sections.get(10).end)throw Error('Truncated function body');
  if(ordinal===definedIndex){body={start,end,length};break;}position=end;}
const match=text.match(/^([0-9a-f]+) func\[(\d+)\]:/m);
if(!match||Number(match[2])!==index||parseInt(match[1],16)!==body.start)throw Error('Disassembly body identity differs');
position=body.start;const localGroupCount=unsigned(),firstPrintedOffset=position;
let next=firstPrintedOffset,instructionRows=0;
for(const line of text.split('\n')){
  const match=line.match(/^\s*([0-9a-f]+):\s+([^|]+)\|/);if(!match)continue;
  const offset=parseInt(match[1],16),tokens=match[2].trim().split(/\s+/);
  if(offset!==next||!tokens.every(token=>/^[0-9a-f]{2}$/.test(token)))throw Error('Disassembly byte gap or malformed row');
  const row=Buffer.from(tokens.map(token=>parseInt(token,16)));
  if(offset+row.length>body.end||!row.equals(bytes.subarray(offset,offset+row.length)))throw Error('Disassembly bytes differ from original module');
  next+=row.length;instructionRows++;
}
if(next!==body.end)throw Error('Disassembly did not reach exact function end');
const report={status:'ORIGINAL_WASM_FUNCTION_BODY_AND_DISASSEMBLY_VERIFIED',moduleSha256:sha(bytes),functionIndex:index,
  importedFunctions,definedIndex,typeIndex,signature,body,localGroupCount,instructionRows,
  bodySha256:sha(bytes.subarray(body.start,body.end)),disassemblySha256:sha(text),inspectorSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Exact original module bytes and complete selected function disassembly, independently of whole-disassembler completion. No source-symbol attribution, compiler modification or numerical execution.'};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
