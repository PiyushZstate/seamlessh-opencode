import { execFile } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Snapshot, type Verb } from "@opencode/app/lab-contract"

// An app opened from the Dock inherits launchd's short PATH, without where cargo and Homebrew put the CLI.
const env = () => ({
  ...process.env,
  PATH: [
    process.env.PATH,
    path.join(homedir(), ".cargo", "bin"),
    path.join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]
    .filter(Boolean)
    .join(path.delimiter),
})

const git = (directory: string) =>
  new Promise<string | undefined>((resolve) => {
    execFile("git", ["-C", directory, "rev-parse", "--show-toplevel"], { env: env(), windowsHide: true }, (error, stdout) =>
      resolve(error ? undefined : stdout.trim() || undefined),
    )
  })

/**
 * The project a directory belongs to, as the CLI names it: the project of a thread's worktree
 * (`~/.seamlessh/worktrees/<project>/<thread>`), else the folder name of its git repository. The CLI also falls back to
 * the only project with research, which suits a terminal but would turn every session in the app into a Lab, so a
 * directory outside a repository has no project here.
 */
const project = (directory: string) =>
  Effect.promise(async () => {
    const parts = directory.split(path.sep)
    const at = parts.findIndex((part, index) => part === ".seamlessh" && parts[index + 1] === "worktrees")

    if (at >= 0 && parts[at + 2] && parts[at + 3]) return parts[at + 2]
    const top = await git(directory)

    return top ? path.basename(top) : undefined
  })

/** Runs `seamlessh exp …` in the directory. */
const exp = (directory: string, args: readonly string[]) =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "seamlessh",
          ["exp", ...args],
          { cwd: directory, env: env(), signal, windowsHide: true },
          (error, stdout, stderr) => (error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)),
        )
      }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.tapError((error) => Effect.logWarning("seamlessh exp failed", { args, error: error.message })))

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(Snapshot))

/** `exp` on the directory's project; fails when the directory has none. */
const inProject = (directory: string, args: readonly string[]) =>
  project(directory).pipe(
    Effect.flatMap((repo) =>
      repo ? exp(directory, [...args, "--repo", repo]) : Effect.fail(new Error(`${directory} is not in a project`)),
    ),
  )

export const snapshot = (directory: string) =>
  project(directory).pipe(
    Effect.flatMap((repo) =>
      repo
        ? Effect.all([exp(directory, ["study", "--json", "--repo", repo]), exp(directory, ["ls", "--json", "--repo", repo])], {
            concurrency: 2,
          })
        : // Outside a repository there is no research to read.
          Effect.succeed<[string, string]>(["null", "[]"]),
    ),
    // Both print one JSON value; `exp study --json` prints `null` for a project with no study.
    Effect.flatMap(([study, experiments]) =>
      decode(`{"study":${study.trim() || "null"},"experiments":${experiments.trim() || "[]"}}`),
    ),
  )

export const act = (directory: string, verb: Verb, id: number) =>
  inProject(directory, [verb, String(id), ...(verb === "run" ? ["--detach"] : [])]).pipe(Effect.asVoid)

export const log = (directory: string, id: number) => inProject(directory, ["log", String(id)])
