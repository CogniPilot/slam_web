// Editable full-resolution candidate; original FeatureSelection.mo remains unchanged.
package BoundedRasterGeometry
  constant Integer width = 160;
  constant Integer height = 90;
  constant Integer capacity = width*height;
  constant Integer featureColumns = 3;
  constant Integer settingsCount = 8;
  constant Integer maximumRadius = 16;
  constant Integer neighborhoodSide = 2*maximumRadius+1;
  constant Integer neighborhoodSize = neighborhoodSide*neighborhoodSide;
  constant Integer heapLevels = integer(ceil(log(capacity)/log(2.0)));
  constant Integer minimumBorder = 0;
end BoundedRasterGeometry;

// Editable full-frame candidate; the unchanged FeatureSelection.mo is retained.
// Dimensions are source constants, not unconstrained runtime shape formals.
function SuppressBoundedRasterNeighborhood
  import BoundedRasterGeometry;
  input Boolean prior[BoundedRasterGeometry.capacity];
  input Integer x;
  input Integer y;
  input Integer radius;
  input Integer border;
  output Boolean next[BoundedRasterGeometry.capacity];
protected
  constant Integer width = BoundedRasterGeometry.width;
  constant Integer height = BoundedRasterGeometry.height;
  Integer dx; Integer dy; Integer xx; Integer yy;
algorithm
  next := prior;
  dx := 0; dy := 0; xx := 0; yy := 0;
  // All permitted radius values are 0..16. This rectangle covers their exact
  // clipped square; inactive offsets never index the occupied tensor.
  for offset in 1:BoundedRasterGeometry.neighborhoodSize loop
    dx := mod(offset-1,BoundedRasterGeometry.neighborhoodSide)-BoundedRasterGeometry.maximumRadius;
    dy := div(offset-1,BoundedRasterGeometry.neighborhoodSide)-BoundedRasterGeometry.maximumRadius;
    xx := x+dx; yy := y+dy;
    if abs(dx) <= radius and abs(dy) <= radius and
      xx >= border and xx < width-border and
      yy >= border and yy < height-border then
      next[yy*width+xx+1] := true;
    end if;
  end for;
end SuppressBoundedRasterNeighborhood;

function GridBoundedRasterFeatures
  import BoundedRasterGeometry;
  input Real scores[BoundedRasterGeometry.capacity];
  input Integer cap; input Integer spacing; input Integer border; input Integer start;
  output Real features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns]; output Real count; output Real valid;
protected
  constant Integer width = BoundedRasterGeometry.width; constant Integer height = BoundedRasterGeometry.height;
  Integer x; Integer y;
algorithm
  features := zeros(BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns); count := 0.0; valid := 1.0;
  x := 0; y := 0;
      for raster in 1:size(scores,1) loop
        x := mod(raster-1,width);
        y := div(raster-1,width);
        if x >= start and y >= start and
          x < width-border and y < height-border and
          mod(x-start,spacing) == 0 and mod(y-start,spacing) == 0 and count < cap then
          if abs(scores[raster]) <= 1.7976931348623157e308 then
            count := count+1.0;
            features[integer(count),1] := x;
            features[integer(count),2] := y;
            features[integer(count),3] := scores[raster];
          else
            valid := 0.0;
          end if;
        end if;
      end for;
end GridBoundedRasterFeatures;

function CollectBoundedRasterCandidates
  import BoundedRasterGeometry;
  input Real scores[BoundedRasterGeometry.capacity]; input Real scale; input Real guard;
  input Integer spacing; input Integer border; input Integer start;
  output Integer candidateIndex[BoundedRasterGeometry.capacity]; output Real candidateRank[BoundedRasterGeometry.capacity];
  output Integer candidateCount;
protected
  constant Integer width = BoundedRasterGeometry.width; constant Integer height = BoundedRasterGeometry.height;
  Integer x; Integer y;
  Real scaled; Real low; Real fraction; Real rank;
algorithm
  candidateIndex := fill(0,BoundedRasterGeometry.capacity); candidateRank := zeros(BoundedRasterGeometry.capacity); candidateCount := 0;
  x := 0; y := 0; scaled := 0.0; low := 0.0; fraction := 0.0; rank := 0.0;
        for raster in 1:size(scores,1) loop
          x := mod(raster-1,width);
          y := div(raster-1,width);
          if x >= start and y >= start and
            x < width-border and y < height-border and
            mod(x-start,spacing) == 0 and mod(y-start,spacing) == 0 then
            scaled := scores[raster]*scale;
            low := floor(scaled); fraction := scaled-low;
            rank := if fraction < 0.5 then low else if fraction > 0.5 then low+1.0
              else if low-floor(low/2.0)*2.0 == 0.0 then low else low+1.0;
            if rank >= guard then
              candidateCount := candidateCount+1;
              candidateIndex[candidateCount] := raster;
              candidateRank[candidateCount] := rank;
            end if;
          end if;
        end for;
end CollectBoundedRasterCandidates;

