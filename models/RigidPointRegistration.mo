// Horn absolute orientation for matched 3D point pairs. No pose truth enters
// this component. Correspondence production and temporal pose composition are
// separate frontend/backend responsibilities.
function RegistrationEigen4
  input Real matrix[4,4];
  output Real values[4];
  output Real dominant[4];
  output Real gap;
  output Real offDiagonal;
protected
  Real work[4,4];
  Real vectors[4,4];
  Real scale;
  Real tau; Real tangent; Real cosine; Real sine;
  Real first; Real second; Real entry; Real active;
  Real largest; Real runnerUp;
  Integer index;
algorithm
  scale := 0.0;
  for i in 1:4 loop
    for j in 1:4 loop
      scale := max(scale,abs(matrix[i,j]));
    end for;
  end for;
  work := matrix/(if scale > 0.0 then scale else 1.0);
  vectors := identity(4);
  for sweep in 1:24 loop
    for p in 1:3 loop
      for q in 1:4 loop
        entry := work[p,q];
        active := if q > p and abs(entry) > 1e-14 then 1.0 else 0.0;
        tau := (work[q,q]-work[p,p])/(if active > 0.0 then 2.0*entry else 1.0);
        tangent := if active <= 0.0 then 0.0 else if tau >= 0.0 then
          1.0/(tau+sqrt(1.0+tau*tau)) else -1.0/(-tau+sqrt(1.0+tau*tau));
        cosine := 1.0/sqrt(1.0+tangent*tangent);
        sine := tangent*cosine;
        work[p,p] := work[p,p]-tangent*entry;
        work[q,q] := work[q,q]+tangent*entry;
        work[p,q] := if active > 0.0 then 0.0 else entry;
        work[q,p] := work[p,q];
        for k in 1:4 loop
          first := work[k,p]; second := work[k,q];
          work[k,p] := if k <> p and k <> q then cosine*first-sine*second else first;
          work[p,k] := if k <> p and k <> q then work[k,p] else work[p,k];
          work[k,q] := if k <> p and k <> q then sine*first+cosine*second else second;
          work[q,k] := if k <> p and k <> q then work[k,q] else work[q,k];
          first := vectors[k,p]; second := vectors[k,q];
          vectors[k,p] := cosine*first-sine*second;
          vectors[k,q] := sine*first+cosine*second;
        end for;
      end for;
    end for;
  end for;
  largest := work[1,1]; runnerUp := -1e100; index := 1;
  for i in 2:4 loop
    if work[i,i] > largest then
      runnerUp := largest; largest := work[i,i]; index := i;
    else
      runnerUp := max(runnerUp,work[i,i]);
    end if;
  end for;
  offDiagonal := 0.0;
  for i in 1:4 loop
    values[i] := work[i,i]*scale;
    dominant[i] := vectors[i,index];
    for j in 1:4 loop
      offDiagonal := if i <> j then max(offDiagonal,abs(work[i,j])) else offDiagonal;
    end for;
  end for;
  gap := (largest-runnerUp)*scale;
end RegistrationEigen4;

// Three ordered full-domain passes retain compact runtime loop ownership.
// Disabled or invalid pairs never enter multiplication, even with NaN inputs.
function FitRigidPointPairs
  input Real sourcePoint[:,:];
  input Real targetPoint[:,:];
  input Real pairEnabled[:];
  input Real activeCount;
  input Real coordinateLimit;
  input Real rankTolerance;
  input Real maximumRms;
  output Real accepted;
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
protected
  Boolean mask[size(pairEnabled,1)];
  Boolean domainValid;
  Real crossCovariance[3,3]; Real sourceCovariance[4,4];
  Real horn[4,4]; Real hornValues[4]; Real sourceValues[4];
  Real quaternion[4]; Real unusedVector[4];
  Real unusedGap; Real hornResidual; Real sourceResidual;
  Real sourceScale; Real hornScale;
  Real candidateRotation[3,3]; Real candidateTranslation[3];
  Real error;
