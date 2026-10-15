export interface ParameterDeclaration {name:string;type:string;label:string;description:string;expression:string;dimensions?:string[];owner:string;kind:'parameter'|'input';final?:boolean;constant?:boolean;unit?:string;group?:string;tab?:string;minValue?:number;maxValue?:number}
export function parameterLabel(name:string):string;
export function parameterDeclaration(source:string,symbol:any):Omit<ParameterDeclaration,'owner'|'kind'>;
export function modelParameterDeclarations(source:string,symbols:any[]):ParameterDeclaration[];
