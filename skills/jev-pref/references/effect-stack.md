# Effect v4 stack notes (verified against effect@4.0.0-rc.115)

The Effect template (`assets/review-script-effect.ts`) typechecks clean and
was runtime-tested (help, dry-run, unsafe ref, thresholds, subdir, binary
skip, clean tree, missing key). These are the non-obvious facts it depends on.

## Services

- Class style with METHOD shapes:
  ```ts
  export class Git extends Context.Service<Git, {
    state(ref: Option.Option<string>): Effect.Effect<State, GitError>
  }>()(
    "jev-review/Git",
  ) {
  ```
  The multi-line `>()(\n "id",\n)` form is load-bearing: the single-line
  `>("id") {` form fails with TS2507 under TS 7 (tsgo). Property-style shapes
  (`readonly state: (...) => Effect`) fail the same way — always use methods.
- Implement with `X.of({...})`; wire deps with `Layer.effect`; compose roots
  with `Layer.mergeAll`. Internal wiring needs `Layer.provideMerge`, not
  `mergeAll` (mergeAll unions requirements, it does not resolve them between
  members).
- `yield* ChildProcessSpawner.ChildProcessSpawner` (the namespace, not the
  bare import). Same for `FileSystem.FileSystem`, `Path.Path`.

## CLI (`effect/unstable/cli`)

- `Command.make("name", { flag: Flag... }, handler)`, `Command.run(cmd,
  { version })` reads argv from Stdio and renders `--help`/`--version`,
  shell completions, and `--wizard` for free.
- Boolean flags are REQUIRED unless defaulted: always
  `Flag.Boolean("x").pipe(Flag.withDefault(false))`.
- Handlers must return `Effect<void, ...>` — record exit codes via
  `process.exitCode` (needs `@types/node`) instead of returning them.

## Schema / Config / misc

- Filters: `Schema.String.check(Schema.isPattern(/.../))`,
  `.check(Schema.isMinLength(1))`; brand with `.pipe(Schema.brand("@x"))`.
  (`Schema.pattern` / `Schema.minLength` do not exist.)
- Decode throwing parsers via `Effect.suspend` + try/catch
  (`Schema.decodeUnknownSync(schema)(input)`); there is no `Effect.try`.
- `Config.String` / `Config.Int` (capitalized), `Config.Redacted`,
  `Config.option`, `Config.withDefault`. Env resolves by default — no provider
  layer needed. Read credentials at layer-build time (`Layer.unwrap`), never
  per request, and keep them `Redacted` (distilled#614 lesson).
- Retry: `Effect.retry({ while, times, schedule })` — no `Schedule.intersect`
  in v4; pass `times` alongside the schedule instead.
- `Effect.catch` exists (use it, not catchAll); `Effect.result` replaces Either.
- Output: `Console.log`/`Console.error` write raw stdout (pipeable);
  `Effect.log` prepends timestamps — wrong for `--dry-run`/`--json` payloads.

## Deliberate non-idioms

- Git runs via promisified `node:child_process` `execFile` (argv array, no
  shell), not `ChildProcessSpawner.string`: the spawner took ~60s to complete
  stream output on Windows in testing (vs ~100ms raw). Revisit if fixed.
- Jev posts raw `fetch` to `POST /v1/systemone` rather than
  `effect/unstable/http` or `effect/unstable/ai`: fewer moving parts, and the
  distilled `@distilled.cloud/typesafe-ai` package is unmerged (see the
  swap-in note in the template header).
