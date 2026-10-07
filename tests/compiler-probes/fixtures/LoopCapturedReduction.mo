// A compact image kernel: image extents are structural parameters, while the
// fixed five-pixel kernel is independent of the image resolution.
model LoopCapturedReduction
  parameter Integer height = 13;
  parameter Integer width = 17;
  constant Integer window = 5;
  input Real image[height,width] = fill(0.0,height,width);
  output Real score[height-window+1,width-window+1];
equation
  for y in 1:height-window+1 loop
    for x in 1:width-window+1 loop
      score[y,x] = sum(image[y+dy,x+dx]
        for dy in 0:window-1, dx in 0:window-1)/(window*window);
    end for;
  end for;
end LoopCapturedReduction;
