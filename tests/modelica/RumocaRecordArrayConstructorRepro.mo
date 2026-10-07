// Generic compiler reproduction only; this does not replace full SLAM gates.
package RecordArrayConstructorRepro
  constant Integer slots = 4;
  record Snapshot
    Integer nextId = 1;
    Boolean occupied[slots] = fill(false,slots);
    Real point[slots,3];
  end Snapshot;
  function Advance
    input Snapshot previous;
    output Snapshot next;
  algorithm
    next := previous;
    next.nextId := previous.nextId+1;
  end Advance;
end RecordArrayConstructorRepro;

model RecordArrayConstructorStep
  input RecordArrayConstructorRepro.Snapshot previous;
  output RecordArrayConstructorRepro.Snapshot next;
equation
  next = RecordArrayConstructorRepro.Advance(previous);
end RecordArrayConstructorStep;
