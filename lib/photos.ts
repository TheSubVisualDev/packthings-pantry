import { put, del } from "@vercel/blob";
import sharp from "sharp";

/**
 * Recipe photos: resized, stripped and stored in Vercel Blob.
 *
 * Everything goes through sharp on the way in rather than being handed to Blob
 * untouched. Two reasons, one of them not optional:
 *
 * A kitchen photo taken on a phone carries EXIF, and EXIF carries the GPS
 * coordinates of the kitchen. On a recipe anyone can open, that is somebody's
 * home address attached to a picture of a stew. sharp drops all metadata by
 * default, so re-encoding is what removes it.
 *
 * The other reason is ordinary: a modern phone photo is several megabytes and
 * nothing here displays one larger than about a thousand pixels.
 */

const MAX_BYTES = 12 * 1024 * 1024;

/** Wide enough for the hero on a large screen, small enough to send over 4G. */
const HERO = { width: 1400, height: 1050 };

/** Step photos sit inline at roughly a third of that. */
const STEP = { width: 800, height: 600 };

export type PhotoKind = "hero" | "step" | "avatar";

const SIZES: Record<PhotoKind, { width: number; height: number }> = {
  hero: HERO,
  step: STEP,
  avatar: { width: 320, height: 320 },
};

export interface PhotoResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Takes an uploaded file and returns a URL.
 *
 * `inside` keys the stored path, so one recipe's photos sit together and a
 * stray upload is identifiable later.
 */
export async function storePhoto(
  file: File,
  kind: PhotoKind,
  inside: string,
): Promise<PhotoResult> {
  if (!blobConfigured()) {
    return {
      ok: false,
      error: "Photo storage isn't set up on this deployment (BLOB_READ_WRITE_TOKEN).",
    };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That isn't an image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That image is over 12MB." };
  }

  const size = SIZES[kind];

  let processed: Buffer;
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      // `inside` the box, not cropped to it: a recipe photo shouldn't have its
      // subject cut off to satisfy an aspect ratio the page doesn't require.
      .rotate() // honours the EXIF orientation before the metadata is dropped
      .resize({ ...size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That image couldn't be read." };
  }

  const name = `${inside}/${kind}-${Date.now()}.webp`;

  try {
    const blob = await put(name, processed, {
      access: "public",
      contentType: "image/webp",
    });
    return { ok: true, url: blob.url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Upload failed.",
    };
  }
}

/**
 * Deletes a stored photo, quietly.
 *
 * A failure here is never worth failing the caller for: the user asked to
 * remove a photo from a recipe, and that has already happened in the database.
 * An orphaned blob is a tidiness problem, not a correctness one.
 */
export async function forgetPhoto(url: string | null): Promise<void> {
  if (!url || !blobConfigured()) return;

  try {
    await del(url);
  } catch {
    // Left behind on purpose.
  }
}
