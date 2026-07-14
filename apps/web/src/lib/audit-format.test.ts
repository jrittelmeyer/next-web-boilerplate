import { describe, expect, it } from "vitest";
import { describeAuditEvent } from "./audit-format";

// Unit coverage for the audit-event display mapper (B2 read UI). Every action branch,
// the metadata-narrowing fallbacks (missing field / wrong type / non-object / null),
// and the open-text unknown-action passthrough — the page relies on none of this
// throwing on a malformed `jsonb` row.

describe("describeAuditEvent", () => {
  it("labels a role change and renders old → new from metadata", () => {
    expect(
      describeAuditEvent({
        action: "user.role_changed",
        metadata: { oldRole: "user", newRole: "admin" },
      }),
    ).toEqual({ label: "Role changed", detail: "user → admin" });
  });

  it("labels an email change and renders old → new from metadata", () => {
    expect(
      describeAuditEvent({
        action: "user.email_changed",
        metadata: { oldEmail: "a@example.com", newEmail: "b@example.com" },
      }),
    ).toEqual({ label: "Email changed", detail: "a@example.com → b@example.com" });
  });

  it("labels a sign-in and renders the source ip", () => {
    expect(
      describeAuditEvent({ action: "user.signed_in", metadata: { ip: "1.2.3.4", userAgent: "x" } }),
    ).toEqual({ label: "Signed in", detail: "from 1.2.3.4" });
  });

  it("labels a deletion with no detail", () => {
    expect(describeAuditEvent({ action: "user.deleted", metadata: null })).toEqual({
      label: "User deleted",
      detail: null,
    });
  });

  it("labels a ban and renders the reason from metadata", () => {
    expect(describeAuditEvent({ action: "user.banned", metadata: { reason: "spam" } })).toEqual({
      label: "User banned",
      detail: "reason: spam",
    });
  });

  it("labels a ban with no reason (permanent, no detail)", () => {
    expect(describeAuditEvent({ action: "user.banned", metadata: null })).toEqual({
      label: "User banned",
      detail: null,
    });
  });

  it("labels an unban with no detail", () => {
    expect(describeAuditEvent({ action: "user.unbanned", metadata: null })).toEqual({
      label: "User unbanned",
      detail: null,
    });
  });

  it("labels an impersonation start/stop with no detail (identity resolves via the page JOINs)", () => {
    expect(describeAuditEvent({ action: "user.impersonated", metadata: null })).toEqual({
      label: "User impersonated",
      detail: null,
    });
    expect(describeAuditEvent({ action: "user.impersonation_stopped", metadata: null })).toEqual({
      label: "Impersonation stopped",
      detail: null,
    });
  });

  it("drops detail when a metadata field is missing or the wrong type", () => {
    // role change missing newRole → no detail (the `from && to` guard)
    expect(
      describeAuditEvent({ action: "user.role_changed", metadata: { oldRole: "user" } }).detail,
    ).toBeNull();
    // email change with a non-string field → str() rejects it
    expect(
      describeAuditEvent({
        action: "user.email_changed",
        metadata: { oldEmail: "a@example.com", newEmail: 42 },
      }).detail,
    ).toBeNull();
    // sign-in without an ip
    expect(
      describeAuditEvent({ action: "user.signed_in", metadata: { userAgent: "x" } }).detail,
    ).toBeNull();
    // empty-string field is treated as absent
    expect(
      describeAuditEvent({
        action: "user.role_changed",
        metadata: { oldRole: "", newRole: "admin" },
      }).detail,
    ).toBeNull();
  });

  it("treats non-object metadata as no detail", () => {
    expect(describeAuditEvent({ action: "user.signed_in", metadata: "nope" }).detail).toBeNull();
    expect(
      describeAuditEvent({ action: "user.role_changed", metadata: undefined }).detail,
    ).toBeNull();
  });

  it("passes an unknown (open-text) action through as its own label with no detail", () => {
    expect(describeAuditEvent({ action: "user.something_new", metadata: { foo: "bar" } })).toEqual({
      label: "user.something_new",
      detail: null,
    });
  });
});
