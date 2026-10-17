import type {Estimate} from './types';
/** Symmetric 3×3 eigensystem, columns of basis correspond to variances. */
export function covarianceAxes(values:number[]) {
  if(values.length!==9||!values.every(Number.isFinite))throw new Error('Expected finite 3×3 covariance');
  const a=values.slice(),basis=[1,0,0,0,1,0,0,0,1];
  const scale=Math.max(1,...a.map(Math.abs));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(a[i*3+j]-a[j*3+i])>scale*1e-8)throw new Error('Covariance must be symmetric');
  for(let iteration=0;iteration<30;iteration++) {
    let p=0,q=1;
    for(const [i,j] of [[0,2],[1,2]])if(Math.abs(a[i*3+j])>Math.abs(a[p*3+q])){p=i;q=j;}
    if(Math.abs(a[p*3+q])<scale*1e-14)break;
    const angle=.5*Math.atan2(2*a[p*3+q],a[q*3+q]-a[p*3+p]),c=Math.cos(angle),s=Math.sin(angle);
    const app=a[p*3+p],aqq=a[q*3+q],apq=a[p*3+q];
    for(let k=0;k<3;k++)if(k!==p&&k!==q){const x=a[k*3+p],y=a[k*3+q];a[k*3+p]=a[p*3+k]=c*x-s*y;a[k*3+q]=a[q*3+k]=s*x+c*y;}
    a[p*3+p]=c*c*app-2*c*s*apq+s*s*aqq;a[q*3+q]=s*s*app+2*c*s*apq+c*c*aqq;a[p*3+q]=a[q*3+p]=0;
    for(let k=0;k<3;k++){const x=basis[k*3+p],y=basis[k*3+q];basis[k*3+p]=c*x-s*y;basis[k*3+q]=s*x+c*y;}
  }
  const variances=[a[0],a[4],a[8]];
  if(variances.some(v=>v < -scale*1e-10))throw new Error('Covariance must be positive semidefinite');
  return {variances:variances.map(v=>Math.max(0,v)),basis};
}

/** Euclidean norm of a 3-vector state, or undefined when the estimator does not report one. */
export function vectorNorm(values:ArrayLike<number|bigint>|undefined) {
  if(values?.length!==3)return undefined;
  const norm=Math.hypot(...Array.from(values,Number));
  return Number.isFinite(norm)?norm:undefined;
}
const reading=(value:number|string|undefined,digits:number,unit:string)=>typeof value==='number'&&Number.isFinite(value)?`${value.toFixed(digits)} ${unit}`:'n/a';
export function uncertaintySummary(estimate:Pick<Estimate,'uncertainty'|'diagnostics'>) {
  const p=estimate.uncertainty?.positionCovariance;
  const positionStd=p?.length===9?Math.sqrt(Math.max(0,p[0]+p[4]+p[8])):undefined;
  return `Position σ trace norm ${reading(positionStd,3,'m')} · accelerometer bias ${reading(estimate.diagnostics?.accelBiasNorm,4,'m/s²')} · gyro bias ${reading(estimate.diagnostics?.gyroBiasNorm,5,'rad/s')}`;
}
