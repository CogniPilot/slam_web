/** All vehicles finish this acquisition boundary before any advances again. */
export class LockstepBarrier {
  private waiting:{resolve:()=>void;reject:(error:Error)=>void}[]=[];
  private failure?:Error;
  constructor(private readonly count:number,private readonly commit:()=>void=()=>{}){
    if(!Number.isInteger(count)||count<1)throw new Error('A lockstep barrier needs a positive participant count');
  }
  arrive():Promise<void>{
    if(this.failure)return Promise.reject(this.failure);
    return new Promise((resolve,reject)=>{
      this.waiting.push({resolve,reject});
      if(this.waiting.length===this.count){
        try{this.commit();}catch(error){this.abort(error instanceof Error?error:new Error(String(error)));return;}
        const completed=this.waiting;this.waiting=[];
        for(const request of completed)request.resolve();
      }
    });
  }
  abort(error:Error){
    this.failure=error;
    for(const request of this.waiting)request.reject(error);
    this.waiting=[];
  }
}
