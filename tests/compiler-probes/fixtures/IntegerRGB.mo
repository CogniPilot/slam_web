package IntegerRGB
  function GrayPixel
    input Integer rgba[:, :, :];
    input Integer row;
    input Integer column;
    output Real gray;
    output Real channelTrace[3];
  algorithm
    assert(size(rgba, 3) == 4, "RGBA source requires exactly four channels");
    for channel in 1:3 loop
      assert(rgba[row, column, channel] >= 0 and
             rgba[row, column, channel] <= 255, "RGB value is outside the byte domain");
      channelTrace[channel] := rgba[row, column, channel];
    end for;
    gray := ((channelTrace[1] + channelTrace[2]) + channelTrace[3]) / 3.0;
  end GrayPixel;

  function GrayRaster
    input Integer rgba[:, :, :];
    output Real gray[size(rgba, 1), size(rgba, 2)];
  protected
    Real channelValues[3];
  algorithm
    assert(size(rgba, 3) == 4, "RGBA source requires exactly four channels");
    for row in 1:size(rgba, 1) loop
      for column in 1:size(rgba, 2) loop
        assert(rgba[row, column, 1] >= 0 and rgba[row, column, 1] <= 255 and
               rgba[row, column, 2] >= 0 and rgba[row, column, 2] <= 255 and
               rgba[row, column, 3] >= 0 and rgba[row, column, 3] <= 255,
               "RGB value is outside the byte domain");
        // Assignment performs the standard Integer-to-Real scalar conversion.
        for channel in 1:3 loop
          channelValues[channel] := rgba[row, column, channel];
        end for;
        gray[row, column] := ((channelValues[1] + channelValues[2]) +
                              channelValues[3]) / 3.0;
      end for;
    end for;
  end GrayRaster;

  model Small
    constant Integer HEIGHT = 3;
    constant Integer WIDTH = 5;
    constant Integer CHANNELS = 4;
    input Integer rgba[HEIGHT, WIDTH, CHANNELS] = fill(0, HEIGHT, WIDTH, CHANNELS);
    input Integer row = 2;
    input Integer column = 4;
    output Real gray[HEIGHT, WIDTH];
    output Real pixel;
    output Real channelTrace[3];
  equation
    gray = GrayRaster(rgba);
    (pixel, channelTrace) = GrayPixel(rgba, row, column);
  end Small;

  model Full
    constant Integer HEIGHT = 90;
    constant Integer WIDTH = 160;
    constant Integer CHANNELS = 4;
    input Integer rgba[HEIGHT, WIDTH, CHANNELS] = fill(0, HEIGHT, WIDTH, CHANNELS);
    output Real gray[HEIGHT, WIDTH];
  equation
    gray = GrayRaster(rgba);
  end Full;
end IntegerRGB;
