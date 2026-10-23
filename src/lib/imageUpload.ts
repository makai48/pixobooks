import { supabase } from "./supabase";

const BUCKET = "shop-images";

// 100KB threshold for embedded base64; larger goes to Storage
const BASE64_INLINE_LIMIT = 100 * 1024;

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
      cacheControl: "3600",
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
 * Smart handler: small images → base64 inline, larger → uploaded to Storage.
 * Users can also paste a URL or base64 directly.
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
  if (file.size < BASE64_INLINE_LIMIT) {
    return fileToBase64(file);
  }
  return uploadImage(file, folder);
}