algorithm
  domainValid := activeCount >= 0.0 and activeCount <= size(pairEnabled,1) and floor(activeCount) >= activeCount and
    size(pairEnabled,1) >= 3 and size(sourcePoint,1) == size(pairEnabled,1) and size(targetPoint,1) == size(pairEnabled,1) and
    size(sourcePoint,2) == 3 and size(targetPoint,2) == 3 and
    coordinateLimit > 0.0 and coordinateLimit <= 1e6 and rankTolerance >= 1e-12 and rankTolerance <= 1e-2 and
    maximumRms >= 0.0 and maximumRms <= 1e6;
  mask := fill(false,size(pairEnabled,1));
  validCount := 0.0; invalidCount := 0.0;
  sourceCentroid := zeros(3); targetCentroid := zeros(3);
  for i in 1:size(pairEnabled,1) loop
    if domainValid and i <= activeCount then
      if pairEnabled[i] >= 1.0 and pairEnabled[i] <= 1.0 and
        abs(sourcePoint[i,1]) <= coordinateLimit and abs(sourcePoint[i,2]) <= coordinateLimit and abs(sourcePoint[i,3]) <= coordinateLimit and
        abs(targetPoint[i,1]) <= coordinateLimit and abs(targetPoint[i,2]) <= coordinateLimit and abs(targetPoint[i,3]) <= coordinateLimit then
        mask[i] := true;
        validCount := validCount+1.0;
        for a in 1:3 loop
          sourceCentroid[a] := sourceCentroid[a]+sourcePoint[i,a];
          targetCentroid[a] := targetCentroid[a]+targetPoint[i,a];
        end for;
      elseif not (pairEnabled[i] >= 0.0 and pairEnabled[i] <= 0.0) then
        invalidCount := invalidCount+1.0;
      end if;
    end if;
  end for;
  sourceCentroid := sourceCentroid/max(validCount,1.0);
  targetCentroid := targetCentroid/max(validCount,1.0);
  crossCovariance := zeros(3,3); sourceCovariance := zeros(4,4);
  for i in 1:size(pairEnabled,1) loop
    if mask[i] then
      for a in 1:3 loop
        for b in 1:3 loop
          crossCovariance[a,b] := crossCovariance[a,b]+(sourcePoint[i,a]-sourceCentroid[a])*(targetPoint[i,b]-targetCentroid[b]);
          sourceCovariance[a,b] := sourceCovariance[a,b]+(sourcePoint[i,a]-sourceCentroid[a])*(sourcePoint[i,b]-sourceCentroid[b]);
        end for;
      end for;
    end if;
  end for;
  crossCovariance := crossCovariance/max(validCount,1.0);
  sourceCovariance := sourceCovariance/max(validCount,1.0);
  horn := {{crossCovariance[1,1]+crossCovariance[2,2]+crossCovariance[3,3],crossCovariance[2,3]-crossCovariance[3,2],crossCovariance[3,1]-crossCovariance[1,3],crossCovariance[1,2]-crossCovariance[2,1]},
    {crossCovariance[2,3]-crossCovariance[3,2],crossCovariance[1,1]-crossCovariance[2,2]-crossCovariance[3,3],crossCovariance[1,2]+crossCovariance[2,1],crossCovariance[1,3]+crossCovariance[3,1]},
    {crossCovariance[3,1]-crossCovariance[1,3],crossCovariance[1,2]+crossCovariance[2,1],-crossCovariance[1,1]+crossCovariance[2,2]-crossCovariance[3,3],crossCovariance[2,3]+crossCovariance[3,2]},
    {crossCovariance[1,2]-crossCovariance[2,1],crossCovariance[1,3]+crossCovariance[3,1],crossCovariance[2,3]+crossCovariance[3,2],-crossCovariance[1,1]-crossCovariance[2,2]+crossCovariance[3,3]}};
  (hornValues,quaternion,eigenGap,hornResidual) := RegistrationEigen4(horn);
  (sourceValues,unusedVector,unusedGap,sourceResidual) := RegistrationEigen4(sourceCovariance);
  sourceScale := 0.0; hornScale := 0.0;
  for i in 1:4 loop
    sourceScale := max(sourceScale,abs(sourceValues[i]));
    hornScale := max(hornScale,abs(hornValues[i]));
  end for;
  rank := 0.0;
  for i in 1:4 loop
    rank := rank+(if sourceValues[i] > rankTolerance*sourceScale then 1.0 else 0.0);
  end for;
  candidateRotation := {{1.0-2.0*(quaternion[3]^2+quaternion[4]^2),2.0*(quaternion[2]*quaternion[3]-quaternion[1]*quaternion[4]),2.0*(quaternion[2]*quaternion[4]+quaternion[1]*quaternion[3])},
    {2.0*(quaternion[2]*quaternion[3]+quaternion[1]*quaternion[4]),1.0-2.0*(quaternion[2]^2+quaternion[4]^2),2.0*(quaternion[3]*quaternion[4]-quaternion[1]*quaternion[2])},
    {2.0*(quaternion[2]*quaternion[4]-quaternion[1]*quaternion[3]),2.0*(quaternion[3]*quaternion[4]+quaternion[1]*quaternion[2]),1.0-2.0*(quaternion[2]^2+quaternion[3]^2)}};
  candidateTranslation := zeros(3);
  for a in 1:3 loop
    candidateTranslation[a] := targetCentroid[a];
    for b in 1:3 loop
      candidateTranslation[a] := candidateTranslation[a]-candidateRotation[a,b]*sourceCentroid[b];
    end for;
  end for;
  cost := 0.0;
  for i in 1:size(pairEnabled,1) loop
    if mask[i] then
      for a in 1:3 loop
        error := candidateTranslation[a]-targetPoint[i,a];
        for b in 1:3 loop
          error := error+candidateRotation[a,b]*sourcePoint[i,b];
        end for;
        cost := cost+error*error;
      end for;
    end if;
  end for;
  rms := sqrt(max(cost,0.0)/max(validCount,1.0));
  rejectionReason := if not domainValid then 1.0 else if invalidCount > 0.0 then 2.0 else if validCount < 3.0 then 3.0
    else if rank < 2.0 or eigenGap <= rankTolerance*max(sourceScale,hornScale) then 4.0
    else if hornResidual > 1e-10 or sourceResidual > 1e-10 then 5.0
    else if not (rms >= 0.0 and rms <= maximumRms) then 6.0 else 0.0;
  accepted := if rejectionReason <= 0.0 then 1.0 else 0.0;
  rotation := if accepted > 0.0 then candidateRotation else identity(3);
  translation := if accepted > 0.0 then candidateTranslation else zeros(3);
