import { Schema } from "effect"

/** How a project's metric improves: up or down. */
export const Direction = Schema.Literals(["Higher", "Lower"])

/** Where a run is: waiting for a slot, going, or finished one of four ways. */
export const RunStatus = Schema.Literals(["Queued", "Running", "Succeeded", "Failed", "Cancelled", "Lost"])

export type RunStatus = typeof RunStatus.Type

/** A project's study as `seamlessh exp study --json` prints it: what it tries to move, and how. */
export const Study = Schema.Struct({
  repo: Schema.String,
  goal: Schema.String,
  metric: Schema.String,
  direction: Direction,
  command: Schema.String,
  target: Schema.NullOr(Schema.Number),
})

export type Study = typeof Study.Type

/** One execution of an experiment's command, numbered across the project (`#27`). */
export const Run = Schema.Struct({
  number: Schema.Number,
  status: RunStatus,
  /** Unix seconds it started; 0 while queued. */
  started: Schema.Number,
  /** How long it ran, so far for a live run. */
  millis: Schema.Number,
  exit: Schema.NullOr(Schema.Number),
  /** The metric's last value the run printed. */
  value: Schema.NullOr(Schema.Number),
  /** Every value it printed, at most the last 2,000. */
  points: Schema.Array(Schema.Number),
  error: Schema.NullOr(Schema.String),
})

export type Run = typeof Run.Type

/** A commit of a thread's worktree on its own branch, and the runs of one command against it. */
export const Experiment = Schema.Struct({
  id: Schema.Number,
  repo: Schema.String,
  parent: Schema.NullOr(Schema.Number),
  title: Schema.String,
  branch: Schema.String,
  commit: Schema.String,
  note: Schema.String,
  command: Schema.String,
  created: Schema.Number,
  runs: Schema.Array(Run),
  kept: Schema.Boolean,
})

export type Experiment = typeof Experiment.Type

/** A project's research as the Seamlessh host holds it. */
export const Snapshot = Schema.Struct({
  study: Schema.NullOr(Study),
  experiments: Schema.Array(Experiment),
})

export type Snapshot = typeof Snapshot.Type

/** What a button asks the host to do with one experiment. */
export const Verb = Schema.Literals(["run", "keep", "unkeep", "cancel"])

export type Verb = typeof Verb.Type

/**
 * The window's way to the Seamlessh host, which owns every study and experiment. The desktop main process runs the
 * `seamlessh exp` CLI in the session's directory, which names the project, so the window needs no connection of its
 * own. The web build has no main process and leaves it out.
 */
export type LabHost = {
  /** The study and experiments of the project the directory belongs to; none when it has no research. */
  snapshot(directory: string): Promise<Snapshot>
  /** Reruns, keeps, lets go of or stops one experiment, in the directory's project. */
  act(directory: string, verb: Verb, id: number): Promise<void>
  /** The end of an experiment's latest run log, as `exp log` prints it. */
  log(directory: string, id: number): Promise<string>
}
