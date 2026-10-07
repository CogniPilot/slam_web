import {it,expect} from 'vitest';
import {covarianceAxes} from '../src/covariance';
it('reconstructs rotated covariance including off-diagonal terms and singular axes',()=>{
  for(const values of [[1,.8,0,.8,1,0,0,0,.01],[0,0,0,0,4,0,0,0,9],[4,1,2,1,3,.2,2,.2,5]]) {
    const {variances,basis}=covarianceAxes(values);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++) {
      const reconstructed=variances.reduce((sum,v,k)=>sum+v*basis[i*3+k]*basis[j*3+k],0);
      expect(reconstructed).toBeCloseTo(values[i*3+j],10);
    }
  }
  expect(()=>covarianceAxes([1,0,0,0,-1,0,0,0,1])).toThrow('positive');
  expect(()=>covarianceAxes([1,1,0,0,1,0,0,0,1])).toThrow('symmetric');
});
