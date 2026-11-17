"use client";

// Phone photos are often 4-12 MB. Shrinking them in the browser before upload makes uploads
// several times faster on mobile data, turns iPhone HEIC into JPEG, applies the camera's
// rotation and drops EXIF/GPS data. The server still re-checks and re-encodes every file.

const MAX_EDGE = 2400;

export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 2_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // the browser cannot decode it; let the server decide
  }
}

export function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}

/** Uploads one photo to the dashboard media endpoint, reporting progress from 0 to 1. */
export function uploadPhoto(blob: Blob, filename: string, onProgress: (fraction: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.set("kind", "photo");
    fd.append("files", blob, filename);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/dashboard/media");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText) as { saved?: { id: string }[]; error?: string };
        if (json.saved?.[0]) resolve({ id: json.saved[0].id });
        else reject(new Error(json.error?.replace(/^[^:]+: /, "") || "Upload failed."));
      } catch {
        reject(new Error("Upload failed. Try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(fd);
  });
}
