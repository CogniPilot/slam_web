/** Startup phases that can stall on constrained browsers (a phone's compiler
 * or rendering worker) fail visibly instead of leaving Run disabled forever.
 * The work itself is not cancelled; a late success still completes it. */
export const VIEWER_READY_DEADLINE_MS=20_000;
export const STARTUP_COMPILE_DEADLINE_MS=180_000;

export class StartupDeadlineError extends Error {
  constructor(readonly phase:string,readonly milliseconds:number,advice?:string){
    super(`${phase} did not finish within ${Math.round(milliseconds/1000)} s${advice?` · ${advice}`:''}`);
    this.name='StartupDeadlineError';
  }
}

export function withDeadline<T>(work:Promise<T>,milliseconds:number,phase:string,advice?:string):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new StartupDeadlineError(phase,milliseconds,advice)),milliseconds);});
  return Promise.race([work,expired]).finally(()=>clearTimeout(timer));
}
