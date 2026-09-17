// Jev preference review — Effect v4 template.
// Copy to e.g. scripts/jev-review.ts in the target project and adapt.
//
// ## Setup (from interview)
//   npm i effect@rc @effect/platform-node@rc   # v4 ships on the `rc` tag (4.0.0-rc.x)
//   npm i -D typescript @types/node            # TS >= 5.9, Node >= 18
// Run: node scripts/jev-review.ts (Node >= 22.18 runs .ts directly).
// tsconfig: { "strict": true, "target": "es2022", "module": "nodenext",
//             "moduleResolution": "nodenext" }. package.json needs "type": "module".
//
// ## Auth
// Direct TypeSafe API only: export TYPESAFE_API_KEY=ts_... (from
// https://console.typesafe.ai). Optional: TYPESAFE_BASE_URL (default
// https://api.typesafe.ai), TYPESAFE_DEFAULT_MODEL (default jev-latest),
// JEV_TIMEOUT_MS (default 60000).
// Gateway users (AI_GATEWAY_API_KEY): keep the plain-Node template
// (review-script-template.mjs) — the Gateway evaluate call has no raw-HTTP
// equivalent used here.
//
// ## distilled swap-in (https://github.com/alchemy-run/distilled/pull/614)
// That PR adds `@distilled.cloud/typesafe-ai` (unmerged at time of writing,
// so this template posts to POST /v1/systemone directly — the same endpoint).
// Once it lands, replace JevClient.evaluate's fetch body with:
//   const verdict = yield* TypesafeAi.query(
//     { prefId: TypesafeAi.Noul("Does `diff` violate ...?"), ... },
//     { state },
//   )
// and replace JevConfig with that package's CredentialsFromEnv. The question
// builders map 1:1 onto the wire objects built in buildQuestions() below.
// Keep the layer-build credential resolution either way (see JevClient.layer).
//
// ## Usage
//   node scripts/jev-review.ts [--diff <ref> | --diff=<ref>] [--dry-run] \
//     [--gate-threshold 0.7] [--advisory-threshold 0.7] [--timeout-ms 60000] [--json]
//   empty --diff = working tree (staged + unstaged) vs HEAD.
//   PR / base-branch review: --diff origin/main...HEAD
// Exit codes: 0 = approve/advisory (see stdout), 1 = gate violated,
//   2 = infra/config error (no key, bad ref, missing dep). Never treat 2 as approval.
// Max 3 fix re-runs, then escalate to the user (enforced by the caller, not here).
//
// Effect v4 notes (see https://effect.website/docs/v4/api/effect):
// - Services are Context.Service classes with METHOD-style shapes; implementations
//   go through X.of({...}). Layers compose with Layer.mergeAll.
// - Errors are Schema.TaggedError classes, handled with catchTag/catchTags.
// - Either is gone; Effect.result inspects outcomes without throwing.
// - Config resolves from the environment by default; keys stay Redacted.

import { FileSystem, Path } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Config,
  Console,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
} from "effect"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

// ---------------------------------------------------------------------------
// Errors — one per failure reason, each with a message (never a generic Error)
// ---------------------------------------------------------------------------

export class UnsafeRefError extends Schema.TaggedError<UnsafeRefError>()("UnsafeRefError", {
  ref: Schema.String,
  message: Schema.String,
}) {}

export class NoPrefsError extends Schema.TaggedError<NoPrefsError>()("NoPrefsError", {
  message: Schema.String,
}) {}

export class MissingKeyError extends Schema.TaggedError<MissingKeyError>()("MissingKeyError", {
  message: Schema.String,
}) {}

export class InvalidOptionError extends Schema.TaggedError<InvalidOptionError>()("InvalidOptionError", {
  option: Schema.String,
  message: Schema.String,
}) {}

export class GitError extends Schema.TaggedError<GitError>()("GitError", {
  args: Schema.String,
  message: Schema.String,
}) {}

export class JevHttpError extends Schema.TaggedError<JevHttpError>()("JevHttpError", {
  status: Schema.Number,
  body: Schema.String,
  message: Schema.String,
}) {}

