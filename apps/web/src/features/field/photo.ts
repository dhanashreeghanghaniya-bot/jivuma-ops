import type { GpsFix } from '@juma/shared';

/** `22-10-2026 02:11:46 pm` in IST, matching the app's DD-MM-YYYY convention. */
function istStamp(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${String(parts.dayPeriod).toLowerCase()}`;
}

/** SPEC 1: field photos must not eat the salesman's data. */
const MAX_EDGE = 1600;
const QUALITY = 0.7;

/**
 * Downscales a camera photo to at most 1600 px, re-encodes it as ~70% JPEG and
 * burns the capture time and GPS position into the bottom edge (SPEC 5.1.3),
 * so the evidence travels with the image itself.
 */
export async function compressAndStamp(
  file: Blob,
  fix: GpsFix | null,
  takenAt = new Date(),
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const stamp = [
    istStamp(takenAt),
    fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} ±${fix.accuracyM} m` : 'No GPS',
  ].join('   ');
  const fontSize = Math.max(14, Math.round(width / 45));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const pad = Math.round(fontSize * 0.6);
  const band = fontSize + pad * 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, height - band, width, band);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(stamp, pad, height - band / 2, width - pad * 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))),
      'image/jpeg',
      QUALITY,
    ),
  );
}
