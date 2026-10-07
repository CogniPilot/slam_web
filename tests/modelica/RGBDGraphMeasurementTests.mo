package RGBDGraphMeasurementTests
  function Raw
    input Integer id; input Integer kind; input Integer referenceId; input Integer currentId;
    output RGBDGraphMeasurements.Edge e;
  algorithm
    e.enabled := true; e.id := id; e.kind := kind; e.referenceId := referenceId; e.currentId := currentId;
    e.referenceSlot := mod(referenceId-1,128)+1; e.currentSlot := mod(currentId-1,128)+1;
    e.referenceEpoch := referenceId; e.currentEpoch := currentId;
    e.rotation := identity(3); e.translation := zeros(3); e.covariance := 0.01*identity(6); e.information := 100*identity(6);
  end Raw;

  function EqualEdge
    input RGBDGraphMeasurements.Edge a; input RGBDGraphMeasurements.Edge b; output Boolean equal;
  algorithm
    equal := a.enabled == b.enabled and a.id == b.id and a.kind == b.kind
      and a.referenceId == b.referenceId and a.currentId == b.currentId
      and a.referenceSlot == b.referenceSlot and a.currentSlot == b.currentSlot
      and a.referenceEpoch == b.referenceEpoch and a.currentEpoch == b.currentEpoch
      and max(abs(a.rotation-b.rotation)) == 0 and max(abs(a.translation-b.translation)) == 0
      and max(abs(a.covariance-b.covariance)) == 0 and max(abs(a.information-b.information)) == 0;
  end EqualEdge;

  function EqualState
    input RGBDGraphMeasurements.State a; input RGBDGraphMeasurements.State b; output Boolean equal;
  algorithm
    equal := a.generation == b.generation and a.revision == b.revision and a.lastCaptureId == b.lastCaptureId and a.nextEdgeId == b.nextEdgeId;
    for slot in 1:256 loop equal := equal and EqualEdge(a.edges[slot],b.edges[slot]); end for;
  end EqualState;

  function Proposal
    input RGBDKeyframes.Catalog c; input Integer a; input Integer b;
    output RGBDLoopVerification.Proposal p;
  algorithm
    p := RGBDLoopVerification.EmptyProposal(7); p.verified := true; p.rejectionReason := 0;
    p.generation := c.generation; p.referenceId := a; p.currentId := b;
    p.referenceEpoch := c.epochs[mod(a-1,128)+1]; p.currentEpoch := c.epochs[mod(b-1,128)+1];
    p.matchedCount := 32; p.inlierCount := 32; p.rms := 0;
    p.covariance := 0.01*identity(6); p.information := 100*identity(6);
    for feature in 1:350 loop
      p.inliers[feature] := feature <= 31 or feature == 350;
      p.partners[feature] := if p.inliers[feature] then feature else 0;
    end for;
  end Proposal;

  function FullState
    output RGBDGraphMeasurements.State s;
  algorithm
    s := RGBDGraphMeasurements.Empty(); s.revision := 128; s.lastCaptureId := 128; s.nextEdgeId := 257;
    for slot in 1:127 loop s.edges[slot] := Raw(slot,1,slot,slot+1); end for;
    for slot in 128:252 loop s.edges[slot] := Raw(slot,2,2,slot-124); end for;
    for slot in 253:256 loop s.edges[slot] := Raw(slot,2,3,slot-248); end for;
  end FullState;

  function Run
    input Real clock; output Boolean checks[20];
  protected
    RGBDKeyframes.Catalog old; RGBDKeyframes.Catalog captured; RGBDKeyframes.Catalog fresh;
    RGBDGraphMeasurements.State s; RGBDGraphMeasurements.State expected; RGBDGraphMeasurements.State damaged;
    RGBDGraphMeasurements.Update update; RGBDGraphMeasurements.Insertion insertion; RGBDGraphMeasurements.Problem problem;
    RGBDLoopVerification.Proposal sequential; RGBDLoopVerification.Proposal proposal; RGBDLoopVerification.Proposal loops[4];
    Boolean correct; Integer endpoint; Integer oldest; Integer source[256]; Integer target[256]; Real status; Real nodes; Real edges;
  algorithm
    old := RGBDCatalogLoopTests.FullCatalog(false); captured := old; s := FullState(); checks := fill(true,20);
    captured.nextId := 130; captured.nextSlot := 2; captured.lastEpoch := 129; captured.lastTime := 129+clock;
    captured.ids[1] := 129; captured.epochs[1] := 129; captured.imageTimes[1] := 129+clock;
    sequential := Proposal(captured,128,129);
    for rank in 1:4 loop loops[rank] := RGBDLoopVerification.EmptyProposal(7); end for;
    checks[1] := RGBDGraphMeasurements.ValidState(old,s) and RGBDGraphMeasurements.ValidProposal(captured,sequential);
    // Every raw edge field is independently prescribed by the fixture.
    for slot in 1:256 loop
      checks[1] := checks[1] and EqualEdge(s.edges[slot],Raw(slot,if slot <= 127 then 1 else 2,
        if slot <= 127 then slot else if slot <= 252 then 2 else 3,
        if slot <= 127 then slot+1 else if slot <= 252 then slot-124 else slot-248));
    end for;
    loops[1] := Proposal(captured,2,129); loops[2] := loops[1];
    update := RGBDGraphMeasurements.Capture(old,captured,s,sequential,loops,true);
    expected := s;
    for slot in 1:256 loop
      if slot == 1 then expected.edges[slot] := RGBDGraphMeasurements.EmptyEdge(); end if;
    end for;
    expected.edges[1] := Raw(257,1,128,129); expected.edges[128] := Raw(258,2,2,129);
    expected.lastCaptureId := 129; expected.nextEdgeId := 259; expected.revision := 129;
    checks[2] := update.accepted and update.removedEdges == 2 and update.admittedSequential == 1
      and update.admittedLoops == 1 and update.duplicateLoops == 1 and EqualState(update.state,expected);
    for rank in 1:4 loop loops[rank] := Proposal(captured,rank+1,129); end for;
    update := RGBDGraphMeasurements.Capture(old,captured,s,sequential,loops,true);
    damaged := s; damaged.edges[1] := Raw(257,1,128,129);
    for rank in 1:4 loop damaged.edges[127+rank] := Raw(257+rank,2,rank+1,129); end for;
    damaged.lastCaptureId := 129; damaged.nextEdgeId := 262; damaged.revision := 129;
    checks[17] := update.accepted and update.removedEdges == 5 and update.admittedSequential == 1
      and update.admittedLoops == 4 and update.duplicateLoops == 0 and EqualState(update.state,damaged);
    // Full-budget insertion evicts oldest loop (slot128), never any of127 chain edges.
    proposal := Proposal(old,4,128); insertion := RGBDGraphMeasurements.Insert(s,proposal,2);
    damaged := s; damaged.edges[128] := Raw(257,2,4,128); damaged.nextEdgeId := 258;
    checks[3] := insertion.accepted and not insertion.duplicate and insertion.replacedLoops == 1 and EqualState(insertion.state,damaged);
    proposal := Proposal(old,2,128); insertion := RGBDGraphMeasurements.Insert(s,proposal,2);
    checks[4] := insertion.accepted and insertion.duplicate and insertion.replacedLoops == 0 and EqualState(insertion.state,s);
    // Malformed capture proposals must hold every field, not merely edge masks.
    for scenario in 1:7 loop
      proposal := sequential;
      for rank in 1:4 loop loops[rank] := RGBDLoopVerification.EmptyProposal(7); end for;
      if scenario == 1 then proposal.referenceEpoch := 127;
      elseif scenario == 2 then proposal.currentEpoch := 128;
      elseif scenario == 3 then proposal.generation := 2;
      elseif scenario == 4 then proposal.bodyTranslation[1] := 0.1;
      elseif scenario == 5 then proposal.information[6,6] := 99;
      elseif scenario == 6 then proposal.partners[350] := 351;
      else proposal.verified := false;
      end if;
      update := RGBDGraphMeasurements.Capture(old,captured,s,proposal,loops,true);
      checks[4+scenario] := not update.accepted and update.rejectionReason == 4 and EqualState(update.state,s)
        and update.removedEdges == 0 and update.admittedSequential == 0 and update.admittedLoops == 0 and update.duplicateLoops == 0;
    end for;
    for rank in 1:4 loop loops[rank] := RGBDLoopVerification.EmptyProposal(7); end for;
    loops[1] := Proposal(captured,2,129); loops[1].partners[350] := 0;
    update := RGBDGraphMeasurements.Capture(old,captured,s,sequential,loops,true);
    checks[18] := not update.accepted and update.rejectionReason == 5 and EqualState(update.state,s)
      and update.removedEdges == 0 and update.admittedSequential == 0 and update.admittedLoops == 0;
    loops[1] := RGBDLoopVerification.EmptyProposal(7); damaged := s; damaged.edges[50].enabled := false;
    update := RGBDGraphMeasurements.Capture(old,captured,damaged,sequential,loops,true);
    checks[19] := not update.accepted and update.rejectionReason == 3 and EqualState(update.state,damaged);
    damaged := s; damaged.edges[256].enabled := false; damaged.edges[256].translation := {17,19,23};
    damaged.edges[256].rotation[1,2] := 37; damaged.edges[256].covariance[2,3] := 41; damaged.edges[256].information[4,5] := 43;
    damaged.generation := -4; captured.nextSlot := -1;
    update := RGBDGraphMeasurements.Capture(old,captured,damaged,sequential,loops,false);
    checks[12] := not update.accepted and update.rejectionReason == 1 and EqualState(update.state,damaged);
    // Reuse measured payload while independently binding a first new-generation capture.
    fresh := old; fresh.generation := 2; fresh.nextId := 2; fresh.nextSlot := 2; fresh.lastEpoch := 1; fresh.lastTime := 1;
    fresh.occupied := fill(false,128); fresh.occupied[1] := true; fresh.ids[1] := 1; fresh.generations[1] := 2;
    fresh.epochs[1] := 1; fresh.imageTimes[1] := 1;
    damaged.generation := 1; proposal := RGBDLoopVerification.EmptyProposal(7);
    update := RGBDGraphMeasurements.Capture(old,fresh,damaged,proposal,loops,true,true);
    damaged := RGBDGraphMeasurements.Empty(2); damaged.revision := 1; damaged.lastCaptureId := 1;
    checks[13] := update.accepted and EqualState(update.state,damaged);
    captured := old; captured.nextId := 130; captured.nextSlot := 2; captured.lastEpoch := 129; captured.lastTime := 129+clock;
    captured.ids[1] := 129; captured.epochs[1] := 129; captured.imageTimes[1] := 129+clock;
    damaged := expected;
    problem := RGBDGraphMeasurements.PrepareProblem(captured,expected);
    correct := problem.accepted and problem.nodeCount == 128 and problem.edgeCount == 256 and problem.correlationInflation == 256;
    for node in 1:128 loop
      endpoint := mod(node,128)+1;
      correct := correct and problem.nodeId[node] == node+1 and problem.catalogSlot[node] == endpoint and problem.nodeMask[node] == 1
        and max(abs(problem.positions[node,:]-captured.bodyPositions[endpoint,:])) == 0
        and max(abs(problem.rotations[node,:,:]-captured.bodyRotations[endpoint,:,:])) == 0;
    end for;
    for slot in 1:256 loop
      correct := correct and problem.edgeMask[slot] == (if expected.edges[slot].enabled then 1 else 0);
      if expected.edges[slot].enabled then
        correct := correct and problem.fromNode[slot] == expected.edges[slot].referenceId-1 and problem.toNode[slot] == expected.edges[slot].currentId-1
          and max(abs(problem.measuredRotation[slot,:,:]-expected.edges[slot].rotation)) == 0
          and max(abs(problem.measuredTranslation[slot,:]-expected.edges[slot].translation)) == 0
          and max(abs(problem.information[slot,:,:]-100.0/256*identity(6))) < 1e-14;
      else correct := correct and problem.fromNode[slot] == 0 and problem.toNode[slot] == 0
        and max(abs(problem.measuredRotation[slot,:,:]-identity(3))) == 0
        and max(abs(problem.measuredTranslation[slot,:])) == 0 and max(abs(problem.information[slot,:,:])) == 0;
      end if;
    end for;
    checks[14] := correct and EqualState(expected,damaged);
    (source,target,status,nodes,edges) := PGValidateGraph(problem.positions,problem.rotations,problem.nodeMask,problem.edgeMask,
      problem.fromNode,problem.toNode,problem.measuredTranslation,problem.measuredRotation,problem.information);
    checks[15] := status == 1 and nodes == 128 and edges == 256;
    damaged := expected; damaged.edges[1].enabled := false;
    problem := RGBDGraphMeasurements.PrepareProblem(captured,damaged);
    checks[16] := not problem.accepted and problem.nodeCount == 0 and problem.edgeCount == 0 and max(abs(problem.edgeMask)) == 0
      and RGBDGraphMeasurements.ValidState(captured,expected);
    // Idle preparation must produce a canonical inert problem before reading invalid domains.
    captured.nextId := -17; captured.nextSlot := -1; captured.generation := -3; captured.lastEpoch := -5;
    damaged := expected; damaged.generation := -7; damaged.revision := -1;
    for slot in 1:256 loop
      damaged.edges[slot].referenceId := -19; damaged.edges[slot].currentId := 1000000;
      damaged.edges[slot].referenceSlot := -23; damaged.edges[slot].currentSlot := 1000000;
      damaged.edges[slot].rotation := fill(1e101,3,3); damaged.edges[slot].translation := fill(1e101,3);
      damaged.edges[slot].covariance := fill(1e101,6,6); damaged.edges[slot].information := fill(-1e101,6,6);
    end for;
    problem := RGBDGraphMeasurements.PrepareProblem(captured,damaged,false);
    correct := not problem.accepted and problem.nodeCount == 0 and problem.edgeCount == 0 and problem.correlationInflation == 1;
    for node in 1:128 loop
      correct := correct and problem.nodeId[node] == 0 and problem.catalogSlot[node] == 0 and problem.nodeMask[node] == 0
        and max(abs(problem.positions[node,:])) == 0 and max(abs(problem.rotations[node,:,:]-identity(3))) == 0;
    end for;
    for slot in 1:256 loop
      correct := correct and problem.edgeMask[slot] == 0 and problem.fromNode[slot] == 0 and problem.toNode[slot] == 0
        and max(abs(problem.measuredRotation[slot,:,:]-identity(3))) == 0
        and max(abs(problem.measuredTranslation[slot,:])) == 0 and max(abs(problem.information[slot,:,:])) == 0;
    end for;
    checks[20] := correct;
  end Run;
end RGBDGraphMeasurementTests;