export class JevOverloadedError extends Schema.TaggedError<JevOverloadedError>()("JevOverloadedError", {
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Prefs — EDIT ME: extracted from CLAUDE.md / AGENTS.md (snake_case ids)
// ---------------------------------------------------------------------------

const PrefId = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(_[a-z0-9]+)*$/),
).pipe(Schema.brand("@jev/PrefId"))
export type PrefId = typeof PrefId.Type

const Pref = Schema.Struct({
  id: PrefId,
  gate: Schema.Boolean,
  text: Schema.String.check(Schema.isMinLength(1)),
})
export type Pref = typeof Pref.Type

const PREFS: ReadonlyArray<Pref> = [
  // { id: "pref_01", gate: true, text: "No TypeScript `any` outside test fixtures." },
  // { id: "pref_02", gate: true, text: "Early returns; max nesting depth 2." },
  // { id: "pref_03", gate: false, text: "Conventional commit style in messages." },
]

// Two knobs with the same default: gates fail the run, advisories only note.
// Calibrate on 5-10 labeled diffs (see references/prefs-to-questions.md).
const DEFAULT_GATE_THRESHOLD = 0.7
const DEFAULT_ADVISORY_THRESHOLD = 0.7
// Fail threshold on the 0..2 severity rubric; calibrate alongside the above.
const SEVERITY_FAIL = 1.5
const MAX_DIFF_CHARS = 24000

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
  ".zip", ".gz", ".tgz", ".tar", ".7z", ".pdf", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".wav", ".exe",
  ".dll", ".so", ".dylib", ".bin", ".dat", ".lock",
])

const SAFE_REF = /^[A-Za-z0-9_.\-/~:^{}]+$/

// ---------------------------------------------------------------------------
// Git — all subprocess I/O anchored at the repo root, argv-style (no shell)
// ---------------------------------------------------------------------------

export interface GitState {
  readonly diff: string
  readonly truncated: boolean
  readonly status: string
  readonly untracked: string
  readonly stat: string
  readonly branch: string
}