function HeapSelectBoundedRasterFeatures
  import BoundedRasterGeometry;
  input Real scores[BoundedRasterGeometry.capacity]; input Integer candidateIndex[BoundedRasterGeometry.capacity];
  input Real candidateRank[BoundedRasterGeometry.capacity]; input Integer candidateCount;
  input Real threshold; input Integer cap; input Integer radius; input Integer border;
  output Real features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns]; output Real count;
protected
  constant Integer width = BoundedRasterGeometry.width; constant Integer height = BoundedRasterGeometry.height;
  // A continuing sift doubles its root; ceil(log2(14400)) is exactly14.
  constant Integer heapLevels = BoundedRasterGeometry.heapLevels;
  Integer sortedIndex[BoundedRasterGeometry.capacity]; Real sortedRank[BoundedRasterGeometry.capacity]; Boolean occupied[BoundedRasterGeometry.capacity];
  Integer x; Integer y; Integer index; Integer position;
  Integer root; Integer child; Integer heapSize; Integer temporaryIndex;
  Integer build; Integer remove;
  Real temporaryRank; Boolean active; Boolean descending;
algorithm
  features := zeros(BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns); count := 0.0;
  sortedIndex := candidateIndex; sortedRank := candidateRank; occupied := fill(false,BoundedRasterGeometry.capacity);
  x := 0; y := 0; index := 1; position := 1; root := 1; child := 1;
  heapSize := 0; temporaryIndex := 0; build := 1; remove := 1;
  temporaryRank := 0.0; active := false; descending := false;
        heapSize := candidateCount;
        // One source-owned bounded domain encodes build-major/sift-minor order.
        // Only a continuing original sift evaluates tensor reads and writes.
        for step in 1:heapLevels*size(scores,1) loop
          build := div(step-1,heapLevels)+1;
          if build <= candidateCount then
            if mod(step-1,heapLevels) == 0 then
              root := candidateCount-build+1;
              descending := true;
            end if;
            if root <= div(heapSize,2) and descending then
              child := 2*root;
              if child < heapSize then
                if sortedRank[child+1] > sortedRank[child] or
                  (sortedRank[child+1] == sortedRank[child] and sortedIndex[child+1] < sortedIndex[child]) then
                  child := child+1;
                end if;
              end if;
              if sortedRank[child] > sortedRank[root] or
                (sortedRank[child] == sortedRank[root] and sortedIndex[child] < sortedIndex[root]) then
                temporaryRank := sortedRank[root]; temporaryIndex := sortedIndex[root];
                sortedRank[root] := sortedRank[child]; sortedIndex[root] := sortedIndex[child];
                sortedRank[child] := temporaryRank; sortedIndex[child] := temporaryIndex;
                root := child;
              else
                descending := false;
              end if;
            end if;
          end if;
        end for;
        for step in 1:heapLevels*size(scores,1) loop
          remove := div(step-1,heapLevels)+1;
          if remove <= candidateCount then
            if mod(step-1,heapLevels) == 0 then
              heapSize := candidateCount-remove+1;
              temporaryRank := sortedRank[heapSize]; temporaryIndex := sortedIndex[heapSize];
              sortedRank[heapSize] := sortedRank[1]; sortedIndex[heapSize] := sortedIndex[1];
              sortedRank[1] := temporaryRank; sortedIndex[1] := temporaryIndex;
              heapSize := heapSize-1;
              root := 1; descending := true;
            end if;
            if root <= div(heapSize,2) and descending then
              child := 2*root;
              if child < heapSize then
                if sortedRank[child+1] > sortedRank[child] or
                  (sortedRank[child+1] == sortedRank[child] and sortedIndex[child+1] < sortedIndex[child]) then
                  child := child+1;
                end if;
              end if;
              if sortedRank[child] > sortedRank[root] or
                (sortedRank[child] == sortedRank[root] and sortedIndex[child] < sortedIndex[root]) then
                temporaryRank := sortedRank[root]; temporaryIndex := sortedIndex[root];
                sortedRank[root] := sortedRank[child]; sortedIndex[root] := sortedIndex[child];
                sortedRank[child] := temporaryRank; sortedIndex[child] := temporaryIndex;
                root := child;
              else
                descending := false;
              end if;
            end if;
          end if;
        end for;
        active := true;
        for candidate in 1:size(scores,1) loop
          if candidate <= candidateCount then
            position := candidateCount-candidate+1;
            index := sortedIndex[position];
            if scores[index] < threshold then active := false; end if;
            if active and count < cap and not occupied[index] then
              x := mod(index-1,width);
              y := div(index-1,width);
              count := count+1.0;
              features[integer(count),1] := x;
              features[integer(count),2] := y;
              features[integer(count),3] := scores[index];
              occupied := SuppressBoundedRasterNeighborhood(occupied,x,y,radius,border);
            end if;
          end if;
        end for;
end HeapSelectBoundedRasterFeatures;

function RankedBoundedRasterFeatures
  import BoundedRasterGeometry;
  input Real scores[BoundedRasterGeometry.capacity]; input Real absolute; input Real relative; input Real scale;
  input Integer cap; input Integer spacing; input Integer border; input Integer start; input Integer radius;
  output Real features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns]; output Real count; output Real valid;
