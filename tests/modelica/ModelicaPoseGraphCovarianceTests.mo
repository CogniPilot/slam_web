// Full128/256 reference inputs; the independent dense oracle is in the runner.
package ModelicaPoseGraphCovarianceTests
  constant Integer cases=19;
  function Run
    input Integer scenario;
    output ModelicaPoseGraphCovariance.Result result;
  protected
    Real p[128,3]; Real R[128,3,3]; Real nodeMask[128]; Real edgeMask[256];
    Real source[256]; Real target[256]; Real translation[256,3]; Real measured[256,3,3];
    Real information[256,6,6]; Real weight[6,6]; Real relative[3,3];
    Real inverse[6,6]; Boolean inverseValid; Integer i; Integer j; Integer reverse;
    Integer selectedCurrent; Integer selectedReference; Integer active;
  algorithm
    p:=zeros(128,3); R:=zeros(128,3,3); nodeMask:=ones(128); edgeMask:=ones(256);
    source:=ones(256); target:=ones(256); translation:=zeros(256,3);
    measured:=zeros(256,3,3); information:=zeros(256,6,6); weight:=zeros(6,6);
    relative:=identity(3); inverse:=zeros(6,6); inverseValid:=false; i:=1; j:=1; reverse:=1;
    selectedCurrent:=128; selectedReference:=64; active:=if scenario==7 then 96 else 128;
    for node in 1:128 loop
      p[node,:]:={0.025*(node-1),0.3*sin(0.07*node),0.15*cos(0.11*node)};
      R[node,:,:]:=PGExp({0.09*sin(0.05*node),-0.12*cos(0.04*node),0.004*node});
      if node>active then nodeMask[node]:=0.0; p[node,:]:=fill(1e100,3); R[node,:,:]:=fill(1e100,3,3); end if;
    end for;
    for edge in 1:256 loop
      i:=if edge<=127 then edge else mod(17*(edge-128),127)+1;
      j:=if edge<=127 then edge+1 else mod(i+23+3*(edge-128),128)+1;
      if i==j then j:=mod(j,128)+1; end if;
      if scenario==6 and mod(edge,2)==0 then reverse:=i; i:=j; j:=reverse; end if;
      source[edge]:=i; target[edge]:=j;
      if i<=active and j<=active then
        translation[edge,:]:=transpose(R[i,:,:])*(p[j,:]-p[i,:])+{0.001*sin(edge),-0.001*cos(edge),0.0005};
        relative:=transpose(R[i,:,:])*R[j,:,:];
        measured[edge,:,:]:=relative*PGExp({0.003*sin(0.3*edge),-0.004*cos(0.2*edge),0.002});
        for row in 1:6 loop
          for column in 1:6 loop
            weight[row,column]:=((if row==column then 1.0+0.2*row else 0.0)+0.01*min(row,column)*max(row,column))/256.0;
          end for;
        end for;
        information[edge,:,:]:=weight;
      else
        edgeMask[edge]:=0.0; source[edge]:=1e100; target[edge]:=-1e100;
        translation[edge,:]:=fill(1e100,3); measured[edge,:,:]:=fill(1e100,3,3);
        information[edge,:,:]:=fill(1e100,6,6);
      end if;
    end for;
    if scenario==3 then selectedCurrent:=1; end if;
    if scenario==4 then selectedReference:=1; end if;
    if scenario==5 then selectedReference:=128; end if;
    if scenario==7 then selectedCurrent:=95; end if;
    if scenario==8 then edgeMask:=zeros(256); end if;
    if scenario==9 then information[1,6,:]:=zeros(6); information[1,:,6]:=zeros(6); end if;
    if scenario==10 then information[1,1,2]:=information[1,1,2]+1e-12; end if;
    if scenario==11 then measured[1,:,:]:=transpose(R[1,:,:])*R[2,:,:]*PGExp({3.141492653589793,0,0}); end if;
    if scenario==12 then selectedCurrent:=0; end if;
    if scenario==13 then nodeMask[128]:=0.5; end if;
    if scenario==15 then
      nodeMask:=fill(1e100,128); edgeMask:=fill(1e100,256); selectedCurrent:=0; selectedReference:=0;
      p:=fill(1e100,128,3); R:=fill(1e100,128,3,3);
    end if;
    if scenario==16 then information[1,:,:]:=identity(6)*1e-14; end if;
    if scenario==17 then
      nodeMask:=zeros(128); nodeMask[1]:=1.0; edgeMask:=zeros(256); selectedCurrent:=1; selectedReference:=1;
    end if;
    result:=ModelicaPoseGraphCovariance.Select(p,R,nodeMask,edgeMask,source,target,translation,measured,information,
      selectedCurrent,selectedReference,if scenario==2 then 0 else if scenario==14 then 97 else if scenario==19 then 2 else 96,
      1e-10,scenario<>15);
    if scenario==18 then
      (inverse,inverseValid):=ModelicaPoseGraphCovariance.Inverse6(zeros(6,6));
      result:=ModelicaPoseGraphCovariance.Empty(); result.status:=if not inverseValid and max(abs(inverse))<1e-12 then 18 else -18;
    end if;
  end Run;

  // Test-only tuple boundary: keep the production record inside the function,
  // where its complete assignment has ordinary algorithm semantics. OMC's
  // equation solver cannot scalarize this mixed-array record equation.
  function AtTime
    input Real clock;
    output Integer scenario;
    output Real upper[12,12]; output Real lower[12,12]; output Real residualUpper[12,12];
    output Boolean accepted; output Integer status; output Integer treeEdges; output Integer activeNodes;
    output Boolean roundoffCertified; output Boolean converged[12]; output Integer iterations[12];
    output Real residualNorm[12];
  protected
    ModelicaPoseGraphCovariance.Result result;
  algorithm
    // Exactly representable phase spacing keeps the test's final timestamp exact.
    scenario:=min(cases,1+integer(floor(clock*8+1e-8)));
    result:=Run(scenario);
    upper:=result.upper; lower:=result.lower; residualUpper:=result.residualUpper;
    accepted:=result.accepted; status:=result.status; treeEdges:=result.treeEdges;
    activeNodes:=result.activeNodes; roundoffCertified:=result.roundoffCertified;
    converged:=result.converged; iterations:=result.iterations;
    residualNorm:=result.residualNorm;
  end AtTime;
end ModelicaPoseGraphCovarianceTests;
