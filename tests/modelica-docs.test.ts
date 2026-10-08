import {describe,it,expect} from 'vitest';
import {documentationSource,flattenClasses} from '../src/modelica-docs';

describe('Modelica documentation source navigation',()=>{
  it('finds exact canonical classes, package annotations and nested classes without guessing unrelated files',()=>{
    const paths=['models/Libraries/CogniPilot/Control/package.mo','models/Libraries/CogniPilot/Control/LogLinear/Controller.mo','models/Examples/InertialOnly.mo'];
    expect(documentationSource('Control',paths)).toBe(paths[0]);
    expect(documentationSource('Control.LogLinear.Controller',paths)).toBe(paths[1]);
    expect(documentationSource('Control.LogLinear.Controller.Helper',paths)).toBe(paths[1]);
    expect(documentationSource('Examples.InertialOnly',paths)).toBe(paths[2]);
    expect(documentationSource('Unrelated.Controller',paths)).toBeUndefined();
  });
  it('retains qualified hierarchy and class metadata from Rumoca',()=>{
    const nested={name:'Filter',qualified_name:'SLAM.Filter',class_type:'model',children:[]};
    expect(flattenClasses([{name:'SLAM',qualified_name:'SLAM',class_type:'package',children:[nested]}]).map(item=>item.qualified_name)).toEqual(['SLAM','SLAM.Filter']);
  });
});
