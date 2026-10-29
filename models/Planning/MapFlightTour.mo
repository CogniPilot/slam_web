model MapFlightTour
  "Sample the existing map references at the held command boundary"
  input Real sampleTime = 0;
  input Real route = 1 "1 office loop, 2 hallway out and back";
  input Real origin[3] = {0,0,1.5};
  output Real position[3];
  output Real velocity[3];
  output Real acceleration[3];
  output Real heading;
equation
  position = if noEvent(route < 1.5) then
    {origin[1]+OfficeLoopProfile.X(sampleTime),origin[2]+OfficeLoopProfile.Y(sampleTime),origin[3]} else
    {origin[1]+HallwayProfile.Position(sampleTime),origin[2],origin[3]};
  velocity = if noEvent(route < 1.5) then
    {OfficeLoopProfile.VX(sampleTime),OfficeLoopProfile.VY(sampleTime),0} else
    {HallwayProfile.Velocity(sampleTime),0,0};
  acceleration = if noEvent(route < 1.5) then
    {OfficeLoopProfile.AX(sampleTime),OfficeLoopProfile.AY(sampleTime),0} else
    {HallwayProfile.Acceleration(sampleTime),0,0};
  heading = if noEvent(route < 1.5) then OfficeLoopProfile.Heading(sampleTime) else 0;
end MapFlightTour;
