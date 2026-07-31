"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { EDIT_SCOPES, type EditScope } from "@repo/validators/calendar";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * "This occurrence / this and following / all" — asked before a scoped write, never
 * guessed.
 *
 * Native radios inside a `<fieldset>` with a `<legend>`, rather than a hand-rolled
 * `role="radiogroup"`: the grouping, the arrow-key behaviour and the group's accessible
 * name all come from the platform, and `a11y.spec.ts` checks the result rather than the
 * markup.
 *
 * `warnOnAll` is a first-class deliverable, not filler. `scope: "all"` on an edit that
 * moves the series — a changed rule, start wall or zone — **drops every override and
 * every skipped date**, because their `recurrence_id`s stop naming occurrences that
 * exist. That is correct and it is destructive, so it is said out loud before the write,
 * not discovered afterwards.
 */
export function EditScopeDialog({
  intent,
  warnOnAll,
  onCancel,
  onConfirm,
}: {
  /** The copy for `all` differs sharply between changing a series and deleting one. */
  intent: "edit" | "delete";
  warnOnAll: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const t = useTranslations("Calendar.scope");
  const [scope, setScope] = useState<EditScope>("this");

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent data-testid="edit-scope-dialog">
        <DialogHeader>
          <DialogTitle>{t(`${intent}.title`)}</DialogTitle>
          <DialogDescription>{t(`${intent}.description`)}</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t(`${intent}.title`)}</legend>
          {EDIT_SCOPES.map((option) => (
            <label key={option} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="edit-scope"
                className="mt-1 size-4"
                value={option}
                data-testid={`edit-scope-${option}`}
                checked={scope === option}
                onChange={() => setScope(option)}
              />
              <span>{t(`${intent}.${option}`)}</span>
            </label>
          ))}
        </fieldset>

        {scope === "all" && warnOnAll ? (
          <p
            className="rounded-md border border-dashed p-2 text-sm text-muted-foreground"
            role="status"
            data-testid="edit-scope-warning"
          >
            {t("dropsOverrides")}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="button" data-testid="edit-scope-confirm" onClick={() => onConfirm(scope)}>
            {t("confirm")}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
