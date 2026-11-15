import { supabase } from "./supabase";

const BUCKET = "shop-images";

/** Storage object names are unique and never overwritten, so browsers/CDNs
 * can safely retain uploaded images for a long time without stale content. */
const IMAGE_CACHE_SECONDS = 31_536_000;

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
      contentType: file.type,
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

/**
 * Upload images to Storage instead of embedding base64 in Postgres rows.
 *
 * Inline base64 made every catalog query carry the full image payload again,
 * even when the browser already had the image displayed. Storage URLs keep
 * catalog records small and let the browser/CDN cache image bytes separately.
 */
export async function processImageFile(
  file: File,
  folder: ImageFolder = "items"
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be under 5MB");
  }
  return uploadImage(file, folder);
}
