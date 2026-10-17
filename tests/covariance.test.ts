import {it,expect} from 'vitest';
import {covarianceAxes,uncertaintySummary,vectorNorm} from '../src/covariance';
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
it('summarizes position spread from the covariance trace and leaves unreported biases blank',()=>{
  const uncertainty={positionCovariance:[4,1,0,1,9,0,0,0,12],attitudeCovariance:Array(9).fill(0)};
  expect(uncertaintySummary({uncertainty})).toBe('Position σ trace norm 5.000 m · accelerometer bias n/a · gyro bias n/a');
  expect(uncertaintySummary({uncertainty,diagnostics:{accelBiasNorm:.01,gyroBiasNorm:.002}}))
    .toBe('Position σ trace norm 5.000 m · accelerometer bias 0.0100 m/s² · gyro bias 0.00200 rad/s');
});
it('reports a bias norm only for a finite 3-vector',()=>{
  expect(vectorNorm([3,4,0])).toBe(5);
  expect(vectorNorm(new Float64Array([0,0,2]))).toBe(2);
  expect(vectorNorm(undefined)).toBeUndefined();
  expect(vectorNorm([1,2])).toBeUndefined();
  expect(vectorNorm([1,Number.NaN,0])).toBeUndefined();
});
