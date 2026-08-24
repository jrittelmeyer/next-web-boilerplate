# live-verify — game mechanics

The production-shaped run is an **exported/packaged build or a headless engine
run** (`verify.run`), not the editor's play mode — editor runs mask packaging,
import, and platform failures the same way dev servers mask prod.

- **Headless drives:** run the smoke/test scene headlessly and assert on log
  output (`verify.ready.pattern`) and exit code; script inputs where the engine
  supports it (input replay, test scenes that self-drive the core loop).
- **Determinism first:** fix the RNG seed and timestep for verification runs —
  a flaky assert on an unseeded run proves nothing.
- **Visual changes need eyes:** logs can't verify a shader, layout, or
  animation change — capture a screenshot/frame from the built artifact and
  compare against the golden image (or view it and say what was observed).
- **Save/load roundtrip:** any change touching persistent state gets a
  save → quit → load drive — serialization breaks silently otherwise.
- **Performance smoke:** changes on the hot path (spawning, physics, per-frame
  allocation) get a frame-time/entity-count observation, not an assumption.
- **Editor-control servers:** if the project wires an engine control server for
  agents (scene inspection/manipulation via MCP or a plugin), drive the changed
  scene through it; otherwise the headless CLI is the verification surface.
- **Platform exports differ:** an export that boots on the dev platform can
  still fail elsewhere (case-sensitive paths, missing runtime libs) — verify
  the export target the change affects.
