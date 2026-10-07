// Generic record-reset scaling reduction. Capacities are varied only in test
// copies; the application State and sensor resolutions are never changed.
package NativeRecordResetStorage
  constant Integer capacity = 16;
  constant Integer descriptorWidth = 49;
  constant Integer dimension = 3;
  record Features
    Real descriptors[capacity,descriptorWidth];
    Real points[capacity,dimension];
    Integer ids[capacity];
    Boolean occupied[capacity];
  end Features;
  record State
    Features features;
    Integer generation;
  end State;
  function EmptyFeatures
    output Features result;
  algorithm
    result.descriptors := zeros(capacity,descriptorWidth);
    result.points := zeros(capacity,dimension);
    result.ids := fill(0,capacity);
    result.occupied := fill(false,capacity);
  end EmptyFeatures;
  function Empty
    input Integer generation;
    output State result;
  algorithm
    result.features := EmptyFeatures();
    result.generation := generation;
  end Empty;
end NativeRecordResetStorage;

model NativeRecordResetScaling
  input Integer generation = 1;
  output NativeRecordResetStorage.State next;
equation
  next = NativeRecordResetStorage.Empty(generation);
end NativeRecordResetScaling;
