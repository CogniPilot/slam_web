// Two-circuit office reference (design adbad056): the unchanged OfficeLoopProfile flown twice in 250 s.
// Only the command-reference clock is scaled, s = 2t - 250*L with L = 0 before 125 s and 1 after; heading gains 2*pi per lap.
// Velocity and acceleration follow the chain rule (x2 and x4). Physics, sensor and estimator clocks stay t.
package OfficeLoopTwoCircuitProfile
  function Lap
    input Real t; output Real value;
  algorithm value := if t >= 125 then 1 else 0; end Lap;
  function S
    input Real t; output Real value;
  algorithm value := 2*t-250*Lap(t); end S;
  function X  input Real t; output Real value; algorithm value := OfficeLoopProfile.X(S(t)); end X;
  function Y  input Real t; output Real value; algorithm value := OfficeLoopProfile.Y(S(t)); end Y;
  function VX input Real t; output Real value; algorithm value := 2*OfficeLoopProfile.VX(S(t)); end VX;
  function VY input Real t; output Real value; algorithm value := 2*OfficeLoopProfile.VY(S(t)); end VY;
  function AX input Real t; output Real value; algorithm value := 4*OfficeLoopProfile.AX(S(t)); end AX;
  function AY input Real t; output Real value; algorithm value := 4*OfficeLoopProfile.AY(S(t)); end AY;
  function Heading
    input Real t; output Real value;
  algorithm value := OfficeLoopProfile.Heading(S(t))+2*3.141592653589793*Lap(t); end Heading;
end OfficeLoopTwoCircuitProfile;
