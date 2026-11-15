// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  IMAGE_CACHE_SECONDS,
  MAX_UPLOAD_BYTES,
  fitWithin,
  processImageFile,
  shrinkImage,
  uploadImage,
} from "./imageUpload";

const mocks = vi.hoisted(() => ({
  bucket: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        mocks.bucket(bucket);
        return { upload: mocks.upload, getPublicUrl: mocks.getPublicUrl };
      },
    },
  },
}));

const image = (bytes = 1024, name = "photo.png", type = "image/png") =>
  new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => {
  mocks.bucket.mockClear();
  mocks.upload.mockReset();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReset();
  mocks.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://cdn.example/shop-images/${path}` },
  }));
});

describe("uploadImage", () => {
  it("stores the file under its folder with a one-year cache", async () => {
    const file = image();
    const url = await uploadImage(file, "items");

    expect(mocks.bucket).toHaveBeenCalledWith("shop-images");
    expect(mocks.upload).toHaveBeenCalledTimes(1);

    const [path, sent, options] = mocks.upload.mock.calls[0];
    expect(path).toMatch(/^items\/\d+-[a-z0-9]+\.png$/);
    expect(sent).toBe(file);
    expect(options).toEqual({
      cacheControl: String(IMAGE_CACHE_SECONDS),
      upsert: false,
      contentType: "image/png",
    });

    expect(mocks.getPublicUrl).toHaveBeenCalledWith(path);
    expect(url).toBe(`https://cdn.example/shop-images/${path}`);
    expect(url.startsWith("data:")).toBe(false);
  });

  it("keeps entity folders separate", async () => {
    await uploadImage(image(1024, "me.jpg", "image/jpeg"), "avatars");
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^avatars\/\d+-[a-z0-9]+\.jpg$/);
  });

  it("surfaces a storage error instead of returning a broken URL", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("new row violates policy") });
    await expect(uploadImage(image())).rejects.toThrow(/policy/);
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
  });
});

describe("processImageFile", () => {
  it("sends images to Storage instead of inlining base64", async () => {
    const file = image(1024);
    const url = await processImageFile(file, "items");

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][1]).toBe(file);
    expect(url.startsWith("https://")).toBe(true);
  });

  it("rejects non-image files", async () => {
    const notes = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(processImageFile(notes)).rejects.toThrow(/image file/i);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects images over the 5MB limit before uploading", async () => {
    await expect(processImageFile(image(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/5MB/);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads the original untouched when the browser cannot decode it", async () => {
    const heavy = image(2 * 1024 * 1024);
    const prepared = await shrinkImage(heavy);
    // jsdom has no createImageBitmap; the upload must still succeed.
    expect(prepared).toBe(heavy);
  });
});

describe("fitWithin", () => {
  it("caps the long edge and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toMatchObject({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toMatchObject({ width: 1200, height: 1600 });
  });

  it("leaves smaller images at their original size", () => {
    expect(fitWithin(800, 600)).toMatchObject({ width: 800, height: 600, scale: 1 });
  });

  it("never divides by zero on a broken bitmap", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 100, scale: 1 });
  });
});
