// Independent test boundary, full128/256 storage. No production dense operator.
function PoseGraphPairReferenceCase
  input Real clock;
  output Integer scenario;
  output Real first[128,6]; output Real second[128,6];
  output Boolean accepted; output Boolean canonicalRefusal;
protected
  Real p[128,3]; Real R[128,3,3]; Real nodeMask[128]; Real edgeMask[256];
  Real source[256]; Real target[256]; Real translation[256,3]; Real measured[256,3,3]; Real information[256,6,6];
  Integer from[256]; Integer to[256]; Real Ji[256,6,6]; Real Jj[256,6,6];
  Real residual[6]; Real left[6,6]; Real right[6,6]; Boolean chart;
  Real f[128,6]; Real g[128,6]; Integer i; Integer j; Integer swap; Integer active;
  Real status; Real nodes; Real edges;
  ModelicaPoseGraphCovariance.Tree tree; ModelicaPoseGraphCovariance.Coarse coarse; ModelicaPoseGraphCovariance.Pairs pairs;
algorithm
  scenario:=min(11,1+integer(floor(clock*8+1e-8)));
  active:=if scenario==3 then 96 else 128;
  p:=zeros(128,3); R:=zeros(128,3,3); nodeMask:=ones(128); edgeMask:=ones(256);
  source:=ones(256); target:=ones(256); translation:=zeros(256,3); measured:=zeros(256,3,3); information:=zeros(256,6,6);
  from:=fill(1,256); to:=from; Ji:=zeros(256,6,6); Jj:=Ji;
  residual:=zeros(6); left:=zeros(6,6); right:=left; chart:=false; i:=1; j:=1; swap:=1;
  f:=zeros(128,6); g:=f; status:=0; nodes:=0; edges:=0; accepted:=false; canonicalRefusal:=false;
  first:=f; second:=f;
  for node in 1:128 loop
    p[node,:]:={0.025*(node-1),0.3*sin(0.07*node),0.15*cos(0.11*node)};
    R[node,:,:]:=PGExp({0.09*sin(0.05*node),-0.12*cos(0.04*node),0.004*node});
    if node>active or ((scenario==6 or scenario==10) and node==64) then nodeMask[node]:=0.0; p[node,:]:=fill(1e100,3); R[node,:,:]:=fill(1e100,3,3); end if;
    if node>1 and node<=active and not ((scenario==6 or scenario==10) and node==64) then
      for axis in 1:6 loop f[node,axis]:=sin(0.071*node+0.19*axis); g[node,axis]:=cos(0.053*node-0.13*axis); end for;
    end if;
  end for;
  for edge in 1:256 loop
    i:=if edge<=127 then edge else mod(17*(edge-128),127)+1;
    j:=if edge<=127 then edge+1 else mod(i+23+3*(edge-128),128)+1;
    if i==j then j:=mod(j,128)+1; end if;
    if scenario==2 and mod(edge,2)==0 then swap:=i; i:=j; j:=swap; end if;
    source[edge]:=i; target[edge]:=j;
    if i<=active and j<=active and not ((scenario==6 or scenario==10) and (i==64 or j==64)) then
      translation[edge,:]:=transpose(R[i,:,:])*(p[j,:]-p[i,:])+{0.001*sin(edge),-0.001*cos(edge),0.0005};
      measured[edge,:,:]:=transpose(R[i,:,:])*R[j,:,:]*PGExp({0.003*sin(0.3*edge),-0.004*cos(0.2*edge),0.002});
      for row in 1:6 loop
        for column in 1:6 loop information[edge,row,column]:=((if row==column then 1.0+0.2*row else 0.0)+0.01*min(row,column)*max(row,column))/256.0; end for;
      end for;
    else
      edgeMask[edge]:=0.0; source[edge]:=1e100; target[edge]:=-1e100;
      translation[edge,:]:=fill(1e100,3); measured[edge,:,:]:=fill(1e100,3,3); information[edge,:,:]:=fill(1e100,6,6);
    end if;
  end for;
  if scenario==5 or scenario==10 then information:=information*1e16; end if;
  if scenario==11 then
    nodeMask:=zeros(128); nodeMask[1]:=1.0; nodeMask[128]:=1.0;
    edgeMask:=zeros(256); edgeMask[1]:=1.0; source:=fill(1e100,256); target:=fill(-1e100,256);
    source[1]:=1.0; target[1]:=128.0;
    p:=fill(1e100,128,3); R:=fill(1e100,128,3,3);
    p[1,:]:=zeros(3); p[128,:]:=zeros(3); R[1,:,:]:=identity(3); R[128,:,:]:=identity(3);
    translation:=fill(1e100,256,3); measured:=fill(1e100,256,3,3); information:=fill(1e100,256,6,6);
    translation[1,:]:=zeros(3); measured[1,:,:]:=identity(3); information[1,:,:]:=identity(6)*1e13;
    f:=zeros(128,6); g:=f;
    for axis in 1:6 loop f[128,axis]:=sin(0.071*128+0.19*axis); g[128,axis]:=cos(0.053*128-0.13*axis); end for;
  end if;
  (from,to,status,nodes,edges):=PGValidateGraph(p,R,nodeMask,edgeMask,source,target,translation,measured,information);
  for edge in 1:256 loop
    if edgeMask[edge]==1.0 then
      (residual,left,right,chart):=PGEdge(p[from[edge],:],R[from[edge],:,:],p[to[edge],:],R[to[edge],:,:],translation[edge,:],measured[edge,:,:]);
      Ji[edge,:,:]:=left; Jj[edge,:,:]:=right;
    end if;
  end for;
  tree:=ModelicaPoseGraphCovariance.BuildTree(nodeMask,edgeMask,from,to,Ji,Jj,information);
  // Isolated coarse-rank refusal: zero H, while retaining every declared extent.
  if scenario==4 then Ji:=zeros(256,6,6); Jj:=Ji; end if;
  coarse:=ModelicaPoseGraphCovariance.BuildCoarse(p,R,nodeMask,edgeMask,from,to,Ji,Jj,information);
  if scenario==7 then from[256]:=129;
  elseif scenario==8 then nodeMask[128]:=0.5;
  elseif scenario==9 then nodeMask[128]:=0.0; end if;
  pairs:=ModelicaPoseGraphCovariance.BuildPairs(nodeMask,edgeMask,from,to,Ji,Jj,information);
  accepted:=status==1.0 and tree.valid and coarse.valid and pairs.valid;
  if accepted then
    first:=ModelicaPoseGraphCovariance.BalancedPairSolve(f,pairs,coarse);
    second:=ModelicaPoseGraphCovariance.BalancedPairSolve(g,pairs,coarse);
  else
    canonicalRefusal:=not pairs.valid and (scenario<>4 or not coarse.valid);
    for pair in 1:64 loop for row in 1:12 loop for column in 1:12 loop
      canonicalRefusal:=canonicalRefusal and pairs.factor[pair,row,column]==0.0;
    end for; end for; end for;
    if scenario==4 then
    for node in 1:128 loop
      for row in 1:6 loop
        for column in 1:6 loop
          canonicalRefusal:=canonicalRefusal and coarse.basis[node,row,column]==0.0 and coarse.product[node,row,column]==0.0;
        end for;
      end for;
    end for;
    for row in 1:6 loop
      for column in 1:6 loop canonicalRefusal:=canonicalRefusal and coarse.factor[row,column]==0.0; end for;
    end for;
    end if;
  end if;
end PoseGraphPairReferenceCase;

model ModelicaPoseGraphPairAcceptance
  output Integer scenario;
  output Real first[128,6]; output Real second[128,6];
  output Boolean accepted; output Boolean canonicalRefusal;
equation
  (scenario,first,second,accepted,canonicalRefusal)=PoseGraphPairReferenceCase(time);
end ModelicaPoseGraphPairAcceptance;
