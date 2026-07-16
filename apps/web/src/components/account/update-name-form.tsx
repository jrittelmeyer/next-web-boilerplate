"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { type UpdateNameInput, updateNameSchema } from "@repo/validators";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { updateUserName } from "@/server/actions/user";

export function UpdateNameForm({ defaultName }: { defaultName?: string }) {
  const t = useTranslations("Account.name");
  const form = useForm<UpdateNameInput>({
    resolver: zodResolver(updateNameSchema),
    defaultValues: { name: defaultName ?? "" },
  });

  // Client validates with the shared schema (zodResolver); the Server Action
  // re-validates and enforces auth. FormData keeps the action progressively
  // enhanceable even though we invoke it through handleSubmit here. Field-level
  // errors stay inline (FormMessage); the save outcome surfaces as a toast (A1).
  async function onSubmit(values: UpdateNameInput) {
    const formData = new FormData();
    formData.set("name", values.name);

    const result = await updateUserName(formData);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(t("saved", { name: result.data.name }));
    form.reset({ name: result.data.name });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("label")}</FormLabel>
              <FormControl>
                <Input placeholder={t("placeholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("saving") : t("save")}
        </Button>
      </form>
    </Form>
  );
}
