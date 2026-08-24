# live-verify — library mechanics

A library's "production shape" is **being consumed**: pack it and install the
artifact into a scratch consumer project, then drive the public API from there —
building in-repo proves compilation, not consumability.

- **Pack + install:** build the distributable (`verify.build`), install it into
  a throwaway consumer (`verify.run` — e.g. a temp project importing the
  packed artifact, not a path/workspace link), and import it the way a user
  would. Path links mask packaging failures: missing files in the manifest,
  wrong entry points, undeclared dependencies.
- **Drive the public surface:** call the APIs the change touches from the
  consumer side — including the documented examples (README snippets rot
  first; run them verbatim).
- **Type/API surface diff:** where the ecosystem has one, diff the exported
  surface (types, public symbols) against the previous release — an accidental
  export removal is a breaking change no unit test catches.
- **Side-effect-free import:** importing/initializing the library must not
  perform I/O, mutate globals, or require env unless documented — verify with
  a bare import in the scratch consumer.
- **Peer/host versions:** exercise against the oldest supported host/runtime
  the project claims, or state which claims remain unverified.
