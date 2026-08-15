"use client";

import { Controller } from "react-hook-form";
import { Upload } from "lucide-react";
import { ImageDropzone } from "@/components/ui/ImageDropzone";
import { useToast } from "@/components/ui/Toast";
import { FormSection } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface MediaSectionProps extends ProductSectionProps {
  errorCount: number;
}

export function MediaSection({ form, errorCount }: Readonly<MediaSectionProps>) {
  const { control, formState } = form;
  const { showToast } = useToast();

  return (
    <FormSection
      id="images"
      title="Product images gallery"
      description="The first image is the main one"
      icon={<Upload size={18} />}
      errorCount={errorCount}
    >
      <p className="mb-3 text-xs text-on-surface-variant dark:text-zinc-400">
        Upload one or more images. The first image is stored in the product
        image field for compatibility with the till and the shelf label.
      </p>
      <Controller
        control={control}
        name="images"
        render={({ field }) => (
          <ImageDropzone
            value={field.value}
            onChange={field.onChange}
            onError={(message) => showToast(message, "error")}
            error={formState.errors.images?.message}
          />
        )}
      />
    </FormSection>
  );
}
