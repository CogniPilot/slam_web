// Codes are authored by RGBDLoopVerification, RGBDKeyframeRetrieval,
// RGBDKeyframePolicy, RGBDGraphMeasurements and RGBDLocalizationProcessing
// in the Modelica library.
const verification:Record<number,string>={0:'Geometric verification passed',1:'Verification not requested',2:'Invalid verification settings',3:'Keyframe identity, chronology or revisit age rejected',4:'Invalid keyframe observations',5:'Incompatible RGB-D calibration',6:'Descriptor matching rejected',7:'Geometric consensus or registration did not converge',8:'Registration uncertainty could not be certified',9:'Body-frame loop constraint rejected',10:'Catalog or appearance binding rejected',11:'Loop motion disagrees with retained pose uncertainty'};
const retrieval:Record<number,string>={0:'Retrieval completed',1:'Retrieval not requested',2:'Frame or catalog metadata rejected',3:'Visual-word query or retained history rejected',4:'Prepared keyframe observations rejected',5:'Retrieved candidate identity rejected'};
const keyframe:Record<number,string>={0:'Keyframe requested',1:'Keyframe capture not requested',2:'Invalid keyframe policy settings',3:'Catalog or frame metadata rejected',4:'Pose estimate not accepted',5:'Too few depth-qualified features',6:'Waiting for the minimum keyframe interval',7:'Motion and elapsed time are below keyframe thresholds',8:'Image is not fresh'};
const graph:Record<number,string>={0:'Graph capture accepted',1:'Graph capture not requested',2:'Catalog or graph settings rejected',3:'Prior graph rejected',4:'Consecutive-keyframe constraint rejected',5:'Loop constraint rejected',6:'Graph capacity or identity rejected',7:'Graph invariant check failed'};
const frame:Record<number,string>={1:'Frame capture not requested',2:'Frame metadata rejected',3:'Feature domain or mask rejected',4:'Camera calibration rejected',5:'Pose rejected',6:'Pose covariance rejected',7:'Feature payload rejected',8:'Frame does not match the accepted localization'};
const publication:Record<number,string>={0:'No loop edge committed despite an accepted localization publication',1:'Localization publication not requested',2:'Previous localization or graph state rejected',3:'Localization publication rejected',4:'Capture ledger rejected publication',5:'Keyframe pose view rejected publication',6:'Final localization or graph invariant rejected publication'};
export const loopVerificationReason=(code:number)=>verification[code]??`Verification reason ${code}`;
export const loopRetrievalReason=(code:number)=>retrieval[code]??`Retrieval reason ${code}`;
export const loopGraphReason=(code:number)=>graph[code]??`Graph reason ${code}`;
export const loopKeyframeReason=(code:number)=>keyframe[code]??`Keyframe reason ${code}`;
export const loopFrameReason=(code:number)=>frame[code]??`Frame reason ${code}`;
export const loopPublicationReason=(code:number)=>publication[code]??`Publication reason ${code}`;
