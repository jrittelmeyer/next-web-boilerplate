# Security Policy

> This is the **vulnerability-disclosure policy** for the project. For the
> application's security controls (HTTP security headers, Content-Security-Policy,
> allowlisting a SaaS origin), see the engineering reference in
> [`docs/context/SECURITY.md`](../docs/context/SECURITY.md).

## Supported versions

This is a boilerplate/starter template rather than a versioned library. Security
fixes land on the `main` branch; please base any deployment on the latest `main`.

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ |
| older commits / forks | ❌ — rebase onto `main` |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, use one of these private channels:

1. **GitHub Security Advisories** (preferred) — open a private report via the
   repository's **Security → Report a vulnerability** tab
   ([Privately reporting a security vulnerability][gh-advisory]).
2. **Email** — [john.rittelmeyer.dev@gmail.com](mailto:john.rittelmeyer.dev@gmail.com).

Please include, as far as you can:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept, affected files/routes, configuration).
- Any suggested remediation.

## What to expect

- **Acknowledgement** within a few days.
- An assessment and, where valid, a fix on `main` as quickly as is practical.
- Credit for the report if you'd like it (let us know your preference).

Because this is a template, the most valuable reports are issues in the
**shipped defaults** — auth flows, the CSP/headers, rate limiting, the example
Server Actions/tRPC procedures, or the Docker/deploy configuration — that would
carry over into a downstream app. Misconfigurations introduced after cloning are
the deployer's responsibility, but we're happy to harden the defaults that lead
people there.

[gh-advisory]: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability
