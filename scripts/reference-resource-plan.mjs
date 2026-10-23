// Named reference fixture limits; the original wall ceiling cannot be raised.
export function referenceResourcePlan(env=process.env){
  const integer=(name,fallback,minimum,maximum)=>{
    const raw=env[name]??String(fallback),value=Number(raw);
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<minimum||value>maximum)throw Error('Invalid reference limit '+name);
    return value;
  };
  const cpus=env.SLAM_REFERENCE_CPUS??'8,9';
  if(cpus!==''&&(!/^\d+(,\d+)*$/.test(cpus)||new Set(cpus.split(',')).size!==cpus.split(',').length))throw Error('Invalid reference CPU list');
  return {seconds:integer('SLAM_REFERENCE_SECONDS',120,1,120),
    rssMiB:integer('SLAM_REFERENCE_RSS_MIB',8192,256,8192),
    availableMiB:integer('SLAM_REFERENCE_AVAILABLE_MIB',16384,512,16384),
    cpus,ompThreads:1,compilerProcesses:2};
}
