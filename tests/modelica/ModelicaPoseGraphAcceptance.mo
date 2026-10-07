// Test-only full-capacity closed-form reference. No application numerical backend.
function PoseGraphReferenceCase
  input Real clock;
  output Real checks[12];
protected
  Real p[128,3]; Real R[128,3,3]; Real nodes[128]; Real edges[256];
  Real source[256]; Real target[256]; Real t[256,3]; Real Z[256,3,3]; Real W[256,6,6];
  Real nextP[128,3]; Real nextR[128,3,3]; Real truth[128,3];
  Real gauge[3]; Real Q[3,3]; Real status; Real before; Real after; Real accepted; Real pcg; Real nodeCount; Real edgeCount;
  Real expectedBefore; Real expectedAfter; Real r[3]; Real maximumError; Real rollbackError; Real gaugeError;
  Integer which; Integer endpoint; Integer maximumIterations; Boolean refusal; Boolean consistent; Boolean noDescent;
algorithm
  // Exact binary phase spacing prevents an algebraic-only reference simulator
  // from stepping beyond the requested stop time through decimal roundoff.
  which := min(9,integer(floor(clock*8+1e-8)));
  refusal := which >= 2 and which <= 7; consistent := which == 1; noDescent := which == 8;
  gauge := {2.0,-3.0,1.0}; Q := {{0.0,-1.0,0.0},{1.0,0.0,0.0},{0.0,0.0,1.0}};
  p := zeros(128,3); R := zeros(128,3,3); truth := zeros(128,3); nodes := ones(128); edges := ones(256);
  source := ones(256); target := ones(256); t := zeros(256,3); Z := zeros(256,3,3); W := zeros(256,6,6);
  maximumIterations := if which == 7 then 0 else 8;
  for node in 1:128 loop
    truth[node,:] := gauge+Q*{0.01*(node-1)+0.02*clock*(if node == 1 then 0 else 1),0.002*(node-1),-0.001*(node-1)};
    p[node,:] := truth[node,:]+(if node == 1 or consistent then zeros(3) else if noDescent then {1e-8,-1e-8,1e-8} else {0.1,-0.08,0.06});
    R[node,:,:] := Q;
  end for;
  for edge in 1:256 loop
    endpoint := 2+mod(edge-1,127); target[edge] := endpoint;
    t[edge,:] := {0.01*(endpoint-1)+0.02*clock,0.002*(endpoint-1),-0.001*(endpoint-1)};
    Z[edge,:,:] := identity(3); W[edge,:,:] := identity(6);
    if which == 3 and endpoint == 128 then edges[edge] := 0.0; end if;
  end for;
  if which == 2 then nodes[32] := 0.5; end if;
  if which == 4 then W[256,1,2] := 2.0; W[256,2,1] := 2.0; end if;
  if which == 5 then target[256] := 129.0; end if;
  if which == 6 then Z[256,:,:] := {{1.0,0.0,0.0},{0.0,-1.0,0.0},{0.0,0.0,-1.0}}; end if;
  expectedBefore := 0.0;
  for edge in 1:256 loop
    endpoint := 2+mod(edge-1,127);
    r := transpose(Q)*(p[endpoint,:]-gauge)-t[edge,:];
    expectedBefore := expectedBefore+0.5*(r*r);
  end for;
  (nextP,nextR,status,before,after,accepted,pcg,nodeCount,edgeCount) := OptimizeModelicaPoseGraph(p,R,nodes,edges,source,target,t,Z,W,
    maximumIterations,48,8,0.001,0.5,0.2,1e-5);
  expectedAfter := 0.0; maximumError := 0.0; rollbackError := 0.0; gaugeError := 0.0;
  for edge in 1:256 loop
    endpoint := 2+mod(edge-1,127); r := transpose(Q)*(nextP[endpoint,:]-gauge)-t[edge,:]; expectedAfter := expectedAfter+0.5*(r*r);
  end for;
  for node in 1:128 loop
    for k in 1:3 loop
      maximumError := max(maximumError,abs(nextP[node,k]-truth[node,k]));
      rollbackError := max(rollbackError,abs(nextP[node,k]-p[node,k]));
      if node == 1 then gaugeError := max(gaugeError,abs(nextP[node,k]-gauge[k])); end if;
      for j in 1:3 loop
        rollbackError := max(rollbackError,abs(nextR[node,k,j]-R[node,k,j]));
        if node == 1 then gaugeError := max(gaugeError,abs(nextR[node,k,j]-Q[k,j])); end if;
      end for;
    end for;
  end for;
  checks := {
    if refusal then (if status < 0.0 then 1.0 else 0.0) else (if status >= 1.0 then 1.0 else 0.0),
    if gaugeError == 0.0 then 1.0 else 0.0,
    if refusal or consistent or noDescent then (if rollbackError == 0.0 then 1.0 else 0.0) else (if maximumError < 1e-5 then 1.0 else 0.0),
    if refusal then (if accepted == 0.0 and pcg == 0.0 then 1.0 else 0.0) else (if after <= before then 1.0 else 0.0),
    if refusal then 1.0 else (if abs(before-expectedBefore) < 1e-10 then 1.0 else 0.0),
    if refusal then 1.0 else (if abs(after-expectedAfter) < 1e-10 then 1.0 else 0.0),
    if refusal or consistent or noDescent then 1.0 else (if status == 2.0 and accepted > 0.0 and after < before*1e-8 then 1.0 else 0.0),
    if consistent or noDescent then (if status == 1.0 and accepted == 0.0 then 1.0 else 0.0) else 1.0,
    if refusal then 1.0 else (if nodeCount == 128.0 and edgeCount == 256.0 then 1.0 else 0.0),
    if which == 3 then (if status == -3.0 then 1.0 else 0.0) else 1.0,
    if which == 6 then (if status == -4.0 then 1.0 else 0.0) else 1.0,
    if which == 9 then (if status == 2.0 and maximumError < 1e-5 then 1.0 else 0.0) else 1.0};
