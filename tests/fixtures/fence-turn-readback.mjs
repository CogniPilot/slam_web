// Diagnostic browser route only: four yielded fence probes before timer backoff.
export function moreFenceTurns(source){
  const changes=[
    ['if (attempts++ === 0)','if (attempts++ < 4)'],
    ['channel = new MessageChannel();','channel ??= new MessageChannel();'],
    ['Math.min(attempts - 1, 4)','Math.min(attempts - 4, 4)'],
  ];
  for(const [before,after]of changes){
    if(source.split(before).length!==2)throw Error('Expected one fence polling site: '+before);
    source=source.replace(before,after);
  }
  return source;
}
