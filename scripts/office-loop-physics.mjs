import {readFile} from 'node:fs/promises';
export async function officeLoopPhysics(original){
 const references=new Map([
 ['positionSetpoint = if noEvent(positionMode > 0.5) then targetPosition else pathPosition;','positionSetpoint = {OfficeLoopProfile.X(time),OfficeLoopProfile.Y(time),initialHeight};'],
 ['velocitySetpoint = if noEvent(positionMode > 0.5) then targetVelocity else pathVelocity;','velocitySetpoint = {OfficeLoopProfile.VX(time),OfficeLoopProfile.VY(time),0};'],
 ['headingSetpoint = if noEvent(positionMode > 0.5) then targetHeading else pathHeading;','headingSetpoint = OfficeLoopProfile.Heading(time);'],
 ['controller.accelerationReferenceWorld = if noEvent(positionMode > 0.5) then targetAcceleration else zeros(3);','controller.accelerationReferenceWorld = {OfficeLoopProfile.AX(time),OfficeLoopProfile.AY(time),0};']]);
 let plant=original;
 for(const [before,after]of references){if(plant.split(before).length!==2)throw Error('Expected one canonical mission reference: '+before);plant=plant.replace(before,after);}
 return plant+'\n'+await readFile(new URL('../models/Benchmarks/OfficeLoopProfile.mo',import.meta.url),'utf8');
}
