// Ten-minute reference. The real controller/plant follows these targets.
package HallwayProfile
  function RampIntegral
    input Real s; output Real value;
  algorithm value := s*s*s-0.5*s*s*s*s; end RampIntegral;
  function Position
    input Real t; output Real x;
  algorithm
    x := if t <= 5 then 0 else if t < 15 then 5*RampIntegral((t-5)/10)
      else if t < 285 then 2.5+0.5*(t-15)
      else if t < 295 then 137.5+5*((t-285)/10-RampIntegral((t-285)/10))
      else if t < 305 then 140
      else if t < 315 then 140-5*RampIntegral((t-305)/10)
      else if t < 585 then 137.5-0.5*(t-315)
      else if t < 595 then 2.5-5*((t-585)/10-RampIntegral((t-585)/10)) else 0;
  end Position;
  function Velocity
    input Real t; output Real v;
  protected Real s;
  algorithm
    s := if t < 15 then (t-5)/10 else if t < 295 then (t-285)/10
      else if t < 315 then (t-305)/10 else (t-585)/10;
    v := if t <= 5 then 0 else if t < 15 then 0.5*(3*s*s-2*s*s*s)
      else if t < 285 then 0.5 else if t < 295 then 0.5*(1-3*s*s+2*s*s*s)
      else if t < 305 then 0 else if t < 315 then -0.5*(3*s*s-2*s*s*s)
      else if t < 585 then -0.5 else if t < 595 then -0.5*(1-3*s*s+2*s*s*s) else 0;
  end Velocity;
  function Acceleration
    input Real t; output Real a;
  protected Real s;
  algorithm
    s := if t < 15 then (t-5)/10 else if t < 295 then (t-285)/10
      else if t < 315 then (t-305)/10 else (t-585)/10;
    a := if t > 5 and t < 15 then 0.05*(6*s-6*s*s)
      else if t > 285 and t < 295 then -0.05*(6*s-6*s*s)
      else if t > 305 and t < 315 then -0.05*(6*s-6*s*s)
      else if t > 585 and t < 595 then 0.05*(6*s-6*s*s) else 0;
  end Acceleration;
end HallwayProfile;