end FitRigidPointPairs;

model RigidPointRegistration
  parameter Integer capacity = 14400;
  parameter Real coordinateLimit = 1e6;
  parameter Real rankTolerance = 1e-8;
  parameter Real maximumRms = 0.02;
  input Real activeCount = 0.0;
  input Real sourcePoint[capacity,3] = zeros(capacity,3);
  input Real targetPoint[capacity,3] = zeros(capacity,3);
  // Exactly 0 disables a pair; exactly 1 requests a finite matched pair.
  input Real pairEnabled[capacity] = ones(capacity);
  output Real accepted;
  // 0 accepted; 1 domain; 2 invalid pair; 3 insufficient; 4 degeneracy;
  // 5 eigensolver convergence; 6 fitted RMS gate. Rejection is identity/zero.
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
equation
  (accepted,rejectionReason,rotation,translation,validCount,invalidCount,rank,cost,rms,eigenGap,sourceCentroid,targetCentroid) =
    FitRigidPointPairs(sourcePoint,targetPoint,pairEnabled,activeCount,coordinateLimit,rankTolerance,maximumRms);
end RigidPointRegistration;

// Squared whitened residual from a diagonally equilibrated Cholesky solve.
// Invalid/singular covariance refuses: no invented noise floor or inverse.
function RegistrationWhitenedResidual3
  input Real residual[3]; input Real covariance[3,3];
  input Real minimumPivot = 1e-10;
  output Boolean valid; output Real squaredResidual;