end PoseGraphReferenceCase;

// Independent Euler construction and matrix logarithm for the test oracle.
// Neither expected rotations nor expected costs call production PG helpers.
function PoseGraphReferenceRotation
  input Real a[3]; output Real R[3,3];
protected Real cx; Real sx; Real cy; Real sy; Real cz; Real sz;
algorithm
  cx := cos(a[1]); sx := sin(a[1]); cy := cos(a[2]); sy := sin(a[2]); cz := cos(a[3]); sz := sin(a[3]);
  R := {{cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx},
        {sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx},
        {-sy,cy*sx,cy*cx}};
end PoseGraphReferenceRotation;

function PoseGraphReferenceLog
  input Real R[3,3]; output Real angle[3];
protected Real theta; Real factor;
algorithm
  theta := acos(min(1.0,max(-1.0,(sum(R[i,i] for i in 1:3)-1.0)/2.0)));
  factor := if theta < 1e-7 then 0.5+theta*theta/12.0 else theta/(2.0*sin(theta));
  angle := factor*{R[3,2]-R[2,3],R[1,3]-R[3,1],R[2,1]-R[1,2]};
end PoseGraphReferenceLog;

function PoseGraphNonlinearReferenceCase
  input Real clock; output Real checks[8];
protected
  Real p[128,3]; Real R[128,3,3]; Real truth[128,3]; Real truthR[128,3,3];
  Real nodes[128]; Real edges[256]; Real source[256]; Real target[256];
  Real t[256,3]; Real Z[256,3,3]; Real W[256,6,6];
  Real nextP[128,3]; Real nextR[128,3,3]; Real gaugeR[3,3];
  Real status; Real before; Real after; Real accepted; Real pcg; Real nodeCount; Real edgeCount;
  Real expectedBefore; Real expectedAfter; Real residual[6]; Real A[6,6];
  Real maximumPositionError; Real maximumRotationError; Real gaugeError;
  Integer i; Integer j; Integer swap; Boolean reverse;
