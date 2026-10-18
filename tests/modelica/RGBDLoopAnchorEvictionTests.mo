package RGBDLoopAnchorEvictionTests
  "Forced eviction of a loop-anchored keyframe's references; needs loopAnchoredCapture = true"
  constant Integer capacity = RGBDKeyframes.keyframeCapacity;

  function Advance
    "Catalog after one more capture into the next ring slot"
    input RGBDKeyframes.Catalog c; input Real clock; output RGBDKeyframes.Catalog n;
  protected
    Integer slot;
  algorithm
    n := c; slot := c.nextSlot; n.nextId := c.nextId+1; n.nextSlot := mod(slot,capacity)+1;
    n.lastEpoch := c.nextId; n.lastTime := c.nextId+clock;
    n.ids[slot] := c.nextId; n.epochs[slot] := c.nextId; n.imageTimes[slot] := c.nextId+clock;
  end Advance;

  function AnchoredState
    "Chain 1 to capacity-1; keyframe capacity has no consecutive edge, only loops from 1 and 2"
    output RGBDGraphMeasurements.State s;
  algorithm
    s := RGBDGraphMeasurements.Empty(); s.revision := capacity; s.lastCaptureId := capacity; s.nextEdgeId := capacity+1;
    for slot in 1:capacity-2 loop s.edges[slot] := RGBDGraphMeasurementTests.Raw(slot,1,slot,slot+1); end for;
    s.edges[capacity-1] := RGBDGraphMeasurementTests.Raw(capacity-1,2,1,capacity);
    s.edges[capacity] := RGBDGraphMeasurementTests.Raw(capacity,2,2,capacity);
  end AnchoredState;

  function Run
    input Real clock; output Boolean checks[8];
  protected
    RGBDKeyframes.Catalog old; RGBDKeyframes.Catalog c1; RGBDKeyframes.Catalog c2; RGBDKeyframes.Catalog c;
    RGBDGraphMeasurements.State s; RGBDGraphMeasurements.Update u1; RGBDGraphMeasurements.Update u2; RGBDGraphMeasurements.Update u;
    RGBDGraphMeasurements.Problem p; RGBDLoopVerification.Proposal loops[4];
    Boolean correct; Integer from; Integer to; Integer inside;
  algorithm
    checks := fill(true,8);
    old := RGBDCatalogLoopTests.FullCatalog(false); s := AnchoredState();
    for rank in 1:4 loop loops[rank] := RGBDLoopVerification.EmptyProposal(7); end for;
    // Before eviction: one component, gauge at the oldest stored id.
    p := RGBDGraphMeasurements.PrepareProblem(old,s);
    checks[1] := RGBDGraphMeasurements.ValidState(old,s) and RGBDGraphMeasurements.Anchored(old,s,capacity)
      and RGBDGraphMeasurements.ActiveOldest(old,s) == 1
      and p.accepted and p.nodeCount == capacity and p.detachedNodes == 0 and p.edgeCount == capacity and p.nodeId[1] == 1;
    // Capture capacity+1 evicts id 1, one of the anchored keyframe's two references: it stays attached through 2.
    c1 := Advance(old,clock);
    u1 := RGBDGraphMeasurements.Capture(old,c1,s,RGBDGraphMeasurementTests.Proposal(c1,capacity,capacity+1),loops,true);
    p := RGBDGraphMeasurements.PrepareProblem(c1,u1.state);
    checks[2] := u1.accepted and u1.removedEdges == 2 and u1.admittedSequential == 1 and u1.admittedLoopAnchored == 0
      and RGBDGraphMeasurements.ActiveOldest(c1,u1.state) == 2
      and p.accepted and p.nodeCount == capacity and p.detachedNodes == 0 and p.nodeId[1] == 2;
    // Capture capacity+2 evicts id 2, the last reference: ids 3 to capacity-1 detach from the newest keyframe.
    c2 := Advance(c1,clock);
    u2 := RGBDGraphMeasurements.Capture(c1,c2,u1.state,RGBDGraphMeasurementTests.Proposal(c2,capacity+1,capacity+2),loops,true);
    checks[3] := u2.accepted and u2.rejectionReason == 0 and u2.removedEdges == 2 and u2.admittedSequential == 1
      and RGBDGraphMeasurements.ValidState(c2,u2.state);
    // The gauge moves to the oldest node of the newest component, the anchored keyframe.
    p := RGBDGraphMeasurements.PrepareProblem(c2,u2.state);
    checks[4] := RGBDGraphMeasurements.ActiveOldest(c2,u2.state) == capacity and p.accepted and p.nodeId[1] == capacity;
    // detachedNodes counts them, and the solve holds only the newest component.
    correct := p.detachedNodes == capacity-3 and p.nodeCount == 3 and p.edgeCount == 2 and p.correlationInflation == 2
      and p.nodeId[2] == capacity+1 and p.nodeId[3] == capacity+2;
    for node in 1:capacity loop
      correct := correct and p.nodeMask[node] == (if node <= 3 then 1 else 0);
      if node <= 3 then correct := correct and max(abs(p.positions[node,:]-c2.bodyPositions[p.catalogSlot[node],:])) == 0; end if;
    end for;
    checks[5] := correct;
    // Only the two edges inside the component are in the solve, with rows remapped to it.
    correct := true; inside := 0;
    for slot in 1:RGBDGraphMeasurements.edgeCapacity loop
      if u2.state.edges[slot].enabled and u2.state.edges[slot].referenceId >= capacity then
        inside := inside+1; from := u2.state.edges[slot].referenceId-capacity+1; to := u2.state.edges[slot].currentId-capacity+1;
        correct := correct and p.edgeMask[slot] == 1 and p.fromNode[slot] == from and p.toNode[slot] == to
          and max(abs(p.information[slot,:,:]-50*identity(6))) < 1e-12;
      else
        correct := correct and p.edgeMask[slot] == 0 and p.fromNode[slot] == 0 and p.toNode[slot] == 0;
      end if;
    end for;
    checks[6] := correct and inside == 2;
    // No permanent stall: five more captures are admitted. Each evicts one
    // detached node; the gauge stays at the anchored keyframe and the component grows.
    c := c2; s := u2.state; correct := true;
    for step in 1:5 loop
      c1 := Advance(c,clock);
      u := RGBDGraphMeasurements.Capture(c,c1,s,RGBDGraphMeasurementTests.Proposal(c1,c.nextId-1,c.nextId),loops,true);
      p := RGBDGraphMeasurements.PrepareProblem(c1,u.state);
      correct := correct and u.accepted and u.admittedSequential == 1 and u.removedEdges == 1
        and RGBDGraphMeasurements.ActiveOldest(c1,u.state) == capacity
        and p.accepted and p.nodeCount == 3+step and p.detachedNodes == capacity-3-step and p.nodeId[1] == capacity;
      c := c1; s := u.state;
    end for;
    checks[7] := correct;
    // An anchored node cannot be a reference that anchors: the anchored keyframe has no consecutive edge.
    checks[8] := RGBDGraphMeasurements.Anchored(c,s,capacity) and not RGBDGraphMeasurements.Anchored(c,s,capacity+1);
  end Run;
end RGBDLoopAnchorEvictionTests;