export class Git extends Context.Service<Git, {
  state(ref: Option.Option<string>): Effect.Effect<GitState, GitError | UnsafeRefError>
}>()(
  "jev-review/Git",
) {
  static readonly layer = Layer.effect(
    Git,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      // execFile (argv-style, no shell) wrapped in Effect. Deliberately not
      // ChildProcessSpawner.string: in testing it took ~60s to complete
      // stream output on Windows (vs ~100ms raw). Revisit if that is fixed.
      const run = Effect.fn("Git.run")(function*(args: ReadonlyArray<string>, cwd: string) {
        return yield* Effect.tryPromise({
          try: () =>
            execFile("git", [...args], {
              cwd,
              encoding: "utf8",
              maxBuffer: 10 * 1024 * 1024,
              timeout: 30000,
            }).then(
              ({ stdout }) => stdout,
              (cause: unknown) => {
                throw new GitError({
                  args: args.join(" "),
                  message: `git ${args.join(" ")} failed: ${(cause as { stderr?: unknown }).stderr ?? String(cause)}`,
                })
              },
            ),
          catch: (cause) =>
            cause instanceof GitError
              ? cause
              : new GitError({ args: args.join(" "), message: `git failed: ${String(cause)}` }),
        })
      })

      const top = Effect.fn("Git.top")(function*() {
        return yield* run(["rev-parse", "--show-toplevel"], ".").pipe(
          Effect.map((out) => out.trim()),
          Effect.orElseSucceed(() => "."),
        )
      })

      // Contents of new (untracked) files, capped to the remaining budget.
      // Without this, a brand-new file violating every pref reviews as clean.
      // Binaries are skipped, never decoded.
      const untrackedContent = Effect.fn("Git.untrackedContent")(function*(
        root: string,
        list: string,
        budget: number,
      ) {
        const out: Array<string> = []
        let used = 0
        for (const f of list.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
          if (BINARY_EXT.has(path.extname(f).toLowerCase())) {
            out.push(`--- new file: ${f} (binary, skipped) ---`)
            continue
          }
          const abs = path.join(root, f)
          const info = yield* fs.stat(abs).pipe(Effect.orElseSucceed(() => undefined))
          if (info === undefined || Number(info.size) > 20000) {
            out.push(`--- new file: ${f} (unreadable or too large, skipped) ---`)
            continue
          }
          const content = yield* fs.readFileString(abs).pipe(Effect.orElseSucceed(() => undefined))
          if (content === undefined || content.includes("\0")) {
            out.push(`--- new file: ${f} (binary, skipped) ---`)
            continue
          }
          if (used + content.length > budget) {
            out.push(`--- new file: ${f} (budget exceeded, skipped) ---`)
            continue
          }
          used += content.length
          out.push(`--- new file: ${f} ---\n${content}`)
        }
        return out.join("\n")
      })

      const state = Effect.fn("Git.state")(function*(ref: Option.Option<string>) {
        if (Option.isSome(ref) && !SAFE_REF.test(ref.value)) {
          return yield* new UnsafeRefError({
            ref: ref.value,
            message: `unsafe --diff ref ${JSON.stringify(ref.value)}`,
          })
        }
        const root = yield* top()
        // `git rev-parse --verify HEAD` fails on repos with no commits yet;
        // Effect.result keeps that on the value channel instead of throwing.
        const head = yield* Effect.result(run(["rev-parse", "--verify", "HEAD"], root))
        const hasHead = head._tag === "Success"
        const scope = (extra: ReadonlyArray<string>): Array<string> =>
          [...extra, "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"]
        let rawDiff: string
        if (Option.isSome(ref)) {
          rawDiff = yield* run(["diff", ref.value, ...scope([])], root)
        } else if (hasHead) {
          rawDiff = yield* run(["diff", "HEAD", ...scope([])], root)
        } else {
          const unstaged = yield* run(["diff", ...scope([])], root)
          const staged = yield* run(["diff", "--cached", ...scope([])], root)
          rawDiff = unstaged + staged
        }
        const status = yield* run(["status", "--porcelain"], root)
        const untracked = (yield* run(["ls-files", "--others", "--exclude-standard"], root)).trim()
        const stat = Option.isSome(ref)
          ? yield* run(["diff", "--stat", ref.value], root)
          : hasHead
          ? yield* run(["diff", "--stat", "HEAD"], root)
          : yield* run(["status", "--short"], root)
        const branch = yield* run(["rev-parse", "--abbrev-ref", "HEAD"], root).pipe(
          Effect.map((b) => b.trim()),
          Effect.orElseSucceed(() => "(unknown)"),
        )
        let diff = rawDiff.slice(0, MAX_DIFF_CHARS)
        let truncated = rawDiff.length > MAX_DIFF_CHARS
        if (untracked !== "") {
          const extra = yield* untrackedContent(root, untracked, MAX_DIFF_CHARS - diff.length)
          if (extra !== "") {
            const combined = diff !== "" ? diff + "\n" + extra : extra
            diff = combined.slice(0, MAX_DIFF_CHARS)
            truncated = truncated || combined.length > MAX_DIFF_CHARS
          }
        }
        const result: GitState = {
          diff,
          truncated,
          status: status.trim(),
          untracked,
          stat: stat.trim(),
          branch,
        }
        return result
      })

      return Git.of({ state })
    }),
  )
}

// ---------------------------------------------------------------------------
// JevClient — direct TypeSafe HTTP; credentials resolve when the layer builds
// ---------------------------------------------------------------------------

export interface JevAnswers {
  readonly [questionId: string]: {
    readonly probability?: number | undefined
    readonly score?: number | undefined
    readonly choice?: string | undefined
  } | undefined
}

