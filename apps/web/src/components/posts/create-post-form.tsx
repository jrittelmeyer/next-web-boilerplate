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
import { Textarea } from "@repo/ui/components/textarea";
import { type CreatePostInput, createPostSchema } from "@repo/validators";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyFieldErrors, FieldActionError } from "@/lib/forms";
import { useTRPC } from "@/lib/trpc/client";
import { createPost } from "@/server/actions/post";
import { type PostListData, type PostListItem, prependPostToCache } from "./post-cache";

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; title: string };

// Create form for the example `posts` entity. Validates with the shared schema
// (zodResolver), then submits to the auth-gated `createPost` Server Action via a
// TanStack `useMutation` so the new row appears OPTIMISTICALLY: onMutate prepends a
// temp row to the `post.list` infinite cache, onError rolls it back, onSettled
// invalidates so the server's real row (canonical id/timestamps) replaces the temp.
export function CreatePostForm({
  currentUser,
}: {
  currentUser: { id: string; name: string } | null;
}) {
  const t = useTranslations("Posts.form");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.post.list.infiniteQueryKey();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const form = useForm<CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { title: "", content: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreatePostInput) => {
      const formData = new FormData();
      formData.set("title", values.title);
      formData.set("content", values.content);
      const result = await createPost(formData);
      // Normalize the action's typed `{ error }` into a thrown error so the mutation's
      // onError/rollback path runs (e.g. a signed-out submit → "Unauthorized"). Carry
      // any per-field `fieldErrors` (A7) along so onError can map them inline.
      if ("error" in result) throw new FieldActionError(result.error, result.fieldErrors);
      return result.data;
    },
    onMutate: async (values) => {
      setStatus({ kind: "idle" });
      // Only optimistic when we know the author. A signed-out attempt skips the temp
      // row and lets the server's "Unauthorized" surface via onError.
      if (!currentUser) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PostListData>(queryKey);
      const optimistic: PostListItem = {
        id: `optimistic-${crypto.randomUUID()}`,
        title: values.title,
        content: values.content,
        createdAt: new Date(),
        authorId: currentUser.id,
        authorName: currentUser.name,
      };
      queryClient.setQueryData<PostListData>(queryKey, (data) =>
        prependPostToCache(data, optimistic),
      );
      return { previous };
    },
    onError: (error, _values, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      // A7 — per-field server errors render inline (RHF setError → <FormMessage/>);
      // a field-less error (Unauthorized, rate-limit, duplicate with no field) stays
      // in the form-level status banner.
      const fieldErrors = error instanceof FieldActionError ? error.fieldErrors : undefined;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        applyFieldErrors(form.setError, fieldErrors);
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "error", message: error.message });
      }
    },
    onSuccess: (data) => {
      setStatus({ kind: "success", title: data.title });
      form.reset({ title: "", content: "" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        className="space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("titleLabel")}</FormLabel>
              <FormControl>
                <Input placeholder={t("titlePlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("contentLabel")}</FormLabel>
              <FormControl>
                <Textarea placeholder={t("contentPlaceholder")} rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? t("submitting") : t("submit")}
        </Button>
        {!currentUser ? <p className="text-sm text-muted-foreground">{t("notSignedIn")}</p> : null}
        {status.kind === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {status.message}
          </p>
        ) : null}
        {status.kind === "success" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("published", { title: status.title })}
          </p>
        ) : null}
      </form>
    </Form>
  );
}
