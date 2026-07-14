"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { type InviteMemberInput, inviteMemberSchema } from "@repo/validators";
import { useState } from "react";
import { useForm } from "react-hook-form";

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  // Email configured → Better Auth sent the invite to the address.
  | { kind: "sent"; email: string }
  // Email off → the invitation row exists but no mail went out; the accept link must
  // be copied from the Pending invitations list below (mirrors the sign-up-verification
  // copyable-link posture — see auth.ts sendInvitationEmail no-op).
  | { kind: "created"; email: string };

// Invite a member to the active organization (Tier 4 · Band 4). Goes through the
// Better Auth client `inviteMember`, which targets the active org and re-checks that
// the caller may invite. On success the Pending invitations list refreshes reactively
// (the org refetch). The success copy branches on `emailConfigured` so the email-off
// path tells the user to share the copyable link instead of waiting for a mail.
export function InviteMemberForm({ emailConfigured }: { emailConfigured: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "member" },
  });

  async function onSubmit(values: InviteMemberInput) {
    setStatus({ kind: "idle" });
    const { error } = await authClient.organization.inviteMember({
      email: values.email,
      role: values.role,
    });
    if (error) {
      setStatus({
        kind: "error",
        message: error.message ?? "Could not send the invitation.",
      });
      return;
    }
    form.reset({ email: "", role: values.role });
    setStatus(
      emailConfigured
        ? { kind: "sent", email: values.email }
        : { kind: "created", email: values.email },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
        <CardDescription>
          They&rsquo;ll join once they accept the invitation.
          {emailConfigured
            ? " We'll email them a link."
            : " Email is off, so copy the invite link from the list below to share it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 sm:flex-row sm:items-start"
            noValidate
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="off"
                      placeholder="teammate@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem className="sm:w-36">
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="sm:mt-[1.625rem]"
            >
              {form.formState.isSubmitting ? "Inviting…" : "Send invite"}
            </Button>
          </form>
        </Form>
        {status.kind === "error" ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {status.message}
          </p>
        ) : null}
        {status.kind === "sent" ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            Invitation sent to {status.email}.
          </p>
        ) : null}
        {status.kind === "created" ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            Invitation created for {status.email}. Copy its link from the list below to share it.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
