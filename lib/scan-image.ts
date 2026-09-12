/**
 * Preparing a receipt photo for recognition, in the browser.
 *
 * This used to be sharp on the server. It is here now because the recognition
 * moved here: tesseract's Node path spawns a worker_threads Worker from a file
 * path, and in a bundled serverless function that path does not resolve, so the
 * worker never starts and the promise never settles. That is the difference
 * between a crash, which tells you something, and a hang, which does not.
 *
 * A phone is a good place to do this anyway. No upload of an image at all, no
 * function timeout to run into, no language data re-downloaded on every cold
 * start - the browser keeps it after the first receipt. Nothing but the
 * recognised text ever leaves the device.
 */

/**
 * What the recogniser actually wants, which is not a number of pixels across.
 *
 * Tesseract's own guidance is 300dpi or better, and the measured thing behind
 * that is the height of a capital letter: accuracy tracks cap height in pixels
 * rather than dpi or point size, and the band is roughly 20-40px, with
 * everything below about 10px lost. So the target here is a text size, and the
 * scale factor is whatever gets this photo there.
 *
 * Sources: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html and the
 * tesseract-ocr thread on optimal resolution, which is where the 20-40px
 * numbers come from.
 */
const TARGET_LINE_PITCH = 52;

/** Below this a capital letter is mush; above it, pixels with no information. */
const MIN_SCALE = 0.35;
const MAX_SCALE = 3;

/**
 * A ceiling on the canvas, because a phone has to hold it.
 *
 * 12 megapixels of greyscale is about 48MB in an ImageData, and recognition
 * time goes up with the pixel count - measured at roughly 1.4s for a 3600px
 * photo against 0.5s for the same receipt at 1600px. A receipt that needs more
 * than this is one somebody has photographed from across a room.
 */
const MAX_PIXELS = 12e6;

/**
 * Greyscale with the contrast pushed out.
 *
 * A till roll is grey ink on off-white paper, and the gap between them is
 * narrow enough that the recogniser reads letters as smudges. Stretching what
 * is there to the full range is most of what makes faded thermal paper legible
 * - the same job sharp's `normalise` was doing, done with the browser's own
 * image decoder instead of a native dependency.
 *
 * Deliberately not thresholded to black and white here. Tesseract binarises
 * internally with Otsu and, since 5.0, adaptive Otsu and Sauvola; doing it
 * first and badly - a phone photo has a shadow gradient across it - throws
 * away the information those methods need.
 */
function stretchContrast(data: Uint8ClampedArray): void {
  let low = 255;
  let high = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma: green carries most of the perceived brightness, and a flat
    // average makes red ink on white paper vanish.
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = grey;
    if (grey < low) low = grey;
    if (grey > high) high = grey;
  }

  // A photo with no range at all - a blank wall, a lens cap - would divide by
  // zero here, and there is nothing to rescue in it anyway.
  const range = high - low;
  if (range < 1) return;

  for (let i = 0; i < data.length; i += 4) {
    const stretched = ((data[i] - low) / range) * 255;
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
}

/**
 * Otsu's threshold: the grey level that best separates ink from paper.
 *
 * The same method Tesseract binarises with, used here only to decide which
 * pixels count as ink while measuring. A fixed midpoint was the first attempt
 * and it measured the dark cores of letters rather than the letters - on a
 * soft, low-contrast photo almost every text pixel sits well above 128, so the
 * bands came out two pixels tall and the photo was blown up three times for
 * nothing.
 */
function otsu(data: Uint8ClampedArray): number {
  const histogram = new Float64Array(256);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]] += 1;
    count += 1;
  }
  if (count === 0) return 128;

  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level];

  let sumBelow = 0;
  let weightBelow = 0;
  let best = 128;
  let bestVariance = -1;

  for (let level = 0; level < 256; level += 1) {
    weightBelow += histogram[level];
    if (weightBelow === 0) continue;
    const weightAbove = count - weightBelow;
    if (weightAbove === 0) break;

    sumBelow += level * histogram[level];
    const meanBelow = sumBelow / weightBelow;
    const meanAbove = (sum - sumBelow) / weightAbove;
    const between = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      best = level;
    }
  }

  return best;
}

/**
 * How far apart the lines of type are in this photo, in source pixels.
 *
 * A receipt is the most regular thing a camera ever points at: bands of ink
 * separated by paper, evenly spaced, for forty lines. So this looks for that
 * regularity directly - the row-darkness profile, correlated against itself at
 * every plausible spacing, and the spacing that agrees with itself best is the
 * line pitch.
 *
 * Periodicity rather than measuring individual bands, because bands are what
 * the margins, the shop's logo, a barcode and a thumb across the corner all
 * ruin, and none of those repeat at the pitch of the type.
 *
 * Returns null when nothing repeats convincingly - a picture of a wall, or a
 * receipt too blurred to have lines - and the caller then leaves the size
 * alone rather than acting on a guess.
 */
