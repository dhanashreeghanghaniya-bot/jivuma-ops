'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import type { GpsFix } from '@juma/shared';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import { compressAndStamp } from './photo';

export interface CapturedPhoto {
  blob: Blob;
  capturedAt: string;
}

/**
 * Camera capture only (`capture="environment"`), never the gallery, so a photo
 * is taken on the spot. Each shot is compressed and stamped before it is kept.
 */
export function PhotoCapture({
  label,
  fix,
  photo,
  onChange,
}: {
  label: string;
  fix: GpsFix | null;
  photo: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const capturedAt = new Date();
      onChange({
        blob: await compressAndStamp(file, fix, capturedAt),
        capturedAt: capturedAt.toISOString(),
      });
    } catch {
      toast.error(t('common.photoUnreadable'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {preview ? (
        <div className="relative h-24 w-24 overflow-hidden rounded-md border">
          <img src={preview} alt={label} className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={t('common.removePhoto', { label })}
            onClick={() => onChange(null)}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 text-center text-[10px] text-white">
            {label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-muted-foreground flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {label}
        </button>
      )}
    </div>
  );
}
