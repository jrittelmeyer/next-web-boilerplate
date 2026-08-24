# live-verify — CLI mechanics

The production-shaped run is the **release/packaged binary** (`verify.build` →
`verify.run`), not the interpreter pointed at source — packaging, bundled
assets, and stripped debug paths all diverge.

- **Exit codes are the contract:** drive the success path AND the failure paths
  and assert the documented codes; errors go to stderr, output to stdout — pipe
  them separately to prove it.
- **Golden output:** compare real output against the golden files for the
  affected commands; update goldens deliberately, never to make a diff pass.
- **TTY vs piped:** formatting, color, prompts, and width detection differ —
  drive both a terminal-shaped and a piped/redirected invocation when output
  formatting changed.
- **The argument matrix:** exercise the flags the change touches together with
  their neighbors (conflicting flags, defaults, `--help`/`--version` still
  correct).
- **Stdin and environment:** if the tool reads stdin, env vars, or config
  files, drive those inputs explicitly — including the empty/absent cases.
- **Cross-platform paths:** path handling, line endings, and locale/encoding
  are where CLIs break across OSes — verify on the platform the change is
  riskiest for, or say which platform remains unverified.
