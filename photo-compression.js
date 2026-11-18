/* RAAFAT image optimizer — compress before uploads, never send oversized originals. */
export const MAX_PHOTO_BYTES = 200000; // 200 decimal KB (stricter than 200 KiB).
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const INPUT_TYPES = new Set(["image/jpeg","image/png","image/webp"]);

export function validatePhotoSource(file) {
  if (!file || !INPUT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_SOURCE_BYTES)
    throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP وبحجم أصلي لا يتجاوز 25 ميغابايت.");
}

async function decodePhoto(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (error) {
      // HTMLImageElement is a useful fallback on Safari and older devices.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (img.decode) await img.decode();
    else await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encodeWebp(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob || blob.type !== "image/webp") reject(new Error("المتصفح لا يدعم ضغط WebP."));
        else resolve(blob);
      }, "image/webp", quality);
    } catch (error) { reject(error); }
  });
}

export async function compressPhoto(file) {
  validatePhotoSource(file);
  if (file.size <= MAX_PHOTO_BYTES) {
    return { blob: file, compressed: false, originalSize: file.size, finalSize: file.size };
  }
  let decoded;
  const canvas = document.createElement("canvas");
  try {
    decoded = await decodePhoto(file);
    const maxDimension = Math.max(decoded.width, decoded.height);
    if (!maxDimension) throw new Error("تعذر قراءة أبعاد الصورة.");
    const initialScale = Math.min(1, 1920 / maxDimension);
    let width = Math.max(1, Math.round(decoded.width * initialScale));
    let height = Math.max(1, Math.round(decoded.height * initialScale));
    for (let pass = 0; pass < 14; pass++) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("تعذر تشغيل أداة ضغط الصور في هذا المتصفح.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.image, 0, 0, width, height);
      for (const quality of [0.86, 0.76, 0.67]) {
        const output = await encodeWebp(canvas, quality);
        if (output.size <= MAX_PHOTO_BYTES && output.size > 0) {
          const name = String(file.name || "raafat-photo").replace(/\.[^.]+$/, "") + ".webp";
          const result = new File([output], name, { type: "image/webp", lastModified: Date.now() });
          return { blob: result, compressed: true, originalSize: file.size, finalSize: result.size };
        }
      }
      if (width <= 1 && height <= 1) break;
      width = Math.max(1, Math.floor(width * 0.82));
      height = Math.max(1, Math.floor(height * 0.82));
    }
    throw new Error("لم نتمكن من الوصول إلى 200 كيلوبايت. اختر صورة أخرى.");
  } catch (error) {
    throw new Error("تعذر ضغط الصورة: " + (error.message || "صيغة غير مدعومة."));
  } finally {
    decoded?.close();
    canvas.width = 0; canvas.height = 0;
  }
}