protected
  Real scale[3]; Real normalized[3,3]; Real lower[3,3]; Real whitened[3];
  Real pivot;
algorithm
  valid := minimumPivot > 0.0 and minimumPivot < 1.0;
  scale := ones(3); normalized := zeros(3,3); lower := zeros(3,3); whitened := zeros(3);
  for axis in 1:3 loop
    valid := valid and covariance[axis,axis] > 0.0 and covariance[axis,axis] < 1e100
      and abs(residual[axis]) < 1e100;
    if valid then scale[axis] := sqrt(covariance[axis,axis]); end if;
  end for;
  for row in 1:3 loop
    for column in 1:3 loop
      normalized[row,column] := covariance[row,column]/scale[row]/scale[column];
      valid := valid and abs(normalized[row,column]) < 1e100
        and abs(normalized[row,column]-covariance[column,row]/scale[row]/scale[column]) <= 1e-10;
    end for;
  end for;
  for row in 1:3 loop
    for column in 1:row loop
      if valid then
        pivot := normalized[row,column];
        for previous in 1:column-1 loop
          pivot := pivot-lower[row,previous]*lower[column,previous];
        end for;
        if row == column then
          valid := pivot >= minimumPivot and pivot < 1e100;
          if valid then lower[row,column] := sqrt(pivot); end if;
        else
          lower[row,column] := pivot/lower[column,column];
        end if;
      end if;
    end for;
    if valid then
      pivot := residual[row]/scale[row];
      for previous in 1:row-1 loop pivot := pivot-lower[row,previous]*whitened[previous]; end for;
      whitened[row] := pivot/lower[row,row];
    end if;
  end for;
  squaredResidual := whitened*whitened;
  valid := valid and squaredResidual >= 0.0 and squaredResidual < 1e100;
  if not valid then squaredResidual := 0.0; end if;
end RegistrationWhitenedResidual3;

function RegistrationPairResidual
  input Real source[3]; input Real target[3];
  input Real rotation[3,3]; input Real translation[3];
  input Boolean useCovariance;
  input Real sourceCovariance[3,3]; input Real targetCovariance[3,3];
  input Real minimumPivot;
  output Boolean valid; output Real squaredResidual;
protected
  Real residual[3]; Real covariance[3,3];
algorithm
  residual := rotation*source+translation-target;
  if useCovariance then
    covariance := rotation*sourceCovariance*transpose(rotation)+targetCovariance;
    (valid,squaredResidual) := RegistrationWhitenedResidual3(residual,covariance,minimumPivot);
  else
    squaredResidual := residual*residual;
    valid := squaredResidual >= 0.0 and squaredResidual < 1e100;
  end if;
end RegistrationPairResidual;

// Deterministic bounded consensus is considered only after the original fit's
// strict residual refusal. Domain, invalid-pair, rank and eigensolver refusals
// are never rescued. Clean fits retain the exact original fit and operation order.
// Added configuration: hypotheses1..1024 and consensus fraction in(0,1].
// Reason7 means no admissible stable consensus within the declared work bounds.
function FitRigidPointPairsRobust
  input Real sourcePoint[:,:];
  input Real targetPoint[:,:];
  input Real pairEnabled[:];
  input Real activeCount;
  input Real coordinateLimit;
  input Real rankTolerance;
  input Real maximumRms;
  input Integer maximumHypotheses = 64;
  input Real minimumConsensusFraction = 0.5;
  output Real accepted;
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
  output Real finalInlierMask[size(pairEnabled,1)];
  output Real rejectedCount;
  input Boolean useCovariance = false;
  input Real sourceCovariance[size(pairEnabled,1),3,3] = zeros(size(pairEnabled,1),3,3);
  input Real targetCovariance[size(pairEnabled,1),3,3] = zeros(size(pairEnabled,1),3,3);
  input Real maximumNormalizedSquared = 9.0 "Squared radius in whitened 3D residual space";
  input Real covarianceMinimumPivot = 1e-10;