export class JevClient extends Context.Service<JevClient, {
  evaluate(
    state: unknown,
    questions: Record<string, unknown>,
    opts?: { readonly timeoutMs?: number | undefined },
  ): Effect.Effect<JevAnswers, MissingKeyError | JevHttpError | JevOverloadedError>
}>()(
  "jev-review/JevClient",
) {
  // Resolve credentials at layer-build time, not per request: deploy
  // frameworks that bind env by watching Config reads during construction
  // never see a lazily-resolved key (distilled#614 lesson).
  static readonly layer = Layer.unwrap(
    Effect.gen(function*() {
      const apiKey = yield* Config.Redacted("TYPESAFE_API_KEY").pipe(Config.option)
      const baseUrl = yield* Config.String("TYPESAFE_BASE_URL").pipe(
        Config.withDefault("https://api.typesafe.ai"),
      )
      const model = yield* Config.String("TYPESAFE_DEFAULT_MODEL").pipe(
        Config.withDefault("jev-latest"),
      )
      const timeoutMs = yield* Config.Int("JEV_TIMEOUT_MS").pipe(
        Config.withDefault(60000),
      )
      return Layer.effect(
        JevClient,
        Effect.gen(function*() {
          const evaluate = Effect.fn("JevClient.evaluate")(function*(
            state: unknown,
            questions: Record<string, unknown>,
            opts?: { readonly timeoutMs?: number | undefined },
          ) {
            const key = yield* Option.match(apiKey, {
              onNone: () =>
                Effect.fail(
                  new MissingKeyError({ message: "set TYPESAFE_API_KEY (see https://console.typesafe.ai)" }),
                ),
              // Redacted unwraps only here; the key is never logged.
              onSome: (redacted) => Effect.succeed(Redacted.value(redacted)),
            })
            const budget = opts?.timeoutMs ?? timeoutMs
            const request: Effect.Effect<Response, JevHttpError | JevOverloadedError> = Effect.gen(
              function*() {
                const res = yield* Effect.tryPromise({
                  // AbortSignal bounds the socket; no separate Effect.timeout
                  // needed (its TimeoutException would need its own handler).
                  try: () =>
                    fetch(`${baseUrl}/v1/systemone`, {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${key}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ model, state, questions }),
                      signal: AbortSignal.timeout(budget),
                    }),
                  catch: (cause) =>
                    new JevHttpError({
                      status: 0,
                      body: String(cause),
                      message: `jev request failed: ${String(cause)}`,
                    }),
                })
                if (res.status === 429 || res.status === 529) {
                  return yield* new JevOverloadedError({
                    message: `jev overloaded (HTTP ${res.status}); backing off`,
                  })
                }
                if (!res.ok) {
                  const body = yield* Effect.tryPromise({
                    try: () => res.text(),
                    catch: () =>
                      new JevHttpError({
                        status: res.status,
                        body: "(unreadable)",
                        message: "jev error body unreadable",
                      }),
                  }).pipe(
                    Effect.orElseSucceed(() => "(unreadable body)"),
                  )
                  return yield* new JevHttpError({
                    status: res.status,
                    body,
                    message: `jev rejected the request (HTTP ${res.status})`,
                  })
                }
                return res
              },
            )
            const res = yield* request.pipe(
              Effect.retry({
                while: (e) => e._tag === "JevOverloadedError",
                times: 5,
                schedule: Schedule.exponential("500 millis"),
              }),
            )
            // Answers are read defensively: unknown wire values that are not
            // numbers/strings are ignored rather than trusted.
            const json = (yield* Effect.tryPromise({
              try: () => res.json() as Promise<unknown>,
              catch: (cause) =>
                new JevHttpError({
                  status: res.status,
                  body: String(cause),
                  message: `jev returned invalid JSON: ${String(cause)}`,
                }),
            })) as {
              readonly answers?: Record<
                string,
                | { readonly probability?: unknown; readonly score?: unknown; readonly choice?: unknown }
                | null
              >
            }
            const raw = json.answers ?? {}
            const answers: { [questionId: string]: NonNullable<JevAnswers[string]> } = {}
            for (const [id, value] of Object.entries(raw)) {
              if (typeof value !== "object" || value === null) continue
              answers[id] = {
                probability: typeof value.probability === "number" ? value.probability : undefined,
                score: typeof value.score === "number" ? value.score : undefined,
                choice: typeof value.choice === "string" ? value.choice : undefined,
              }
            }
            return answers
          })
          return JevClient.of({ evaluate })
        }),
      )
    }),
  )
}

// ---------------------------------------------------------------------------
// Questions — one narrow judgment per pref, thresholds live in code
// ---------------------------------------------------------------------------

