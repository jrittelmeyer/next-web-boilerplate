import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  banUserSchema,
  changeEmailSchema,
  changePasswordSchema,
  createOrganizationSchema,
  createPostSchema,
  deleteAccountSchema,
  inviteMemberSchema,
  magicLinkRequestSchema,
  notificationPayloadSchema,
  setUserRoleSchema,
  twoFactorBackupCodeSchema,
  twoFactorCodeSchema,
  twoFactorPasswordSchema,
  unbanUserSchema,
  updateNameSchema,
  zodFieldErrors,
} from "./index";

describe("updateNameSchema", () => {
  it("accepts a valid name", () => {
    expect(updateNameSchema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
  });

  it("trims surrounding whitespace", () => {
    expect(updateNameSchema.parse({ name: "  Ada  " })).toEqual({ name: "Ada" });
  });

  it("rejects an empty name with the expected message", () => {
    const result = updateNameSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name is required");
    }
  });
});

describe("setUserRoleSchema", () => {
  it("accepts a valid role", () => {
    expect(setUserRoleSchema.parse({ userId: "u1", role: "admin" })).toEqual({
      userId: "u1",
      role: "admin",
    });
  });

  it("rejects an unknown role", () => {
    const result = setUserRoleSchema.safeParse({ userId: "u1", role: "superuser" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid role");
    }
  });

  it("rejects a missing user id", () => {
    const result = setUserRoleSchema.safeParse({ userId: "", role: "user" });
    expect(result.success).toBe(false);
  });
});

describe("banUserSchema", () => {
  it("accepts just a user id (permanent ban, no reason)", () => {
    expect(banUserSchema.parse({ userId: "u1" })).toEqual({ userId: "u1" });
  });

  it("accepts an optional reason and expiry", () => {
    expect(banUserSchema.parse({ userId: "u1", banReason: "spam", banExpiresIn: 3600 })).toEqual({
      userId: "u1",
      banReason: "spam",
      banExpiresIn: 3600,
    });
  });

  it("rejects a missing user id", () => {
    const result = banUserSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("User id is required");
    }
  });

  it("rejects a non-positive expiry", () => {
    expect(banUserSchema.safeParse({ userId: "u1", banExpiresIn: 0 }).success).toBe(false);
    expect(banUserSchema.safeParse({ userId: "u1", banExpiresIn: -5 }).success).toBe(false);
  });

  it("rejects an over-long reason", () => {
    const result = banUserSchema.safeParse({ userId: "u1", banReason: "x".repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe("unbanUserSchema", () => {
  it("accepts a user id", () => {
    expect(unbanUserSchema.parse({ userId: "u1" })).toEqual({ userId: "u1" });
  });

  it("rejects a missing user id", () => {
    expect(unbanUserSchema.safeParse({ userId: "" }).success).toBe(false);
  });
});

describe("createPostSchema", () => {
  it("accepts a valid post and trims whitespace", () => {
    expect(createPostSchema.parse({ title: "  Hello  ", content: "  Body  " })).toEqual({
      title: "Hello",
      content: "Body",
    });
  });

  it("rejects an empty title with the expected message", () => {
    const result = createPostSchema.safeParse({ title: "", content: "Body" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Title is required");
    }
  });

  it("rejects an empty content with the expected message", () => {
    const result = createPostSchema.safeParse({ title: "Hello", content: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Content is required");
    }
  });
});

describe("changeEmailSchema", () => {
  it("accepts a valid email", () => {
    expect(changeEmailSchema.parse({ newEmail: "ada@example.com" })).toEqual({
      newEmail: "ada@example.com",
    });
  });

  it("rejects an invalid email with the expected message", () => {
    const result = changeEmailSchema.safeParse({ newEmail: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter a valid email address");
    }
  });
});

describe("deleteAccountSchema", () => {
  it("accepts a non-empty password", () => {
    expect(deleteAccountSchema.parse({ password: "hunter22" })).toEqual({ password: "hunter22" });
  });

  it("rejects an empty password with the expected message", () => {
    const result = deleteAccountSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Password is required");
    }
  });
});

describe("magicLinkRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(magicLinkRequestSchema.parse({ email: "ada@example.com" })).toEqual({
      email: "ada@example.com",
    });
  });

  it("rejects an invalid email with the expected message", () => {
    const result = magicLinkRequestSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter a valid email address");
    }
  });
});

describe("changePasswordSchema", () => {
  it("accepts a non-empty current password and an 8+ char new password", () => {
    expect(
      changePasswordSchema.parse({ currentPassword: "old", newPassword: "supersecret" }),
    ).toEqual({ currentPassword: "old", newPassword: "supersecret" });
  });

  it("rejects an empty current password with the expected message", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "supersecret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Current password is required");
    }
  });

  it("rejects a too-short new password with the expected message", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Password must be at least 8 characters");
    }
  });
});