protected
  constant Integer dimension = 3;
  constant Integer maximumRefinements = 4;
  constant Integer stateModulus = 2147483647;
  constant Integer stateMultiplier = 16807;
  constant Integer stateQuotient = 127773;
  constant Integer stateRemainder = 2836;
  Boolean configurationValid; Boolean searching; Boolean stable;
  Boolean residualValid; Boolean covarianceValid; Boolean allInliers;
  Integer enabledIndices[size(pairEnabled,1)]; Integer enabledCount;
  Integer sampleIndices[dimension]; Integer lowIndex; Integer highIndex;
  Integer state; Integer candidateCount; Integer bestCount; Integer retainedCount;
  Integer minimumConsensus; Integer index;
  Real originalValidCount; Real squaredLimit; Real residual; Real squaredResidual;
  Real candidateCost; Real bestCost;
  Real fitMaximumRms; Real unusedScore;
  Real candidateMask[size(pairEnabled,1)]; Real bestMask[size(pairEnabled,1)];
  Real sampleSource[dimension,dimension]; Real sampleTarget[dimension,dimension];
  Real fitAccepted; Real fitReason; Real fitRotation[dimension,dimension]; Real fitTranslation[dimension];
  Real fitValidCount; Real fitInvalidCount; Real fitRank; Real fitCost; Real fitRms; Real fitEigenGap;
  Real fitSourceCentroid[dimension]; Real fitTargetCentroid[dimension];
