// Independent integer-domain oracle over actual retained Modelica execution.
// Usage: node dev/check-modelica-schmidt-pair-exact-oracle.mjs <receipt-directory>
// The directory must retain pair-debug2.csv from the same compiled model.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.argv[2];
if(!directory)throw Error('Expected a retained Schmidt capture receipt directory');
const sha=value=>createHash('sha256').update(value).digest('hex');
const reportFile=path.join(directory,'report.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
const raw=fs.readFileSync(path.join(directory,'pair-debug2.csv'),'utf8');
const lines=raw.trim().split(/\r?\n/),columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
const required=['time','pairScenario','pairValid','pairEligible','pairFresh','pairReference.valid',
  'pairReference.eligible','pairReference.captureFresh','pairReference.currentEpoch',
  'pairReference.referenceEpoch','pairReference.lastUsedEpoch'];
if(columns.length!==required.length||!required.every(name=>columns.includes(name)))throw Error('Unexpected diagnostic CSV columns');
const index=name=>columns.indexOf(name);
const fixturePath='tests/modelica/SchmidtCaptureFunctionParity.mo';
const fixture=fs.readFileSync(path.join(directory,'sources',fixturePath),'utf8');
if(sha(fixture)!==report.sources.find(source=>source.path===fixturePath)?.sha256)throw Error('Fixture identity mismatch');
const tableText=fixture.split('parameter Real pairCases[20,8]={')[1]?.split('};')[0];
if(!tableText)throw Error('Missing independently specified pair input inventory');
const table=[...tableText.matchAll(/\{([^{}]+)\}/g)].map(match=>match[1].split(',').map(value=>value.trim()));
if(table.length!==20||table.some(row=>row.length!==8))throw Error('Unexpected pair input inventory');

// Parse exact decimal integers without passing epoch comparisons through f64.
function integer(text){
  const match=/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if(!match)return undefined;
  const digits=match[2]+(match[3]??''),power=Number(match[4]??0)-(match[3]?.length??0);
  if(Math.abs(power)>200)return undefined;
  const value=BigInt(digits),scale=10n**BigInt(Math.abs(power));
  if(power<0&&value%scale!==0n)return undefined;
  return (match[1]==='-'?-1n:1n)*(power<0?value/scale:value*scale);
}
const limit=9007199254740991n;
const inRange=(value,minimum)=>value!==undefined&&value>=minimum&&value<=limit;
function oracle(available,used,reference,current,last){
  const flags=(available===0||available===1)&&(used===0||used===1);
  const epochs=inRange(current,0n)&&inRange(last,-1n);
  const referenceValid=inRange(reference,0n);
  const valid=flags&&epochs&&((available===0&&used===0)||(available===1&&referenceValid
    &&((used===0&&reference>last)||(used===1&&reference<=last))));
  return [Number(valid),Number(valid&&available===1&&used===0&&current>reference),
    Number(valid&&current>last&&(available===0||current>reference))];
}
const records=[];
for(const line of lines.slice(1)){
  const row=line.split(',');
  if(row.length!==columns.length||row.some(value=>!Number.isFinite(Number(value))))throw Error('Malformed diagnostic row');
  const scenario=Number(row[index('pairScenario')]);
  if(!Number.isInteger(scenario)||scenario<1||scenario>20)throw Error('Invalid scenario');
  const input=table[scenario-1];
  const current=integer(row[index('pairReference.currentEpoch')]);
  const reference=integer(row[index('pairReference.referenceEpoch')]);
  const last=integer(row[index('pairReference.lastUsedEpoch')]);
  for(const [column,source] of [['pairReference.referenceEpoch',input[2]],['pairReference.currentEpoch',input[3]],['pairReference.lastUsedEpoch',input[4]]]){
    if(Number(row[index(column)])!==Number(source))throw Error('Executed epoch does not match source scenario');
    if(integer(source)!==undefined&&integer(source)!==integer(row[index(column)]))throw Error('Exact executed epoch mismatch');
  }
  const expected=oracle(Number(input[0]),Number(input[1]),reference,current,last);
  const actual=['pairValid','pairEligible','pairFresh'].map(name=>Number(row[index(name)]));
  const equation=['pairReference.valid','pairReference.eligible','pairReference.captureFresh'].map(name=>Number(row[index(name)]));
  records.push({time:Number(row[index('time')]),scenario,expected,actual,equation,
    functionMatches:JSON.stringify(actual)===JSON.stringify(expected),equationMatches:JSON.stringify(equation)===JSON.stringify(expected)});
}
const scenarios=[...new Set(records.map(row=>row.scenario))].sort((a,b)=>a-b);
const complete=records.length>=81&&records[0].time===0&&records.at(-1).time===20
  &&JSON.stringify(scenarios)===JSON.stringify(Array.from({length:20},(_,i)=>i+1));
const gaps=scenarios.filter(scenario=>records.some(row=>row.scenario===scenario&&!row.equationMatches));
const success=complete&&report.bookendsEqual===true&&report.processStatus===0
  &&report.checks.length===4&&report.checks.slice(0,3).every(value=>value===true)&&records.every(row=>row.functionMatches);
const result={schemaVersion:1,status:success?'EXACT_PAIR_ORACLE_PASS_WITH_RETAINED_EQUATION_REFERENCE_GAP':'FAILED_OR_INCOMPLETE',
  scope:'Independent BigInt epoch-domain oracle over actual pure Modelica helper results; full capture reference checks retained. Original equation-model discrepancy at adjacent upper-limit epochs remains unqualified and is not replaced or hidden.',
  referenceReportSha256:sha(fs.readFileSync(reportFile)),rawDiagnosticSha256:sha(raw),fixtureSha256:sha(fixture),
  oracleSourceSha256:sha(fs.readFileSync(new URL(import.meta.url))),rows:records.length,scenarios,
  captureReferenceChecksPassed:report.checks.slice(0,3).every(Boolean),functionExactPolicyPassed:records.every(row=>row.functionMatches),
  equationReferenceParityPassed:gaps.length===0,equationReferenceGapScenarios:gaps,
  exactLimit:records.filter(row=>row.scenario===15),success,compilerInvoked:false,browserIntegrated:false};
fs.writeFileSync(path.join(directory,'exact-pair-oracle.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));process.exitCode=success?0:1;
