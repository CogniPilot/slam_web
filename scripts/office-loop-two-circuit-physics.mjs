import {readFile} from 'node:fs/promises';
// Phase B two-circuit route: the same four mission-reference swaps as the reviewed
// preflight (check-office-loop-physics-two-circuit.mjs), so the captured plant is the
// source that preflight simulated.
export async function officeLoopTwoCircuitPhysics(original){
 const references=new Map([
 ['positionSetpoint = if noEvent(positionMode > 0.5) then targetPosition else pathPosition;','positionSetpoint = {OfficeLoopTwoCircuitProfile.X(time),OfficeLoopTwoCircuitProfile.Y(time),initialHeight};'],
 ['velocitySetpoint = if noEvent(positionMode > 0.5) then targetVelocity else pathVelocity;','velocitySetpoint = {OfficeLoopTwoCircuitProfile.VX(time),OfficeLoopTwoCircuitProfile.VY(time),0};'],
 ['headingSetpoint = if noEvent(positionMode > 0.5) then targetHeading else pathHeading;','headingSetpoint = OfficeLoopTwoCircuitProfile.Heading(time);'],
 ['controller.accelerationReferenceWorld = if noEvent(positionMode > 0.5) then targetAcceleration else zeros(3);','controller.accelerationReferenceWorld = {OfficeLoopTwoCircuitProfile.AX(time),OfficeLoopTwoCircuitProfile.AY(time),0};']]);
 let plant=original;
 for(const [before,after]of references){if(plant.split(before).length!==2)throw Error('Expected one canonical mission reference: '+before);plant=plant.replace(before,after);}
 return plant+'\n'+await readFile(new URL('../models/Benchmarks/OfficeLoopProfile.mo',import.meta.url),'utf8')
  +'\n'+await readFile(new URL('../models/Benchmarks/OfficeLoopTwoCircuitProfile.mo',import.meta.url),'utf8');
}