algorithm
  // In calibrated mode the geometric solver estimates an unweighted rigid
  // transform; per-pair covariance certifies its residuals below. A fixed
  // metric RMS must not reject a noisy hypothesis before that test can run.
  fitMaximumRms := if useCovariance then 1e6 else maximumRms;
  (accepted,rejectionReason,rotation,translation,validCount,invalidCount,rank,cost,rms,
    eigenGap,sourceCentroid,targetCentroid) := FitRigidPointPairs(
      sourcePoint,targetPoint,pairEnabled,activeCount,coordinateLimit,rankTolerance,fitMaximumRms);
  finalInlierMask := zeros(size(pairEnabled,1)); rejectedCount := 0.0;
  configurationValid := maximumHypotheses >= 1 and maximumHypotheses <= 1024
    and minimumConsensusFraction > 0.0 and minimumConsensusFraction <= 1.0
    and maximumRms >= 0.0 and maximumRms <= 1e6;
  if useCovariance then
    configurationValid := configurationValid and maximumNormalizedSquared > 0.0
      and maximumNormalizedSquared <= 1e6 and covarianceMinimumPivot > 0.0 and covarianceMinimumPivot < 1.0;
    for pair in 1:size(pairEnabled,1) loop
      if pair <= activeCount and pairEnabled[pair] == 1.0 then
        (covarianceValid,unusedScore) := RegistrationWhitenedResidual3(zeros(3),sourceCovariance[pair,:,:],covarianceMinimumPivot);
        configurationValid := configurationValid and covarianceValid;
        (covarianceValid,unusedScore) := RegistrationWhitenedResidual3(zeros(3),targetCovariance[pair,:,:],covarianceMinimumPivot);
        configurationValid := configurationValid and covarianceValid;
      end if;
    end for;
    if accepted > 0.5 then
      allInliers := true;
      for pair in 1:size(pairEnabled,1) loop
        if pair <= activeCount and pairEnabled[pair] == 1.0 then
          (residualValid,squaredResidual) := RegistrationPairResidual(sourcePoint[pair,:],targetPoint[pair,:],
            rotation,translation,true,sourceCovariance[pair,:,:],targetCovariance[pair,:,:],covarianceMinimumPivot);
          allInliers := allInliers and residualValid and squaredResidual <= maximumNormalizedSquared;
        end if;
      end for;
      if not allInliers then
        accepted := 0.0; rejectionReason := 6.0; rotation := identity(dimension); translation := zeros(dimension);
      end if;
    end if;
  end if;
  if not configurationValid then
    accepted := 0.0; rejectionReason := 1.0; rotation := identity(dimension); translation := zeros(dimension);
  elseif accepted > 0.5 then
    for pair in 1:size(pairEnabled,1) loop
      finalInlierMask[pair] := if pair <= activeCount and pairEnabled[pair] >= 1.0 and pairEnabled[pair] <= 1.0 then 1.0 else 0.0;
    end for;
  elseif rejectionReason >= 6.0 and rejectionReason <= 6.0 then
    // The original reason6 proves all active requested pairs valid and finite.
    originalValidCount := validCount; enabledCount := 0;
    enabledIndices := fill(0,size(pairEnabled,1));
    for pair in 1:size(pairEnabled,1) loop
      if pair <= activeCount and pairEnabled[pair] >= 1.0 and pairEnabled[pair] <= 1.0 then
        enabledCount := enabledCount+1; enabledIndices[enabledCount] := pair;
      end if;
    end for;
    minimumConsensus := max(dimension,integer(ceil(minimumConsensusFraction*originalValidCount)));
    squaredLimit := if useCovariance then maximumNormalizedSquared else maximumRms*maximumRms;
    candidateMask := zeros(size(pairEnabled,1)); bestMask := zeros(size(pairEnabled,1));
    bestCount := 0; bestCost := 0.0; state := 1;
    sampleSource := zeros(dimension,dimension); sampleTarget := zeros(dimension,dimension);
    for hypothesis in 1:maximumHypotheses loop
      // Schrage's form of the31-bit Park-Miller state keeps every intermediate
      // inside signed32-bit range; no host RNG or unbounded duplicate retry.
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[1] := 1+mod(state,enabledCount);
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[2] := 1+mod(state,enabledCount-1);
      if sampleIndices[2] >= sampleIndices[1] then sampleIndices[2] := sampleIndices[2]+1; end if;
      lowIndex := min(sampleIndices[1],sampleIndices[2]); highIndex := max(sampleIndices[1],sampleIndices[2]);
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[3] := 1+mod(state,enabledCount-2);
      if sampleIndices[3] >= lowIndex then sampleIndices[3] := sampleIndices[3]+1; end if;
      if sampleIndices[3] >= highIndex then sampleIndices[3] := sampleIndices[3]+1; end if;
      for sample in 1:dimension loop
        index := enabledIndices[sampleIndices[sample]];
        for axis in 1:dimension loop
          sampleSource[sample,axis] := sourcePoint[index,axis];
          sampleTarget[sample,axis] := targetPoint[index,axis];
        end for;
      end for;
      (fitAccepted,fitReason,fitRotation,fitTranslation,fitValidCount,fitInvalidCount,fitRank,
        fitCost,fitRms,fitEigenGap,fitSourceCentroid,fitTargetCentroid) := FitRigidPointPairs(
          sampleSource,sampleTarget,ones(dimension),dimension,coordinateLimit,rankTolerance,fitMaximumRms);
      if fitAccepted > 0.5 then
        candidateCount := 0; candidateCost := 0.0;
        for compact in 1:enabledCount loop
          index := enabledIndices[compact];
          if useCovariance then
            (residualValid,squaredResidual) := RegistrationPairResidual(sourcePoint[index,:],targetPoint[index,:],
              fitRotation,fitTranslation,true,sourceCovariance[index,:,:],targetCovariance[index,:,:],covarianceMinimumPivot);
          else
            // Preserve the original clean/Euclidean operation order.
            residualValid := true; squaredResidual := 0.0;
            for axis in 1:dimension loop
              residual := fitTranslation[axis]-targetPoint[index,axis];
              for column in 1:dimension loop residual := residual+fitRotation[axis,column]*sourcePoint[index,column]; end for;
              squaredResidual := squaredResidual+residual*residual;
            end for;
          end if;
          candidateMask[index] := if residualValid and squaredResidual >= 0.0 and squaredResidual <= squaredLimit then 1.0 else 0.0;
          if candidateMask[index] > 0.5 then
            candidateCount := candidateCount+1; candidateCost := candidateCost+squaredResidual;
          end if;
        end for;
        if candidateCount > bestCount or (candidateCount == bestCount and candidateCost < bestCost) then
          bestCount := candidateCount; bestCost := candidateCost; bestMask := candidateMask;
        end if;
      end if;
    end for;
    searching := bestCount >= minimumConsensus; stable := false;
    for refinement in 1:maximumRefinements loop
      if searching then
        (fitAccepted,fitReason,fitRotation,fitTranslation,fitValidCount,fitInvalidCount,fitRank,
          fitCost,fitRms,fitEigenGap,fitSourceCentroid,fitTargetCentroid) := FitRigidPointPairs(
            sourcePoint,targetPoint,bestMask,activeCount,coordinateLimit,rankTolerance,fitMaximumRms);
        if fitAccepted > 0.5 then
          retainedCount := 0;
          for compact in 1:enabledCount loop
            index := enabledIndices[compact]; candidateMask[index] := 0.0;
            if bestMask[index] > 0.5 then
              if useCovariance then
                (residualValid,squaredResidual) := RegistrationPairResidual(sourcePoint[index,:],targetPoint[index,:],
                  fitRotation,fitTranslation,true,sourceCovariance[index,:,:],targetCovariance[index,:,:],covarianceMinimumPivot);
              else
                residualValid := true; squaredResidual := 0.0;
                for axis in 1:dimension loop
                  residual := fitTranslation[axis]-targetPoint[index,axis];
                  for column in 1:dimension loop residual := residual+fitRotation[axis,column]*sourcePoint[index,column]; end for;
                  squaredResidual := squaredResidual+residual*residual;
                end for;
              end if;
              if residualValid and squaredResidual >= 0.0 and squaredResidual <= squaredLimit then
                candidateMask[index] := 1.0; retainedCount := retainedCount+1;
              end if;
            end if;
          end for;
          stable := retainedCount == bestCount and retainedCount >= minimumConsensus;
          if stable then
            accepted := fitAccepted; rejectionReason := fitReason;
            rotation := fitRotation; translation := fitTranslation;
            validCount := fitValidCount; invalidCount := fitInvalidCount; rank := fitRank;
            cost := fitCost; rms := fitRms; eigenGap := fitEigenGap;
            sourceCentroid := fitSourceCentroid; targetCentroid := fitTargetCentroid;
            finalInlierMask := bestMask; rejectedCount := originalValidCount-fitValidCount;
            searching := false;
          else
            bestMask := candidateMask; bestCount := retainedCount;
            searching := retainedCount >= minimumConsensus;
          end if;
        else
          searching := false;
        end if;
      end if;
    end for;
    if not stable then
      accepted := 0.0; rejectionReason := 7.0;
      rotation := identity(dimension); translation := zeros(dimension);
      // Retain original full-fit diagnostics, but never publish an unproved mask.
      finalInlierMask := zeros(size(pairEnabled,1)); rejectedCount := 0.0;
    end if;
  end if;
end FitRigidPointPairsRobust;