function estimateLinePitch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sampleScale: number,
): number | null {
  const ink = otsu(data);

  const profile = new Float64Array(height);
  let mean = 0;
  for (let y = 0; y < height; y += 1) {
    let dark = 0;
    for (let x = 0; x < width; x += 1) {
      // The red channel: stretchContrast has already written grey into all
      // three, so one is enough and three is three times the work.
      if (data[(y * width + x) * 4] <= ink) dark += 1;
    }
    profile[y] = dark / width;
    mean += profile[y];
  }
  mean /= height;

  // Centred, so the correlation measures the pattern rather than the average
  // amount of ink on the page.
  let energy = 0;
  for (let y = 0; y < height; y += 1) {
    profile[y] -= mean;
    energy += profile[y] * profile[y];
  }
  if (energy <= 0) return null;

  /**
   * Plausible spacings, in sample pixels.
   *
   * Under 5px the type is unreadable at any scale and the lag is picking up
   * noise; over 90px it is a poster rather than a receipt, or the correlation
   * has locked onto a section heading rather than the body.
   */
  const lowest = 5;
  const highest = Math.min(90, Math.floor(height / 6));
  if (highest <= lowest) return null;

  const scores = new Float64Array(highest + 2);
  for (let lag = lowest - 1; lag <= highest + 1; lag += 1) {
    if (lag < 1) continue;
    let total = 0;
    for (let y = 0; y + lag < height; y += 1) total += profile[y] * profile[y + lag];
    scores[lag] = total / energy;
  }

  /**
   * The best PEAK, not the best score.
   *
   * Autocorrelation is highest near zero for anything smooth - neighbouring
   * rows of a photo resemble each other whatever is on them - so taking the
   * maximum outright picked the smallest lag allowed, every time, and tripled
   * the size of every photo. What a repeating pattern produces is a local
   * maximum at its period, and that is what this looks for.
   */
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = lowest; lag <= highest; lag += 1) {
    const rising = scores[lag] > scores[lag - 1];
    const falling = scores[lag] >= scores[lag + 1];
    if (rising && falling && scores[lag] > bestScore) {
      bestScore = scores[lag];
      bestLag = lag;
    }
  }

  // A receipt correlates with itself strongly. Anything this weak is a photo
  // of something else, and guessing from it would be worse than not scaling.
  if (bestLag === 0 || bestScore < 0.12) return null;

  // Back into the units of the original photo.
  return bestLag / sampleScale;
}

/**
 * Turns a photo into something worth reading.
 *
 * Returns a canvas rather than a file: it is handed straight to the recogniser
 * in the same tab, so encoding it to JPEG and decoding it again would only lose
 * detail on the way - and JPEG artefacts around the edge of a glyph are
 * exactly the kind of noise that costs accuracy.
 */
export async function prepareReceipt(file: File): Promise<HTMLCanvasElement> {
  // imageOrientation applies the EXIF rotation. A receipt photographed sideways
  // reads as noise, and phones photograph sideways constantly.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = chooseScale(bitmap);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser will not give us a canvas.");

  // The browser's better resampler. Free, and it is the difference between a
  // downscaled letter with edges and one with stairs on it.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  stretchContrast(image.data);
  context.putImageData(image, 0, 0);

  return canvas;
}

/**
 * What to multiply this photo by so its text lands where Tesseract reads best.
 *
 * The old rule scaled every photo to 1600px wide whatever was in it, which is
 * two mistakes in one line: a receipt photographed from across the table had
 * its already-marginal text shrunk further, and a close-up of half a receipt
 * was blown up to invent pixels that cost recognition time and carry nothing.
 * Neither has anything to do with how wide the frame is.
 */
function chooseScale(bitmap: ImageBitmap): number {
  const measured = measureLinePitch(bitmap);

  // Nothing measurable: leave the photo alone apart from the memory ceiling.
  // A guess about an image we could not read the shape of is worse than none.
  let scale = measured === null ? 1 : TARGET_LINE_PITCH / measured;
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

  const pixels = bitmap.width * bitmap.height * scale * scale;
  if (pixels > MAX_PIXELS) {
    scale *= Math.sqrt(MAX_PIXELS / pixels);
  }

  return scale;
}

/** Draws a small copy purely to measure it. See estimateLinePitch. */
function measureLinePitch(bitmap: ImageBitmap): number | null {
  // 900px is enough to resolve receipt lines and cheap to walk pixel by pixel.
  // 1400px across: fine enough that a line pitch is a dozen pixels rather than
  // five, which is the difference between measuring the type and rounding it.
  const sampleScale = Math.min(1, 1400 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * sampleScale));
  const height = Math.max(1, Math.round(bitmap.height * sampleScale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  const image = context.getImageData(0, 0, width, height);
  stretchContrast(image.data);
  return estimateLinePitch(image.data, width, height, sampleScale);
}
