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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTRPC } from "@/lib/trpc/client";
import { deletePost, updatePost } from "@/server/actions/post";
import {
  type PostListData,
  type PostListItem,
  patchPostInCache,
  removePostFromCache,
} from "./post-cache";

// One row of the posts list, with an inline edit toggle. It owns BOTH writes that
// target a single row — edit and delete — each as a TanStack `useMutation` with the
// optimistic-with-rollback shape:
//   onMutate  → cancel in-flight refetches, snapshot the cache, apply the change now
//   onError   → restore the snapshot + surface the server's typed error
//   onSettled → invalidate so the cache reconciles with the server
// Controls show on EVERY row (not just the author's); the Server Action re-checks
// ownership, so editing/deleting another author's post optimistically changes the row
// then rolls back on the typed "Forbidden" — a live demo of the rollback path.
export function PostItem({ post }: { post: PostListItem }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.post.list.infiniteQueryKey();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: { title: post.title, content: post.content },
  });

  const editMutation = useMutation({
    mutationFn: async (values: CreatePostInput) => {
      const formData = new FormData();
      formData.set("id", post.id);
      formData.set("title", values.title);
      formData.set("content", values.content);
      const result = await updatePost(formData);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (values) => {
      setError(null);
      setIsEditing(false);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PostListData>(queryKey);
      queryClient.setQueryData<PostListData>(queryKey, (data) =>
        patchPostInCache(data, post.id, values),
      );
      return { previous };
    },
    onError: (mutationError, _values, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      // Reopen the editor (with the user's draft intact) so they can retry or cancel.
      setIsEditing(true);
      setError(mutationError.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deletePost(post.id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      setError(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PostListData>(queryKey);
      queryClient.setQueryData<PostListData>(queryKey, (data) =>
        removePostFromCache(data, post.id),
      );
      return { previous };
    },
    onError: (mutationError, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setError(mutationError.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isEditing) {
    return (
      <li className="rounded-md border p-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => editMutation.mutate(values))}
            className="space-y-3"
            noValidate
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  form.reset({ title: post.title, content: post.content });
                }}
              >
                Cancel
              </Button>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </Form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-4 rounded-md border p-4">
      <div className="min-w-0">
        <p className="font-medium">{post.title}</p>
        <p className="text-sm text-muted-foreground">{post.content}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          by {post.authorName ?? "unknown"} · {post.createdAt.toLocaleString()}
        </p>
        {error ? (
          <p className="mt-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            form.reset({ title: post.title, content: post.content });
            setIsEditing(true);
          }}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </li>
  );
}