const buildQuestions = (prefs: ReadonlyArray<Pref>): Record<string, unknown> => {
  const questions: Record<string, unknown> = {}
  for (const p of prefs) {
    // Direct API calls this "noul"; the Gateway/AI SDK calls it "boolean".
    questions[p.id] = {
      type: "noul",
      instructions:
        `Does \`diff\` violate ${p.id} (${p.text})? Answer true only for a concrete violation in the changed lines.`,
    }
  }
  questions["severity"] = {
    type: "score",
    instructions: "How far does `diff` drift from `prefs`?",
    criteria: ["No drift", "Minor drift; note only", "Blocks merge"],
  }
  questions["next"] = {
    type: "choice",
    instructions: "Which single review outcome applies to `diff` given `prefs`?",
    criteria: {
      approve: "Meets all prefs.",
      advisory: "Minor notes only; safe to continue.",
      fix_now: "A gate pref is violated; must fix before continuing.",
      other: "None of the above.",
    },
  }
  return questions
}

// ---------------------------------------------------------------------------
// Verdict — code precedence wins: gates first, Jev's `next` never overrides
// ---------------------------------------------------------------------------

export interface Verdict {
  readonly outcome: "approve" | "advisory" | "fix_now"
  readonly severity: number
  readonly next: string
  readonly failures: ReadonlyArray<string>
  readonly notes: ReadonlyArray<string>
}

const judge = (
  prefs: ReadonlyArray<Pref>,
  answers: JevAnswers,
  gateThreshold: number,
  advisoryThreshold: number,
): Verdict => {
  const failures: Array<string> = []
  const notes: Array<string> = []
  for (const p of prefs) {
    const prob = answers[p.id]?.probability ?? 0
    if (prob >= (p.gate ? gateThreshold : advisoryThreshold)) {
      ;(p.gate ? failures : notes).push(`${p.id} P=${prob.toFixed(2)} ${p.text}`)
    }
  }
  const severity = answers["severity"]?.score ?? 0
  const next = answers["next"]?.choice ?? "other"
  if (failures.length > 0 || next === "fix_now" || severity >= SEVERITY_FAIL) {
    return { outcome: "fix_now", severity, next, failures, notes }
  }
  if (notes.length > 0 || next === "advisory") {
    return { outcome: "advisory", severity, next, failures, notes }
  }
  return { outcome: "approve", severity, next, failures, notes }
}

const renderVerdict = (verdict: Verdict): string => {
  const head = `${verdict.outcome} (severity=${verdict.severity.toFixed(2)}, next=${verdict.next})`
  const lines = [...verdict.failures, ...verdict.notes]
  if (verdict.outcome === "approve") return head
  if (lines.length === 0) return `${head}:\n- minor notes`
  return `${head}:\n- ${lines.join("\n- ")}`
}

// CLI handlers return void, so exit codes are recorded here instead of
// returned. Requires @types/node for the process global.
const exitWith = (code: number, message: string) =>
  Effect.gen(function*() {
    yield* Console.error(message)
    yield* Effect.sync(() => {
      process.exitCode = code
    })
  })

// ---------------------------------------------------------------------------
// CLI — flags, --help, and version come from effect/unstable/cli
// ---------------------------------------------------------------------------

