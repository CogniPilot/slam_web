// Independent closed-form filter identities, full90x160 image domains.
package RGBDPatchFilterReference
  constant Integer height = 90; constant Integer width = 160;

  function ConstantControl
    input Real value;
    output Boolean correct;
  protected
    Real image[height,width]; Real filtered[height,width]; Boolean valid[height,width]; Boolean interior;
  algorithm
    image := fill(value,height,width); (filtered,valid) := RGBDPatchTracking.SmoothBinomial(image);
    correct := true;
    for row in 1:height loop
      for column in 1:width loop
        interior := row >= 3 and row <= height-2 and column >= 3 and column <= width-2;
        correct := correct and valid[row,column] == interior
          and filtered[row,column] == (if interior then value else -1);
      end for;
    end for;
  end ConstantControl;

  function PoisonControl
    input Real value; input Integer poisonRow; input Integer poisonColumn;
    output Boolean correct;
  protected
    Real image[height,width]; Real filtered[height,width]; Boolean valid[height,width]; Boolean expectedValid;
  algorithm
    image := fill(0.375,height,width); image[poisonRow,poisonColumn] := value;
    (filtered,valid) := RGBDPatchTracking.SmoothBinomial(image); correct := true;
    for row in 1:height loop
      for column in 1:width loop
        expectedValid := row >= 3 and row <= height-2 and column >= 3 and column <= width-2
          and not (abs(row-poisonRow) <= 2 and abs(column-poisonColumn) <= 2);
        correct := correct and valid[row,column] == expectedValid
          and filtered[row,column] == (if expectedValid then 0.375 else -1);
      end for;
    end for;
  end PoisonControl;

  function Run
    input Real clock;
    output Boolean checks[16]; output Real raw[4,4];
  protected
    constant Real weights[5] = {1,4,6,4,1};
    constant Integer centerRow = 45; constant Integer centerColumn = 80;
    Real image[height,width]; Real filtered[height,width]; Boolean valid[height,width];
    Real smallHeight[4,width]; Boolean smallHeightValid[4,width];
    Real smallWidth[height,4]; Boolean smallWidthValid[height,4];
    Real minimumImage[5,5]; Boolean minimumValid[5,5];
    Real expected; Real total; Real maximumError; Real nanValue; Real infinity; Boolean interior;
  algorithm
    checks := fill(false,16); raw := zeros(4,4);
    infinity := exp(1000+clock); nanValue := sin(infinity);
    checks[1] := clock >= 0 and clock <= 0.001 and not (nanValue <= 0 or nanValue >= 0) and infinity > 1e300;
    checks[2] := ConstantControl(0.375);
    for row in 1:height loop
      for column in 1:width loop image[row,column] := 0.2+0.001*(column-1)+0.002*(row-1); end for;
    end for;
    (filtered,valid) := RGBDPatchTracking.SmoothBinomial(image); checks[3] := true; maximumError := 0;
    for row in 1:height loop
      for column in 1:width loop
        interior := row >= 3 and row <= height-2 and column >= 3 and column <= width-2;
        if interior then maximumError := max(maximumError,abs(filtered[row,column]-image[row,column])); end if;
        checks[3] := checks[3] and valid[row,column] == interior
          and (if interior then abs(filtered[row,column]-image[row,column]) < 1e-14 else filtered[row,column] == -1);
      end for;
    end for;
    raw[1,:] := {maximumError,height,width,if checks[3] then 1 else 0};
    image := zeros(height,width); image[centerRow,centerColumn] := 1;
    (filtered,valid) := RGBDPatchTracking.SmoothBinomial(image); checks[4] := true; total := 0;
    for row in 1:height loop
      for column in 1:width loop
        interior := row >= 3 and row <= height-2 and column >= 3 and column <= width-2;
        expected := 0;
        if abs(row-centerRow) <= 2 and abs(column-centerColumn) <= 2 then
          expected := weights[row-centerRow+3]*weights[column-centerColumn+3]/256;
        end if;
        checks[4] := checks[4] and valid[row,column] == interior
          and filtered[row,column] == (if interior then expected else -1);
        if interior then total := total+filtered[row,column]; end if;
      end for;
    end for;
    checks[5] := total == 1; raw[2,:] := {total,filtered[centerRow,centerColumn],filtered[centerRow-2,centerColumn-2],0};
    checks[6] := PoisonControl(nanValue,centerRow,centerColumn);
    checks[7] := PoisonControl(-0.01,centerRow,centerColumn);
    checks[8] := PoisonControl(1.01,centerRow,centerColumn);
    checks[9] := PoisonControl(infinity,centerRow,centerColumn);
    checks[10] := PoisonControl(-infinity,centerRow,centerColumn);
    (smallHeight,smallHeightValid) := RGBDPatchTracking.SmoothBinomial(fill(0.375,4,width)); checks[11] := true;
    for row in 1:4 loop
      for column in 1:width loop checks[11] := checks[11] and not smallHeightValid[row,column] and smallHeight[row,column] == -1; end for;
    end for;
    (minimumImage,minimumValid) := RGBDPatchTracking.SmoothBinomial(fill(0.375,5,5));
    for row in 1:5 loop
      for column in 1:5 loop
        checks[11] := checks[11] and minimumValid[row,column] == (row == 3 and column == 3)
          and minimumImage[row,column] == (if row == 3 and column == 3 then 0.375 else -1);
      end for;
    end for;
    (smallWidth,smallWidthValid) := RGBDPatchTracking.SmoothBinomial(fill(0.375,height,4)); checks[12] := true;
    for row in 1:height loop
      for column in 1:4 loop checks[12] := checks[12] and not smallWidthValid[row,column] and smallWidth[row,column] == -1; end for;
    end for;
    checks[13] := ConstantControl(0); checks[14] := ConstantControl(1);
    checks[15] := PoisonControl(nanValue,1,1);
    for row in 1:height loop
      for column in 1:width loop
        image[row,column] := 0.1+0.00001*((column-1)^2+(row-1)^2)+0.00002*(column-1)*(row-1);
      end for;
    end for;
    (filtered,valid) := RGBDPatchTracking.SmoothBinomial(image); checks[16] := true; maximumError := 0;
    // The kernel's independent second moment is1 in each axis; cross moment0.
    for row in 1:height loop
      for column in 1:width loop
        interior := row >= 3 and row <= height-2 and column >= 3 and column <= width-2;
        if interior then maximumError := max(maximumError,abs(filtered[row,column]-image[row,column]-0.00002)); end if;
        checks[16] := checks[16] and valid[row,column] == interior
          and (if interior then abs(filtered[row,column]-image[row,column]-0.00002) < 1e-14 else filtered[row,column] == -1);
      end for;
    end for;
    raw[3,:] := {maximumError,if checks[6] then 1 else 0,if checks[15] then 1 else 0,0};
    raw[4,:] := {clock,height,width,5};
  end Run;
end RGBDPatchFilterReference;

model RGBDPatchFilterAcceptance
  output Boolean checks[16]; output Real raw[4,4];
algorithm
  (checks,raw) := RGBDPatchFilterReference.Run(time);
end RGBDPatchFilterAcceptance;
