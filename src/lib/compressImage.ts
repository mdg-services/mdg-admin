import { resolveFileType } from './uploadAttachment';

/**
 * Downscale + recompress a picked photo BEFORE the presigned S3 PUT.
 *
 * A copy of `mdg-client/src/lib/compressImage.ts`, byte-for-byte in behaviour
 * and deliberately so: the register photo an admin files on a dealer's behalf is
 * read back by that dealer's phone, on the same 2G link and through the same
 * `DayPhotoViewer` as the ones they took themselves. Without this, a 12 MB
 * camera JPEG cleared from a desk in the office becomes a 12 MB download at the
 * pump, next to the dealer's own 300 KB photos — the exact cost the client-side
 * compression exists to prevent. It cannot live in `@dk/shared`, which carries
 * no DOM types.
 *
 * Deliberately conservative — it returns `null` (meaning "keep the original")
 * whenever compression is not worth it or could go wrong, so the caller NEVER
 * uploads a broken/empty blob:
 *   - not a raster image (uses resolveFileType to recover Android empty-MIME)
 *   - already small (< ~300 KB)
 *   - animated GIF (would flatten to a single frame)
 *   - the environment lacks createImageBitmap / <canvas>
 *   - decode/encode throws, or the result is empty or bigger than the original
 *
 * Uses a normal <canvas> (not OffscreenCanvas, which is missing on Android 8/9
 * System WebView, where the admin shell also runs).
 */

/** Below this, the CPU + quality cost of recompressing isn't worth it. */
const MIN_COMPRESS_BYTES = 300 * 1024;
/** Longest edge of the output image, in CSS px. */
const MAX_EDGE = 1600;
/** JPEG quality for the re-encode. */
const JPEG_QUALITY = 0.7;

export async function compressImage(
  file: File,
  opts?: { contentType?: string },
): Promise<File | null> {
  try {
    // Recover the real kind/type even when Android hands back an empty MIME.
    const resolved = resolveFileType(file);
    const type = (opts?.contentType || file.type || resolved.contentType).toLowerCase();
    if (resolved.kind !== 'image') return null;
    // Animated GIFs would be flattened to one frame — leave them alone.
    if (type.includes('gif')) return null;
    if (file.size < MIN_COMPRESS_BYTES) return null;
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) {
      bitmap.close?.();
      return null;
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });
    // Release the backing store promptly on memory-constrained devices.
    canvas.width = 0;
    canvas.height = 0;

    if (!blob || blob.size === 0) return null; // never upload an empty blob
    if (blob.size >= file.size) return null; // no real saving — keep the original

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // Any failure (unsupported HEIC decode, OOM, tainted canvas) → keep original.
    return null;
  }
}
