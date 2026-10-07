package FastNativeFrameGuardTests
  constant Integer height = 90; constant Integer width = 160;
  constant Integer circleRow[16] = {-3,-3,-2,-1,0,1,2,3,3,3,2,1,0,-1,-2,-3};
  constant Integer circleColumn[16] = {0,1,2,3,3,3,2,1,0,-1,-2,-3,-3,-3,-2,-1};

  function Image
    input Boolean poisoned;
    output Real rgba[height,width,4];
  protected
    Boolean bright;
  algorithm
    for row in 1:height loop
      for column in 1:width loop
        bright := false;
        for sample in 1:16 loop
          bright := bright or (row == 45+circleRow[sample] and column == 80+circleColumn[sample]);
        end for;
        for channel in 1:3 loop
          rgba[row,column,channel] := if poisoned then 1e200*sin(0.37*row+0.53*column+0.19*channel)
            else if bright then 60+30*channel else 0;
        end for;
        // Alpha is poisoned on every phase, including enabled acquisitions.
        rgba[row,column,4] := if mod(row+column,2) == 0 then 1e250 else -1e250;
      end for;
    end for;
  end Image;

  function Expected
    output Real scores[height*width];
  protected
    Real gray[height,width]; Real bright; Real dark; Real difference; Integer sample;
  algorithm
    gray := zeros(height,width); scores := zeros(height*width);
    for circle in 1:16 loop gray[45+circleRow[circle],80+circleColumn[circle]] := 120; end for;
    // Independent definition: scan every nine-sample arc directly, without
    // the production function's shared2/4/8 ordered-window implementation.
    for row in 4:height-3 loop
      for column in 4:width-3 loop
        for start in 1:16 loop
          bright := 1e6; dark := 1e6;
          for offset in 0:8 loop
            sample := mod(start+offset-1,16)+1;
            difference := gray[row+circleRow[sample],column+circleColumn[sample]]-gray[row,column];
            bright := min(bright,difference); dark := min(dark,-difference);
          end for;
          scores[(row-1)*width+column] := max(scores[(row-1)*width+column],max(bright,dark));
        end for;
      end for;
    end for;
    assert(scores[(45-1)*width+80] == 120,"Independent known FAST9 center must respond120");
  end Expected;

  function Check
    input Real scores[height*width]; input Real selection[8]; input Boolean enabled;
    output Boolean checks[4];
  protected
    Real expected[height*width]; Integer index;
  algorithm
    expected := if enabled then Expected() else zeros(height*width);
    checks := fill(true,4);
    for row in 1:height loop
      for column in 1:width loop
        index := (row-1)*width+column;
        checks[1] := checks[1] and scores[index] == expected[index];
        if row <= 3 or row > height-3 or column <= 3 or column > width-3 then
          checks[3] := checks[3] and scores[index] == 0;
        end if;
      end for;
    end for;
    checks[2] := scores[(45-1)*width+80] == (if enabled then 120 else 0);
    checks[4] := max(abs(selection-{18,0,1e8,3,240,1,3,3})) == 0;
  end Check;
end FastNativeFrameGuardTests;
