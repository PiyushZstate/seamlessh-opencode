import type { Experiment, Run, Snapshot } from "./contract"

/*
 * A researching project as the host would report it, for stories and tests: a GRPO study on GSM8K with a kept path to
 * the best, a live run, a queued one, a failure and a cancel. Seeded, so every render and screenshot is the same.
 */

/** mulberry32: a small seeded generator, so the noise is stable between renders. */
const noise = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An eval curve that rises from `from` toward `to` with eval noise, ending on `to` when it finishes. */
export const evalCurve = (from: number, to: number, count: number, seed: number, finished = true) => {
  const random = noise(seed)

  return Array.from({ length: count }, (_, index) => {
    const progress = index / 59
    const settled = from + ((to - from) * (1 - Math.exp(-3.2 * progress))) / (1 - Math.exp(-3.2))
    const jitter = (random() - 0.5) * 0.018 * (1 - progress * 0.5)

    return finished && index === count - 1 ? to : Number((settled + jitter).toFixed(4))
  })
}

const NOW = 1_793_174_400

const EXIT: Partial<Record<Run["status"], number>> = { Succeeded: 0, Failed: 1 }

const startedAt = (status: Run["status"], millis: number) => {
  const known: Partial<Record<Run["status"], number>> = {
    Queued: 0,
    Running: Math.floor(Date.now() / 1000) - Math.floor(millis / 1000),
  }

  return known[status]
}

const run = (
  number: number,
  status: Run["status"],
  value: number | null,
  points: number[] = [],
  millis = 0,
  error: string | null = null,
): Run => ({
  number,
  status,
  // A live run started a moment ago, so its elapsed time reads as it would on the host; a queued one has not.
  started: startedAt(status, millis) ?? NOW - number * 1800,
  millis,
  exit: EXIT[status] ?? null,
  value,
  points,
  error,
})

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const experiment = (
  id: number,
  parent: number | null,
  title: string,
  runs: Run[],
  extra: Partial<Experiment> = {},
): Experiment => ({
  id,
  repo: "rl-math",
  parent,
  title,
  branch: `exp/${id}-${slug(title)}`,
  commit: ((id * 0x9e3779b1) >>> 0).toString(16).padStart(8, "0").slice(0, 7),
  note: "",
  command: "python train.py --config grpo.yaml && python eval.py --split test",
  created: NOW - (13 - id) * 3600,
  kept: false,
  runs,
  ...extra,
})

/** Six minutes and a bit of training and eval per run, in milliseconds. */
const RUN = 6 * 60_000 + 23_000

export const research: Snapshot = {
  study: {
    repo: "rl-math",
    goal: "Lift GSM8K accuracy of Qwen3-1.7B above 0.80 with GRPO, without longer answers",
    metric: "eval_accuracy",
    direction: "Higher",
    command: "python train.py --config grpo.yaml && python eval.py --split test",
    target: 0.8,
  },
  experiments: [
    experiment(1, null, "Baseline", [run(1, "Succeeded", 0.7031, evalCurve(0.58, 0.7031, 60, 1), RUN)], {
      kept: true,
      note: "The recipe as released: lr 3e-6, group size 8, KL 0.04, 4k-token answers.",
    }),
    experiment(
      2,
      1,
      "Higher learning rate (5e-6)",
      [run(2, "Succeeded", 0.7293, evalCurve(0.58, 0.7293, 60, 2), RUN)],
      {
        kept: true,
        note: "The baseline's reward was still climbing at the last step; a larger step size should reach the plateau sooner.",
      },
    ),
    experiment(3, 1, "Lower learning rate (1e-6)", [run(3, "Succeeded", 0.6769, evalCurve(0.58, 0.6769, 60, 3), RUN)], {
      note: "Control for #2: if smaller is worse, the direction holds.",
    }),
    experiment(4, 2, "Group size 16", [run(4, "Succeeded", 0.7729, evalCurve(0.59, 0.7729, 60, 4), RUN * 1.6)], {
      kept: true,
      note: "More samples per prompt give the advantage a lower-variance baseline (Shao et al. 2024, §4.1).",
    }),
    experiment(
      5,
      4,
      "KL coefficient 0.0",
      [
        run(5, "Succeeded", 0.8166, evalCurve(0.6, 0.8166, 60, 5), RUN * 1.6),
        run(9, "Succeeded", 0.8141, evalCurve(0.6, 0.8141, 60, 9), RUN * 1.6),
      ],
      {
        kept: true,
        note: "DAPO (Yu et al. 2025, arXiv:2503.14476) drops the KL term for long chain-of-thought RL, because the policy is meant to move far from the reference. Expect a higher ceiling on easy math; rerun #9 is the control, within 0.3 pts.",
      },
    ),
    experiment(
      6,
      5,
      "Micro-batch 32 for throughput",
      [
        run(
          6,
          "Failed",
          null,
          evalCurve(0.6, 0.62, 7, 6, false),
          94_000,
          "command exited 1: CUDA out of memory at step 7",
        ),
      ],
      { note: "Twice the micro-batch to cut the step time; may not fit with group size 16." },
    ),
    experiment(7, 5, "Clip-higher 0.28", [run(7, "Succeeded", 0.8094, evalCurve(0.6, 0.8094, 60, 7), RUN * 1.6)], {
      note: "Decoupled clip ranges keep entropy from collapsing (DAPO §3.1). Slightly below its parent; entropy held.",
    }),
    experiment(
      8,
      5,
      "Dr. GRPO length normalisation",
      [run(10, "Running", 0.8212, evalCurve(0.6, 0.83, 41, 8, false), 4 * 60_000 + 17_000)],
      {
        note: "Normalising by a constant instead of each answer's length removes the bias toward long wrong answers (Liu et al. 2025). Should hold accuracy and shorten answers.",
      },
    ),
    experiment(9, 7, "Overlong reward shaping", [run(11, "Queued", null)], {
      note: "Soft penalty past 3k tokens, as DAPO's overlong shaping, on top of clip-higher.",
    }),
    experiment(
      10,
      4,
      "Entropy bonus 0.001",
      [run(8, "Succeeded", 0.7612, evalCurve(0.59, 0.7612, 60, 10), RUN * 1.6)],
      {
        note: "Below its parent: the bonus lengthened answers without raising accuracy.",
      },
    ),
    experiment(11, 1, "Format reward only", [run(12, "Cancelled", null, evalCurve(0.58, 0.6, 12, 11, false), 71_000)], {
      note: "Stopped: the format reward saturated in a dozen steps and taught nothing about the answers.",
    }),
    experiment(
      12,
      2,
      "Temperature 1.2 for rollouts",
      [run(13, "Succeeded", 0.7405, evalCurve(0.58, 0.7405, 60, 12), RUN)],
      {
        note: "Hotter sampling for more diverse groups. A small gain on #2, less than a larger group gave.",
      },
    ),
  ],
}

/** A run's log as `exp log` prints its end: training steps, then the eval's metric lines. */
export const researchLog = (experiment: Experiment) => {
  const points = experiment.runs.at(-1)?.points ?? []

  return points
    .map((value, step) => {
      const reward = (value * 1.18 - 0.12).toFixed(3)
      const length = Math.round(2100 - step * 9 + ((step * 37) % 120))

      return `step ${String(step * 10).padStart(3, " ")} | reward ${reward} | kl 0.000 | len ${length} | eval_accuracy: ${value.toFixed(4)}`
    })
    .join("\n")
}