algorithm
  gaugeR := PoseGraphReferenceRotation({0.31,-0.22,0.47});
  p := zeros(128,3); R := zeros(128,3,3); truth := zeros(128,3); truthR := zeros(128,3,3);
  nodes := ones(128); edges := ones(256); source := ones(256); target := ones(256);
  t := zeros(256,3); Z := zeros(256,3,3); W := zeros(256,6,6);
  A := identity(6); A[1,4] := 0.2; A[2,5] := -0.15; A[3,6] := 0.1;
  reverse := mod(integer(floor(clock*8+1e-8)),2) == 1;
  for node in 1:128 loop
    truth[node,:] := {2,-3,1}+gaugeR*{0.018*(node-1),0.2*sin(0.08*(node-1)),0.1*cos(0.06*(node-1))-0.1};
    truthR[node,:,:] := gaugeR*PoseGraphReferenceRotation({0.08*sin(0.05*(node-1)),0.12*sin(0.03*(node-1)),0.002*(node-1)});
    p[node,:] := truth[node,:]+(if node == 1 then zeros(3) else {0.08*sin(0.17*node+clock),-0.06*cos(0.13*node),0.04*sin(0.19*node)});
    R[node,:,:] := truthR[node,:,:]*(if node == 1 then identity(3) else PoseGraphReferenceRotation({0.025*sin(node),-0.02*cos(0.3*node),0.03*sin(0.2*node)}));
  end for;
  for edge in 1:256 loop
    if edge <= 127 then i := 1; j := edge+1;
    elseif edge <= 254 then i := edge-127; j := i+1;
    elseif edge == 255 then i := 128; j := 1;
    else i := 64; j := 96;
    end if;
    if reverse then swap := i; i := j; j := swap; end if;
    source[edge] := i; target[edge] := j;
    t[edge,:] := transpose(truthR[i,:,:])*(truth[j,:]-truth[i,:]);
    Z[edge,:,:] := transpose(truthR[i,:,:])*truthR[j,:,:];
    W[edge,:,:] := transpose(A)*A;
  end for;
  (nextP,nextR,status,before,after,accepted,pcg,nodeCount,edgeCount) := OptimizeModelicaPoseGraph(p,R,nodes,edges,source,target,t,Z,W,
    8,48,8,0.001,0.5,0.2,1e-6);
  expectedBefore := 0.0; expectedAfter := 0.0;
  maximumPositionError := 0.0; maximumRotationError := 0.0; gaugeError := 0.0;
  for edge in 1:256 loop
    i := integer(source[edge]); j := integer(target[edge]);
    residual[1:3] := transpose(R[i,:,:])*(p[j,:]-p[i,:])-t[edge,:];
    residual[4:6] := PoseGraphReferenceLog(transpose(Z[edge,:,:])*transpose(R[i,:,:])*R[j,:,:]);
    expectedBefore := expectedBefore+0.5*(residual*(W[edge,:,:]*residual));
    residual[1:3] := transpose(nextR[i,:,:])*(nextP[j,:]-nextP[i,:])-t[edge,:];
    residual[4:6] := PoseGraphReferenceLog(transpose(Z[edge,:,:])*transpose(nextR[i,:,:])*nextR[j,:,:]);
    expectedAfter := expectedAfter+0.5*(residual*(W[edge,:,:]*residual));
  end for;
  for node in 1:128 loop
    for axis in 1:3 loop
      maximumPositionError := max(maximumPositionError,abs(nextP[node,axis]-truth[node,axis]));
      if node == 1 then gaugeError := max(gaugeError,abs(nextP[node,axis]-p[node,axis])); end if;
      for column in 1:3 loop
        maximumRotationError := max(maximumRotationError,abs(nextR[node,axis,column]-truthR[node,axis,column]));
        if node == 1 then gaugeError := max(gaugeError,abs(nextR[node,axis,column]-R[node,axis,column])); end if;
      end for;
    end for;
  end for;
  checks := {if status == 2 and accepted > 0 then 1 else 0,
    if nodeCount == 128 and edgeCount == 256 then 1 else 0,
    if gaugeError == 0 then 1 else 0,
    if maximumPositionError < 1e-4 then 1 else 0,
    if maximumRotationError < 1e-4 then 1 else 0,
    if abs(before-expectedBefore) < 1e-8 then 1 else 0,
    if abs(after-expectedAfter) < 1e-8 then 1 else 0,
    if after < before*1e-8 and pcg > 0 then 1 else 0};
end PoseGraphNonlinearReferenceCase;

model ModelicaPoseGraphAcceptance
  output Real checks[20];
equation
  checks[1:12] = PoseGraphReferenceCase(time);
  checks[13:20] = PoseGraphNonlinearReferenceCase(time);
end ModelicaPoseGraphAcceptance;
