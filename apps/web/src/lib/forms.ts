import type { FieldErrors } from "@repo/validators";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * Map a Server Action's `fieldErrors` (A7) onto a React Hook Form so each failing
 * field shows its message inline via `<FormMessage/>`, instead of collapsing the
 * server's validation to one form-level string. The keys are the action's field
 * names and MUST match the form's field names. Field errors set this way clear on
 * the next `handleSubmit` (the resolver re-runs). See API.md → Server Actions.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: FieldErrors,
): void {
  for (const [field, message] of Object.entries(fieldErrors)) {
    setError(field as Path<T>, { message });
  }
}
