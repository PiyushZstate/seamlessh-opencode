import { execFile } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui/main"
import { Lab, Snapshot } from "./contract"

const setup: Plugin.MainSetup = (ctx) => {
  const log = ctx.log

  // An app opened from the Dock inherits launchd's short PATH, without where cargo and Homebrew put the CLI.
  const env = {
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
  }

  const exp = (directory: string, args: readonly string[], signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      execFile("seamlessh", ["exp", ...args], { cwd: directory, env, signal, windowsHide: true }, (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        log.write("error", "seamlessh exp failed", { args, error: error.message, stderr })
        reject(error)
      })
    })

  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Snapshot))

  ctx.provide(Lab, {
    snapshot: async (directory, caller) => {
      const [study, experiments] = await Promise.all([
        exp(directory, ["study", "--json"], caller.signal),
        exp(directory, ["ls", "--json"], caller.signal),
      ])

      // Both print one JSON value; `exp study --json` prints `null` for a project with no study.
      return decode(`{"study":${study.trim() || "null"},"experiments":${experiments.trim() || "[]"}}`)
    },
    act: async (input, caller) => {
      await exp(input.directory, [input.verb, String(input.id), ...(input.verb === "run" ? ["--detach"] : [])], caller.signal)
    },
  })
}

export default setup
