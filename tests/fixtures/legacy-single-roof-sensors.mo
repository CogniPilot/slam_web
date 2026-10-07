// Saved single-volume profile before the additive three-roof interface.
model SensorAvailability
  input Real positionTruth[3] = {0.0,0.0,1.5};
  input Real roofEnabled = 1.0;
  input Real roofMinimum[3] = {35.8,-5.2,0.0};
  input Real roofMaximum[3] = {48.2,5.2,3.8};
  output Real gpsAvailable;
equation
  gpsAvailable = if noEvent(roofEnabled > 0.5 and
    positionTruth[1] >= roofMinimum[1] and positionTruth[1] <= roofMaximum[1] and
    positionTruth[2] >= roofMinimum[2] and positionTruth[2] <= roofMaximum[2] and
    positionTruth[3] >= roofMinimum[3] and positionTruth[3] <= roofMaximum[3]) then 0.0 else 1.0;
end SensorAvailability;

model SensorObservations
  input Real accelTruth[3] = {0.0,0.0,9.81};
  input Real gyroTruth[3] = {0.0,0.0,0.0};
  input Real positionTruth[3] = {0.0,0.0,1.5};
  input Real accelDraws[3,2] = fill(0.5,3,2);
  input Real gyroDraws[3,2] = fill(0.5,3,2);
  input Real gpsDraws[3,2] = fill(0.5,3,2);
  input Real roofEnabled = 1.0;
  input Real roofMinimum[3] = {35.8,-5.2,0.0};
  input Real roofMaximum[3] = {48.2,5.2,3.8};
  output Real accel[3];
  output Real gyro[3];
  output Real gpsPosition[3];
  output Real gpsCovariance[3,3];
  output Real gpsAvailable;
protected
  parameter Real accelBias[3] = {0.015,-0.012,0.02};
  parameter Real gyroBias[3] = {0.0004,-0.0003,0.0006};
equation
  gpsAvailable = if noEvent(roofEnabled > 0.5 and
    positionTruth[1] >= roofMinimum[1] and positionTruth[1] <= roofMaximum[1] and
    positionTruth[2] >= roofMinimum[2] and positionTruth[2] <= roofMaximum[2] and
    positionTruth[3] >= roofMinimum[3] and positionTruth[3] <= roofMaximum[3]) then 0.0 else 1.0;
  for i in 1:3 loop
    accel[i] = accelTruth[i]+accelBias[i]+0.015*
      sqrt(-2.0*log(max(1e-9,accelDraws[i,1])))*cos(2.0*3.141592653589793*accelDraws[i,2]);
    gyro[i] = gyroTruth[i]+gyroBias[i]+0.0005*
      sqrt(-2.0*log(max(1e-9,gyroDraws[i,1])))*cos(2.0*3.141592653589793*gyroDraws[i,2]);
    gpsPosition[i] = positionTruth[i]+0.1*
      sqrt(-2.0*log(max(1e-9,gpsDraws[i,1])))*cos(2.0*3.141592653589793*gpsDraws[i,2]);
    for j in 1:3 loop
      gpsCovariance[i,j] = if i == j then 0.01 else 0.0;
    end for;
  end for;
end SensorObservations;
