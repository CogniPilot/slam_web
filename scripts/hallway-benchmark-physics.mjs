import {readFile} from 'node:fs/promises';

export async function hallwayPhysics(original){
  // Change only the four mission references. Keep controller equations,
  // rigid-body dynamics, motor lag and solver configuration unchanged.
  const references=new Map([
    ['positionSetpoint = if noEvent(positionMode > 0.5) then targetPosition else pathPosition;',
      'positionSetpoint = {HallwayProfile.Position(time),0,initialHeight};'],
    ['velocitySetpoint = if noEvent(positionMode > 0.5) then targetVelocity else pathVelocity;',
      'velocitySetpoint = {HallwayProfile.Velocity(time),0,0};'],
    ['headingSetpoint = if noEvent(positionMode > 0.5) then targetHeading else pathHeading;',
      'headingSetpoint = 0.0;'],
    ['controller.accelerationReferenceWorld = if noEvent(positionMode > 0.5) then targetAcceleration else zeros(3);',
      'controller.accelerationReferenceWorld = {HallwayProfile.Acceleration(time),0,0};']
  ]);
  let plant=original;
  for(const [before,after]of references){
    if(plant.split(before).length!==2)throw Error('Expected one canonical mission reference: '+before);
    plant=plant.replace(before,after);
  }
  const profile=await readFile(new URL('../models/Benchmarks/HallwayProfile.mo',import.meta.url),'utf8');
  return plant+'\n'+profile;
}
