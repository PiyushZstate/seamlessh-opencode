import type { Experiment, Study } from "./contract"

/**
 * How the Lab reads experiments, after `seamlessh-proto`'s `reading.rs` and the GPUI app's `experiments.rs`, so the
 * panel, the CLI and the host never disagree about a number or a verdict.
 */

export type Direction = Study["direction"]

export type Verdict = "better" | "worse" | "same" | "baseline" | "none"

/** One line of the tree: an experiment, how deep it sits, its value and how it did against its parent. */
export type Row = {
  experiment: Experiment
  depth: number
  value: number | undefined
  verdict: Verdict
  /** The change on the parent in words (`+4.4 pts`, `205×`), positive when better. */
  delta: string | undefined
  /** Whether the change is better, worse or level, for its colour. */
  sign: number
  best: boolean
}

/** Which way each verdict moved, for its colour. */
const SIGN: Record<Verdict, number> = { better: 1, worse: -1, same: 0, baseline: 0, none: 0 }

const beats = (direction: Direction, value: number, than: number) => (direction === "Higher" ? value > than : value < than)

/** The value of its latest run that succeeded and printed one. */
export function valueOf(experiment: Experiment) {
  return experiment.runs.findLast((run) => run.status === "Succeeded" && run.value !== null)?.value ?? undefined
}

export function lastRun(experiment: Experiment) {
  return experiment.runs.at(-1)
}

export function live(experiment: Experiment) {
  return experiment.runs.some((run) => run.status === "Queued" || run.status === "Running")
}

/** The experiment with the best value in the study's direction; the earliest wins a tie. */
export function best(all: readonly Experiment[], direction: Direction) {
  return all.reduce<Experiment | undefined>((held, experiment) => {
    const value = valueOf(experiment)
    const kept = held && valueOf(held)

    if (value === undefined) return held

    if (kept === undefined || beats(direction, value, kept)) return experiment

    return held
  }, undefined)
}

/** Roots by id, each followed by its children; a parent cycle from a bad state file stops instead of hanging. */
export function tree(all: readonly Experiment[]) {
  const sorted = all.toSorted((a, b) => a.id - b.id)
  const known = new Set(sorted.map((experiment) => experiment.id))
  const seen = new Set<number>()

  const walk = (experiment: Experiment, depth: number): { experiment: Experiment; depth: number }[] => {
    if (seen.has(experiment.id)) return []
    seen.add(experiment.id)

    return [
      { experiment, depth },
      ...sorted.filter((child) => child.parent === experiment.id).flatMap((child) => walk(child, depth + 1)),
    ]
  }

  return sorted
    .filter((experiment) => experiment.parent === null || !known.has(experiment.parent))
    .flatMap((root) => walk(root, 0))
}

export function rows(all: readonly Experiment[], direction: Direction): Row[] {
  const top = best(all, direction)?.id

  return tree(all).map((entry) => {
    const value = valueOf(entry.experiment)
    const parent = all.find((other) => other.id === entry.experiment.parent)
    const before = parent && valueOf(parent)
    const verdict = verdictOf(direction, !!parent, value, before)
    const compared = value !== undefined && before !== undefined

    return {
      experiment: entry.experiment,
      depth: entry.depth,
      value,
      verdict,
      delta: compared ? deltaWords(value, before, direction) : undefined,
      sign: SIGN[verdict],
      best: top === entry.experiment.id,
    }
  })
}

/** An experiment with no parent is a baseline even before it has a value. */
export function verdictOf(
  direction: Direction,
  hasParent: boolean,
  value: number | undefined,
  parent: number | undefined,
): Verdict {
  if (!hasParent) return "baseline"

  if (value === undefined || parent === undefined) return "none"

  if (value === parent) return "same"

  return beats(direction, value, parent) ? "better" : "worse"
}

/**
 * A change as a researcher reads it: a factor when twice as good or bad, points for a score between 0 and 1, else a
 * percentage. Positive is better in the study's direction.
 */
export function deltaWords(value: number, parent: number, direction: Direction) {
  const sign = direction === "Higher" ? 1 : -1
  const factor = value > 0 && parent > 0 ? (direction === "Higher" ? value / parent : parent / value) : undefined

  if (factor !== undefined && factor >= 2) return `${factor >= 10 ? factor.toFixed(0) : factor.toFixed(1)}×`

  if (factor !== undefined && factor <= 0.5) return `÷${1 / factor >= 10 ? (1 / factor).toFixed(0) : (1 / factor).toFixed(1)}`

  if (value >= 0 && value <= 1 && parent >= 0 && parent <= 1) return `${signed(sign * (value - parent) * 100)} pts`

  if (parent === 0) return undefined

  return `${signed((sign * (value - parent) * 100) / Math.abs(parent))}%`
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`

/** A value to four significant figures, so `72.90000000000001` reads `72.9`; an exponent past 1e6 or under 1e-4. */
export function figure(value: number) {
  if (!Number.isFinite(value)) return String(value)

  if (value === 0) return "0"

  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) {
    const [mantissa, exponent] = value.toExponential(3).split("e")

    return `${mantissa?.replace(/\.?0+$/, "")}e${Number(exponent)}`
  }

  return String(Number(value.toPrecision(4)))
}

/** `12.3s`, `1m02s`, `2h03m`. */
export function duration(millis: number) {
  const seconds = Math.floor(millis / 1000)

  if (seconds < 60) return `${seconds}.${Math.floor((millis % 1000) / 100)}s`

  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`

  return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`
}

/** The experiment shown: the person's pick while it exists, else the latest live one, else the best, else the last. */
export function picked(all: readonly Experiment[], direction: Direction, pick: number | undefined) {
  return (
    all.find((experiment) => experiment.id === pick) ??
    all.findLast(live) ??
    best(all, direction) ??
    all.at(-1)
  )
}

/** Whether the best value meets the study's target. */
export function reached(study: Study, all: readonly Experiment[]) {
  const top = best(all, study.direction)
  const value = top && valueOf(top)

  return study.target !== null && value !== undefined && (value === study.target || beats(study.direction, value, study.target))
}
