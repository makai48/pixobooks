import { supabase } from "./supabase";

const BUCKET = "shop-images";

/** Storage object names are unique and never overwritten, so browsers/CDNs
 * can safely retain uploaded images for a long time without stale content. */
export const IMAGE_CACHE_SECONDS = 31_536_000;

/** Longest edge kept when re-encoding a photo. 1600px stays sharp on shop
 * screens while keeping a phone photo near 150–250KB instead of 3–5MB. */
export const IMAGE_MAX_EDGE = 1600;

/** Files already this small are uploaded untouched — re-encoding them would
 * cost quality without a meaningful storage or egress saving. */
const SHRINK_ABOVE_BYTES = 300 * 1024;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Storage folders mirror entity types so images stay organized per domain. */
export type ImageFolder = "logos" | "items" | "avatars" | "customers" | "suppliers";

export async function uploadImage(
  file: File,
  folder: ImageFolder = "items"
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const filename = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, {
      cacheControl: String(IMAGE_CACHE_SECONDS),
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Output box for an image, preserving its aspect ratio. Exported for tests. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = IMAGE_MAX_EDGE
): { width: number; height: number; scale: number } {
  if (!(width > 0) || !(height > 0)) return { width, height, scale: 1 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function canvasEncodesWebp(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/**
 * Re-encode heavy photos before they leave the device.
 *
 * Uploading the camera's original means every catalog response, backup export
 * and fresh device pays for its full size. A 4MB photo becomes roughly 200KB
 * here. The original file is returned when the browser cannot decode it or
 * when re-encoding would not make it smaller, so an upload never fails because
 * of this step.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const box = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, box.width, box.height);
    const type = canvasEncodesWebp(canvas) ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.82)
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, {
      type,
    });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Every image goes to Storage, never into the database row.
 *
 * Inline base64 made every catalog query carry the full image payload again,
 * even when the browser already had the image displayed. Storage URLs keep
 * catalog records small and let the browser/CDN cache the bytes separately.
 */
export async function processImageFile(
  file: File,
  folder: ImageFolder = "items"
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image must be under 5MB");
  }
  const prepared = await shrinkImage(file);
  return uploadImage(prepared, folder);
}
