import type { UseFormReturn } from "react-hook-form";
import type { ProductFormValues } from "@/lib/products/schema";

/**
 * Sections receive the whole form object rather than individual value/onChange
 * pairs: React Hook Form keeps re-renders scoped to the fields that actually
 * changed, which is the point of using it for a form this size.
 */
export interface ProductSectionProps {
  form: UseFormReturn<ProductFormValues>;
}
