/**
 * Scales a photo down in the browser before it is uploaded.
 *
 * A phone camera produces two to five megabytes, and a Server Action would
 * rather have one. More to the point, the recogniser resizes to 1600px wide on
 * arrival anyway - so every byte above that is spent carrying detail that gets
 * thrown away at the far end, over a phone connection, while somebody waits.
 *
 * Done with a canvas rather than a library: the browser already has a very good
 * image decoder and this is twenty lines of it.
 */

/** Matching what lib/ocr.ts resizes to, so nothing is uploaded then discarded. */
const MAX_WIDTH = 1600;

/** Enough for small print; below this JPEG starts eating thin strokes. */
const QUALITY = 0.85;

export async function shrinkForUpload(file: File): Promise<File> {
  // A picture already small enough is left exactly as it is - re-encoding it
  // would only lose detail in exchange for nothing.
  if (file.size < 400_000) return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation applies the EXIF rotation, so a photo taken sideways
    // does not arrive sideways. A sideways receipt reads as noise.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some formats will not decode here (HEIC on certain browsers). Upload the
    // original and let sharp, which understands more of them, have a go.
    return file;
  }

  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], "receipt.jpg", { type: "image/jpeg" });
}
