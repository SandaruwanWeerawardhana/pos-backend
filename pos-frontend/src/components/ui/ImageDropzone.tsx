"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Image from "next/image";
import { ImagePlus, Star, Trash2, UploadCloud } from "lucide-react";
import { Spinner } from "./Spinner";
import { staggerDelay } from "@/lib/motion";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/products/constants";

interface ImageDropzoneProps {
  /** Data URLs. The first entry is treated as the primary image. */
  value: string[];
  onChange: (images: string[]) => void;
  onError?: (message: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

// Images are stored inline as data URLs because the app is local-first: there
// is no upload endpoint to hold a remote URL, and a base64 blob survives in
// IndexedDB and syncs later as part of the product record.
export function ImageDropzone({
  value,
  onChange,
  onError,
  error,
  disabled = false,
  label = "Product images",
}: Readonly<ImageDropzoneProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  async function ingest(files: FileList | null) {
    if (!files || files.length === 0 || disabled) return;

    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        onError?.(`${file.name}: use JPG, PNG, WebP or AVIF`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        onError?.(`${file.name}: over the ${formatMb(MAX_IMAGE_BYTES)} limit`);
        continue;
      }
      accepted.push(file);
    }

    const room = MAX_IMAGES - value.length;
    if (accepted.length > room) {
      onError?.(`Only ${MAX_IMAGES} images per product`);
    }
    const usable = accepted.slice(0, Math.max(0, room));
    if (usable.length === 0) return;

    setBusy(true);
    try {
      const dataUrls = await Promise.all(usable.map(readAsDataUrl));
      onChange([...value, ...dataUrls]);
    } catch (readError) {
      onError?.(
        readError instanceof Error ? readError.message : "Could not read image",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void ingest(event.dataTransfer.files);
  }

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    void ingest(event.target.files);
    // Reset so re-picking the same file still fires a change event.
    event.target.value = "";
  }

  function removeAt(index: number) {
    onChange(value.filter((_, position) => position !== index));
  }

  function makePrimary(index: number) {
    const next = [...value];
    const [promoted] = next.splice(index, 1);
    onChange([promoted, ...next]);
  }

  const full = value.length >= MAX_IMAGES;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
          dragging
            ? "scale-[1.01] border-secondary bg-secondary/5 dark:border-blue-400 dark:bg-blue-500/10"
            : "border-outline-variant bg-surface-container-low/60 dark:border-zinc-700 dark:bg-zinc-900/60"
        } ${error ? "border-error" : ""}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          className="sr-only"
          onChange={handleSelect}
          disabled={disabled || full}
        />
        <UploadCloud
          size={28}
          aria-hidden
          className={`mx-auto text-on-surface-variant transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] dark:text-zinc-500 ${
            dragging ? "-translate-y-1 scale-110" : ""
          }`}
        />
        <p className="mt-2 text-sm font-medium text-on-surface dark:text-zinc-100">
          Drag images here
        </p>
        <p className="mt-0.5 text-xs text-on-surface-variant dark:text-zinc-500">
          JPG, PNG, WebP or AVIF · up to {formatMb(MAX_IMAGE_BYTES)} each ·{" "}
          {value.length}/{MAX_IMAGES} used
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || full || busy}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant px-4 text-sm font-medium text-on-surface transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-[1.02] hover:bg-surface-container active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {busy ? <Spinner size="sm" label={null} /> : <ImagePlus size={16} />}
          {busy ? "Adding…" : "Choose files"}
        </button>
        <span className="sr-only" aria-live="polite">
          {label}: {value.length} of {MAX_IMAGES} images added
        </span>
      </div>

      {error && (
        <span className="animate-fade-in text-xs text-error">{error}</span>
      )}

      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((src, index) => (
            <li
              key={src.slice(-48)}
              style={staggerDelay(index)}
              className="group animate-scale-in relative aspect-square overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low transition-shadow duration-[var(--duration-base)] hover:shadow-elevated dark:border-zinc-700 dark:bg-zinc-800"
            >
              <Image
                src={src}
                alt={`Product image ${index + 1}`}
                fill
                unoptimized
                sizes="(max-width: 640px) 50vw, 200px"
                className="object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-standard)] group-hover:scale-105"
              />
              {index === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-on-secondary dark:bg-blue-500 dark:text-white">
                  Primary
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                {index !== 0 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(index)}
                    aria-label={`Make image ${index + 1} the primary image`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/85 text-zinc-800 transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-110 hover:bg-white active:scale-95"
                  >
                    <Star size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove image ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/85 text-error transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-110 hover:bg-white active:scale-95"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
