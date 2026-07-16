"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { type CreateOrganizationInput, createOrganizationSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { slugify } from "@/lib/slugify";

// Create-organization modal, opened from the header OrgSwitcher. Goes through the
// Better Auth client (the org UI convention — not a Server Action), which re-validates
// and returns `{ data, error }`. On success we immediately `setActive` the new org so
// the very next request scopes to it (authoritative, cookie-cache-bypassed server-side
// — see lib/organization), then route to /organization to manage it. The slug tracks
// the name until the user edits it, after which it's left alone.
export function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Organization.create");
  const router = useRouter();
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  });

  async function onSubmit(values: CreateOrganizationInput) {
    setError(null);
    const created = await authClient.organization.create({
      name: values.name,
      slug: values.slug,
    });
    if (created.error) {
      setError(created.error.message ?? t("error"));
      return;
    }
    // Make the new org the caller's active workspace before leaving the dialog.
    await authClient.organization.setActive({ organizationId: created.data.id });
    onOpenChange(false);
    form.reset({ name: "", slug: "" });
    setSlugEdited(false);
    // Defer the route change until the dialog has finished closing. This dialog lives in
    // the persistent (dashboard) header, so navigating in the same tick the modal closes
    // races Radix's restore of the aria-hidden it puts on the rest of the layout while
    // open — leaving the destination page hidden from assistive tech until a reload. A
    // macrotask lets the close (and that restore) commit first; the push renders
    // /organization fresh, so no router.refresh() is needed.
    setTimeout(() => router.push("/organization"), 0);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset({ name: "", slug: "" });
          setSlugEdited(false);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
                      autoComplete="organization"
                      {...field}
                      onChange={(event) => {
                        field.onChange(event);
                        if (!slugEdited) {
                          form.setValue("slug", slugify(event.target.value), {
                            shouldValidate: form.formState.isSubmitted,
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("slugLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("slugPlaceholder")}
                      {...field}
                      onChange={(event) => {
                        setSlugEdited(true);
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t("slugDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