protected
  Integer candidateIndex[BoundedRasterGeometry.capacity]; Real candidateRank[BoundedRasterGeometry.capacity]; Integer candidateCount;
  Real maximum; Real threshold; Real guard;
algorithm
  features := zeros(BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns); count := 0.0; valid := 1.0;
  candidateIndex := fill(0,BoundedRasterGeometry.capacity); candidateRank := zeros(BoundedRasterGeometry.capacity); candidateCount := 0;
  maximum := 0.0; threshold := 0.0; guard := 0.0;
      for raster in 1:size(scores,1) loop
        if abs(scores[raster]*scale) <= 9007199254740991.0 then
          maximum := max(maximum,scores[raster]);
        else
          valid := 0.0;
        end if;
      end for;
      threshold := max(absolute,maximum*relative);
      guard := floor(threshold*scale)-1.0;
  if valid > 0.0 then
    (candidateIndex,candidateRank,candidateCount) := CollectBoundedRasterCandidates(scores,scale,guard,spacing,border,start);
    (features,count) := HeapSelectBoundedRasterFeatures(scores,candidateIndex,candidateRank,candidateCount,threshold,cap,radius,border);
  end if;
end RankedBoundedRasterFeatures;

function SelectBoundedRasterFeatures
  import BoundedRasterGeometry;
  input Real scores[BoundedRasterGeometry.capacity]; input Real settings[BoundedRasterGeometry.settingsCount]; input Boolean grid;
  output Real features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns]; output Real count; output Real valid;
protected
  constant Integer width = BoundedRasterGeometry.width; constant Integer height = BoundedRasterGeometry.height;
  constant Integer minimumBorder = BoundedRasterGeometry.minimumBorder;
  Integer radius; Integer cap; Integer spacing; Integer border; Integer start;
algorithm
  features := zeros(BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns); count := 0.0; valid := 0.0;
  radius := 0; cap := 1; spacing := 1; border := 0; start := 0;
  valid := if settings[1] >= 0.0 and settings[1] <= 255.0 and
    settings[2] >= 0.0 and settings[2] <= 1.0 and
    settings[3] >= 1.0 and settings[3] <= 1e12 and
    settings[4] >= 0.0 and settings[4] <= BoundedRasterGeometry.maximumRadius and floor(settings[4]) == settings[4] and
    settings[5] >= 1.0 and settings[5] <= BoundedRasterGeometry.capacity and floor(settings[5]) == settings[5] and
    settings[6] >= 1.0 and settings[6] <= width and floor(settings[6]) == settings[6] and
    settings[7] >= minimumBorder and settings[7] <= floor((height-1)/2.0) and floor(settings[7]) == settings[7] and
    settings[BoundedRasterGeometry.settingsCount] >= settings[7] and settings[BoundedRasterGeometry.settingsCount] < height-settings[7] and floor(settings[BoundedRasterGeometry.settingsCount]) == settings[BoundedRasterGeometry.settingsCount] and
    (not grid or (settings[1] == 0.0 and settings[2] == 0.0 and settings[3] == 1.0 and settings[4] == 0.0))
    then 1.0 else 0.0;
  // Retain lazy conversion and rejected nonfinite-setting behavior.
  radius := if valid > 0.0 then integer(settings[4]) else 0;
  cap := if valid > 0.0 then integer(settings[5]) else 1;
  spacing := if valid > 0.0 then integer(settings[6]) else 1;
  border := if valid > 0.0 then integer(settings[7]) else 0;
  start := if valid > 0.0 then integer(settings[BoundedRasterGeometry.settingsCount]) else 0;
  if valid > 0.0 then
    if grid then
      (features,count,valid) := GridBoundedRasterFeatures(scores,cap,spacing,border,start);
    else
      (features,count,valid) := RankedBoundedRasterFeatures(scores,settings[1],settings[2],settings[3],cap,spacing,border,start,radius);
    end if;
  end if;
  if valid <= 0.0 then
    features := zeros(BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns); count := 0.0;
  end if;
end SelectBoundedRasterFeatures;

model FeatureSelectionBounded
  import BoundedRasterGeometry;
  parameter Boolean grid = false;
  input Real scores[BoundedRasterGeometry.capacity] = zeros(BoundedRasterGeometry.capacity);
  input Real settings[BoundedRasterGeometry.settingsCount] = {1e-9,0.01,1e12,3.0,240.0,1.0,0.0,0.0};
  output Real features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns];
  output Real count;
  output Real valid;
equation
  (features,count,valid) = SelectBoundedRasterFeatures(scores,settings,grid);
end FeatureSelectionBounded;

model GridFeatureSelectionBounded
  import BoundedRasterGeometry;
  extends FeatureSelectionBounded(grid=true,settings={0.0,0.0,1.0,0.0,14400.0,6.0,5.0,5.0});
end GridFeatureSelectionBounded;
