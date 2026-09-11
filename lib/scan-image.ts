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
 * start - the browser keeps it after the first receipt.
 */

/** What the recogniser wants. Tesseract is trained near 300dpi. */
const TARGET_WIDTH = 1600;

/**
 * Greyscale with the contrast pushed out.
 *
 * A till roll is grey ink on off-white paper, and the gap between them is
 * narrow enough that the recogniser reads letters as smudges. Stretching what
 * is there to the full range is most of what makes faded thermal paper legible
 * - the same job sharp's `normalise` was doing, done with the browser's own
 * image decoder instead of a native dependency.
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
 * Turns a photo into something worth reading.
 *
 * Returns a canvas rather than a file: it is handed straight to the recogniser
 * in the same tab, so encoding it to JPEG and decoding it again would only lose
 * detail on the way.
 */
export async function prepareReceipt(file: File): Promise<HTMLCanvasElement> {
  // imageOrientation applies the EXIF rotation. A receipt photographed sideways
  // reads as noise, and phones photograph sideways constantly.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = TARGET_WIDTH / bitmap.width;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser will not give us a canvas.");

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  stretchContrast(image.data);
  context.putImageData(image, 0, 0);

  return canvas;
}
