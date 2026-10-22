// Closed four-corridor reference; controller, rigid body and motor dynamics remain active.
package OfficeLoopProfile
  function Progress
    input Real t; input Real startTime; input Real duration; output Real value;
  protected Real s;
  algorithm
    s := min(1,max(0,(t-startTime)/duration));
    value := 10*s*s*s-15*s*s*s*s+6*s*s*s*s*s;
  end Progress;
  function Speed
    input Real t; input Real startTime; input Real duration; output Real value;
  protected Real s;
  algorithm
    s := min(1,max(0,(t-startTime)/duration));
    value := (30*s*s-60*s*s*s+30*s*s*s*s)/duration;
  end Speed;
  function Accel
    input Real t; input Real startTime; input Real duration; output Real value;
  protected Real s;
  algorithm
    s := min(1,max(0,(t-startTime)/duration));
    value := (60*s-180*s*s+120*s*s*s)/(duration*duration);
  end Accel;
  function X
    input Real t; output Real value;
  algorithm value := 24*(Progress(t,5,60)-Progress(t,125,60)); end X;
  function Y
    input Real t; output Real value;
  algorithm value := 16*(Progress(t,75,40)-Progress(t,195,40)); end Y;
  function VX
    input Real t; output Real value;
  algorithm value := 24*(Speed(t,5,60)-Speed(t,125,60)); end VX;
  function VY
    input Real t; output Real value;
  algorithm value := 16*(Speed(t,75,40)-Speed(t,195,40)); end VY;
  function AX
    input Real t; output Real value;
  algorithm value := 24*(Accel(t,5,60)-Accel(t,125,60)); end AX;
  function AY
    input Real t; output Real value;
  algorithm value := 16*(Accel(t,75,40)-Accel(t,195,40)); end AY;
  function Heading
    input Real t; output Real value;
  algorithm value := (3.141592653589793/2)*(Progress(t,65,10)+Progress(t,115,10)+Progress(t,185,10)+Progress(t,235,10)); end Heading;
end OfficeLoopProfile;