const review = Command.make(
  "jev-review",
  {
    diff: Flag.String("diff").pipe(
      Flag.optional,
      Flag.withDescription("Git ref or A...B range to review (default: working tree)"),
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withAlias("n"),
      Flag.withDefault(false),
      Flag.withDescription("Print state + questions without calling Jev"),
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Machine-readable verdict on stdout"),
    ),
    gateThreshold: Flag.Finite("gate-threshold").pipe(
      Flag.withDefault(DEFAULT_GATE_THRESHOLD),
      Flag.withDescription("P(violation) at or above which a gate pref fails"),
    ),
    advisoryThreshold: Flag.Finite("advisory-threshold").pipe(
      Flag.withDefault(DEFAULT_ADVISORY_THRESHOLD),
      Flag.withDescription("P(violation) at or above which an advisory pref notes"),
    ),
    timeoutMs: Flag.Int("timeout-ms").pipe(
      Flag.withDefault(60000),
      Flag.withDescription("Live Jev call budget in milliseconds"),
    ),
  },
  (opts) =>
    Effect.gen(function*() {
      const git = yield* Git
      const jev = yield* JevClient

      if (opts.gateThreshold < 0 || opts.gateThreshold > 1) {
        return yield* new InvalidOptionError({
          option: "--gate-threshold",
          message: `--gate-threshold must be within [0, 1], got ${opts.gateThreshold}`,
        })
      }
      if (opts.advisoryThreshold < 0 || opts.advisoryThreshold > 1) {
        return yield* new InvalidOptionError({
          option: "--advisory-threshold",
          message: `--advisory-threshold must be within [0, 1], got ${opts.advisoryThreshold}`,
        })
      }

      // decodeUnknownSync throws on invalid PREFS; suspend captures it on
      // the failure channel (there is no Effect.try in v4).
      const prefs = yield* Effect.suspend(() => {
        try {
          return Effect.succeed(Schema.decodeUnknownSync(Schema.Array(Pref))(PREFS))
        } catch (cause) {
          return Effect.fail(new NoPrefsError({ message: `PREFS misconfigured: ${String(cause)}` }))
        }
      })
      if (prefs.length === 0) {
        return yield* new NoPrefsError({ message: "no PREFS configured. Edit the PREFS array first." })
      }

      const gs = yield* git.state(opts.diff)
      if (gs.diff.trim() === "" && gs.untracked === "") {
        yield* Console.log("approve: no changes detected.")
        return
      }

      const state = {
        prefs: prefs.map((p) => `${p.id} [${p.gate ? "gate" : "advisory"}]: ${p.text}`),
        diff: gs.diff,
        untracked_files: gs.untracked === "" ? "(none)" : gs.untracked,
        git_status: gs.status === "" ? "(clean)" : gs.status,
        diff_stat: gs.stat === "" ? "(empty)" : gs.stat,
        context: `branch ${gs.branch}, scope ${Option.getOrElse(opts.diff, () => "working-tree")}`,
        note: gs.truncated
          ? `diff truncated to ${MAX_DIFF_CHARS} chars; review covers the leading portion only.`
          : "full diff included.",
      }
      const questions = buildQuestions(prefs)

      if (opts.dryRun) {
        const preview = {
          mode: "dry-run",
          state: {
            ...state,
            diff: state.diff.slice(0, 2000) + (state.diff.length > 2000 ? "…(truncated preview)" : ""),
          },
          questions,
        }
        yield* Console.log(JSON.stringify(preview, null, 2))
        return
      }

      const answers = yield* jev.evaluate(state, questions, { timeoutMs: opts.timeoutMs })
      const verdict = judge(prefs, answers, opts.gateThreshold, opts.advisoryThreshold)
      yield* Console.log(opts.json ? JSON.stringify(verdict) : renderVerdict(verdict))
      // CLI handlers return void: record the 0/1 contract here.
      // (Typed failures above already mapped to exit 2 via catchTags.)
      yield* Effect.sync(() => {
        process.exitCode = verdict.outcome === "fix_now" ? 1 : 0
      })
    }).pipe(
      // CLI handlers return void, so the 0/1/2 contract is recorded via
      // process.exitCode: 0 approve/advisory (set below), 1 fix_now (set
      // below), 2 every typed failure (set here). Never treat 2 as approval.
      Effect.catchTags({
        UnsafeRefError: (e) => exitWith(2, `review-error: ${e.message}`),
        NoPrefsError: (e) => exitWith(2, `review-error: ${e.message}`),
        MissingKeyError: (e) => exitWith(2, `review-error: ${e.message}`),
        InvalidOptionError: (e) => exitWith(2, `review-error: ${e.message}`),
        GitError: (e) => exitWith(2, `review-error: ${e.message}`),
        JevHttpError: (e) => exitWith(2, `review-error: ${e.message}`),
        JevOverloadedError: (e) => exitWith(2, `review-error: ${e.message}`),
      }),
    ),
).pipe(
  Command.withDescription("Review working changes against CLAUDE.md/AGENTS.md prefs via Jev"),
)

const MainLive = Layer.mergeAll(
  // provideMerge (not mergeAll): Git's spawner/fs/path requirements resolve
  // against NodeServices while keeping both services available downstream.
  Layer.provideMerge(Git.layer, NodeServices.layer),
  JevClient.layer,
  NodeServices.layer,
)

const program = Command.run(review, { version: "0.1.0" }).pipe(
  Effect.provide(MainLive),
)

NodeRuntime.runMain(program)
