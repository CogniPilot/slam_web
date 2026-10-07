// Independent FAST-9 reference, used only by compiler qualification tests.
const circle = [[-3,0],[-3,1],[-2,2],[-1,3],[0,3],[1,3],[2,2],[3,1],
  [3,0],[3,-1],[2,-2],[1,-3],[0,-3],[-1,-3],[-2,-2],[-3,-1]];

export function fastNineArc(differences:Float64Array):number {
  let score = 0;
  for (let start = 0; start < circle.length; start++) {
    let low = differences[start], high = low;
    for (let offset = 1; offset < 9; offset++) {
      const value = differences[(start + offset) % circle.length];
      low = low < value ? low : value;
      high = high > value ? high : value;
    }
    const dark = -high, response = low > dark ? low : dark;
    score = score > response ? score : response;
  }
  return score;
}

export function fastFrameOracle(rgb:Float64Array, height:number, width:number, channels:3|4=3):Float64Array {
  if (rgb.length !== height * width * channels) throw Error('Oracle image shape differs');
  const gray = new Float64Array(height * width), scores = new Float64Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const value = ((rgb[channels*i] + rgb[channels*i+1]) + rgb[channels*i+2]) / 3;
    // The sequential reference is independent of the source's shared-window
    // reduction. Nonfinite comparisons need a separate ordered-tree reference.
    if (!Number.isFinite(value)) throw Error('Finite-image oracle received nonfinite RGB');
    gray[i] = value;
  }
  const differences = new Float64Array(circle.length);
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      const index = y * width + x, center = gray[index];
      for (let sample = 0; sample < circle.length; sample++) {
        const [dy, dx] = circle[sample];
        differences[sample] = gray[(y+dy)*width+x+dx] - center;
      }
      scores[index] = fastNineArc(differences);
    }
  }
  return scores;
}

export function fillFastImage(rgb:Float64Array, height:number, width:number, frame:number, channels:3|4=3):void {
  if (rgb.length !== height * width * channels) throw Error('Fixture image shape differs');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = channels * (y * width + x);
      rgb[index] = (31*y + 17*x + 7*frame) % 256;
      rgb[index+1] = (11*y + 47*x + 13*frame) % 256;
      rgb[index+2] = (7*y + 3*x + 23*frame) % 256;
      if (channels === 4) rgb[index+3] = 255;
    }
  }
}
