import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { tmpdir } from "node:os";

/**
 * Reading text off a photograph of a receipt.
 *
 * Tesseract rather than a vision model: no API key, no per-scan cost, and the
 * accepted trade is that it is worse on faded thermal paper. Most of what makes
 * it usable is the preprocessing below rather than the recogniser itself.
 *
 * The worker is created per call and terminated after. A pooled worker would be
 * faster, but it holds a WebAssembly heap for the life of the instance, and a
 * receipt scan is something you do once a week rather than once a second.
 */

/**
 * What the recogniser wants: big, grey, high contrast, sharp edges.
 *
 * - greyscale, because colour is noise on a receipt and triples the work
 * - upscaled to 1600px wide, because Tesseract is trained near 300dpi and a
 *   phone photo of small print lands well under that
 * - normalise stretches the histogram, which is what rescues a grey-on-grey
 *   faded till roll
 * - sharpen puts the edges back that the resize softened
 *
 * Rotation is applied from EXIF first, since a sideways receipt reads as noise.
 */
async function prepare(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .greyscale()
    .resize({ width: 1600, withoutEnlargement: false })
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

export interface OcrResult {
  text: string;
  /** 0-100. Low confidence is worth saying out loud before a person trusts it. */
  confidence: number;
}

export async function readReceipt(input: Buffer): Promise<OcrResult> {
  const prepared = await prepare(input);

  /**
   * The language data has to land somewhere writable.
   *
   * tesseract.js downloads eng.traineddata on first use and caches it beside
   * the process's working directory, which on a deployment is read-only - so
   * the very first scan in production threw before any of this code ran. The
   * temp directory is the one place a function may write, and it survives for
   * the life of a warm instance, so the download happens about once.
   */
  const worker = await createWorker("eng", 1, { cachePath: tmpdir() });
  try {
    const { data } = await worker.recognize(prepared);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
