/**
 * Shrinking a photo before it leaves the phone.
 *
 * A report with a screenshot on it used to fail with a 403 and lose what
 * somebody had written. The cause is not obvious from the error: a Next server
 * action rejects any request body over 1MB by default, and an iPhone
 * screenshot is two to five. Nothing in the action ran, nothing was logged,
 * and the words went with it.
 *
 * Raising that limit alone would have been the wrong fix. The photo is only
 * ever looked at on a screen a few hundred pixels wide, so sending four
 * megabytes of it over a phone connection is slow for the person and pointless
 * at the other end. This sends about three hundred kilobytes instead.
 *
 * Browser only - canvas, createImageBitmap. Imported by client components.
 */

/** Wide enough to read a phone screenshot's text, small enough to post. */
const MAX_EDGE = 1600;

/** Roughly where WebP stops being visibly lossy on a screenshot. */
const QUALITY = 0.82;

/**
 * Returns a smaller file, or the original when there is nothing to gain.
 *
 * Never throws. A photo that will not decode is not worth failing a bug report
 * over - it goes up as it is and the server refuses it with a message that
 * says so, which is a better outcome than the form dying in somebody's hand.
 */
export async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough, and re-encoding it could only make it worse.
    if (scale === 1 && file.size < 900_000) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob) return file;

    // A re-encode that came out bigger is a re-encode worth throwing away -
    // which happens with small PNGs of flat colour.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