describe("createOrganizationSchema", () => {
  it("accepts a valid name + slug and trims whitespace", () => {
    expect(createOrganizationSchema.parse({ name: "  Acme Inc  ", slug: "  acme-inc  " })).toEqual({
      name: "Acme Inc",
      slug: "acme-inc",
    });
  });

  it("rejects an empty name with the expected message", () => {
    const result = createOrganizationSchema.safeParse({ name: "", slug: "acme-inc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name is required");
    }
  });

  it("rejects an empty slug with the expected message", () => {
    const result = createOrganizationSchema.safeParse({ name: "Acme", slug: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Slug is required");
    }
  });

  it("rejects a name over 100 characters", () => {
    const result = createOrganizationSchema.safeParse({ name: "a".repeat(101), slug: "acme" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name must be 100 characters or fewer");
    }
  });

  it.each([
    ["uppercase letters", "Acme-Inc"],
    ["a leading hyphen", "-acme"],
    ["a trailing hyphen", "acme-"],
    ["a double hyphen", "acme--inc"],
    ["spaces", "acme inc"],
    ["disallowed punctuation", "acme_inc"],
  ])("rejects a slug with %s", (_label, slug) => {
    const result = createOrganizationSchema.safeParse({ name: "Acme", slug });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Use lowercase letters, digits and single hyphens (e.g. acme-inc)",
      );
    }
  });

  it("accepts a slug of hyphen-separated lowercase alphanumerics", () => {
    expect(createOrganizationSchema.parse({ name: "Acme 2", slug: "acme-2-inc" })).toEqual({
      name: "Acme 2",
      slug: "acme-2-inc",
    });
  });
});

describe("inviteMemberSchema", () => {
  it("accepts an invite for the member role", () => {
    expect(inviteMemberSchema.parse({ email: "teammate@example.com", role: "member" })).toEqual({
      email: "teammate@example.com",
      role: "member",
    });
  });

  it("accepts an invite for the admin role", () => {
    expect(inviteMemberSchema.parse({ email: "teammate@example.com", role: "admin" })).toEqual({
      email: "teammate@example.com",
      role: "admin",
    });
  });

  it("rejects an invalid email with the expected message", () => {
    const result = inviteMemberSchema.safeParse({ email: "not-an-email", role: "member" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter a valid email address");
    }
  });

  it.each([["owner"], ["superuser"], [""]])("rejects the non-invitable role %j", (role) => {
    const result = inviteMemberSchema.safeParse({ email: "teammate@example.com", role });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid role");
    }
  });
});

describe("twoFactorPasswordSchema", () => {
  it("accepts a non-empty password", () => {
    expect(twoFactorPasswordSchema.parse({ password: "hunter22" })).toEqual({
      password: "hunter22",
    });
  });

  it("rejects an empty password with the expected message", () => {
    const result = twoFactorPasswordSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Password is required");
    }
  });
});

describe("twoFactorCodeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(twoFactorCodeSchema.parse({ code: "123456" })).toEqual({ code: "123456" });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(twoFactorCodeSchema.parse({ code: "  123456  " })).toEqual({ code: "123456" });
  });

  it.each([
    ["too short", "12345"],
    ["too long", "1234567"],
    ["non-digits", "12ab56"],
    ["empty", ""],
  ])("rejects a code that is %s", (_label, code) => {
    const result = twoFactorCodeSchema.safeParse({ code });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Enter the 6-digit code from your authenticator app",
      );
    }
  });
});

describe("twoFactorBackupCodeSchema", () => {
  it("accepts a non-empty backup code and trims whitespace", () => {
    expect(twoFactorBackupCodeSchema.parse({ code: "  abcde-fghij  " })).toEqual({
      code: "abcde-fghij",
    });
  });

  it("rejects an empty code with the expected message", () => {
    const result = twoFactorBackupCodeSchema.safeParse({ code: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter one of your backup codes");
    }
  });
});

describe("notificationPayloadSchema (A22)", () => {
  const valid = {
    id: "n1",
    userId: "u1",
    type: "test",
    body: "hi",
    read: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a well-formed realtime notification payload", () => {
    expect(notificationPayloadSchema.parse(valid)).toEqual(valid);
  });

  it("accepts the 'system' type", () => {
    expect(notificationPayloadSchema.parse({ ...valid, type: "system" }).type).toBe("system");
  });

  it("rejects an unknown type", () => {
    expect(notificationPayloadSchema.safeParse({ ...valid, type: "spam" }).success).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    expect(notificationPayloadSchema.safeParse({ id: "n1" }).success).toBe(false);
  });
});

describe("zodFieldErrors (A7)", () => {
  it("maps EVERY failing field to its message (not just the first issue)", () => {
    const result = createPostSchema.safeParse({ title: "", content: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFieldErrors(result.error)).toEqual({
        title: "Title is required",
        content: "Content is required",
      });
    }
  });

  it("keeps the FIRST message when a field has more than one issue", () => {
    const schema = z.object({ a: z.string() }).superRefine((_, ctx) => {
      ctx.addIssue({ code: "custom", path: ["a"], message: "first" });
      ctx.addIssue({ code: "custom", path: ["a"], message: "second" });
    });
    const result = schema.safeParse({ a: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFieldErrors(result.error)).toEqual({ a: "first" });
    }
  });

  it("drops form-level (empty-path) issues — those belong in the `error` string", () => {
    const schema = z.object({ a: z.string() }).refine(() => false, { message: "form-level" });
    const result = schema.safeParse({ a: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFieldErrors(result.error)).toEqual({});
    }
  });
});
