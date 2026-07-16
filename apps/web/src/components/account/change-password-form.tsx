"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { type ChangePasswordInput, changePasswordSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

// Signed-in password change. Auth mutations go through the Better Auth client (the
// C1 convention — not a Server Action), which re-validates server-side and returns
// `{ data, error }` rather than throwing. Same-origin, so this adds no CSP origin.
// `revokeOtherSessions` signs out the account's other sessions on a successful change
// (the secure default after a credential rotation). The outcome surfaces as a toast (A1).
export function ChangePasswordForm() {
  const t = useTranslations("Account.password");
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function onSubmit(values: ChangePasswordInput) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      toast.error(error.message ?? t("error"));
      return;
    }
    toast.success(t("updated"));
    form.reset({ currentPassword: "", newPassword: "" });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("current")}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("new")}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("updating") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
