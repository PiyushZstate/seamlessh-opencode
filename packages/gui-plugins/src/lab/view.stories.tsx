import type { Experiment, Snapshot } from "./contract"
import en from "./i18n/en"
import { LabView, type LabState, type LabText } from "./view"

const t: LabText = (key, params) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)), en[key])

const run = (number: number, status: Experiment["runs"][number]["status"], value: number | null, millis = 48_000) => ({
  number,
  status,
  started: 0,
  millis,
  exit: status === "Succeeded" ? 0 : null,
  value,
  points: [],
  error: status === "Failed" ? "command exited 1: CUDA out of memory" : null,
})

const experiment = (
  id: number,
  parent: number | null,
  title: string,
  runs: Experiment["runs"],
  extra: Partial<Experiment> = {},
): Experiment => ({
  id,
  repo: "decode-kernels",
  parent,
  title,
  branch: `exp/${id}-${title.toLowerCase().replaceAll(" ", "-")}`,
  commit: "a1b2c3d",
  note: "",
  command: "python bench.py",
  created: 0,
  kept: false,
  runs,
  ...extra,
})

const research: Snapshot = {
  study: {
    repo: "decode-kernels",
    goal: "Make single-batch decode faster on the H100 without changing outputs",
    metric: "decode_tps",
    direction: "Higher",
    command: "python bench.py",
    target: 1500,
  },
  experiments: [
    experiment(1, null, "Baseline", [run(1, "Succeeded", 1012)], { kept: true }),
    experiment(2, 1, "Fuse rotary into QKV", [run(2, "Succeeded", 1188)], {
      kept: true,
      note: "Rotary was a separate launch per layer. Fusing it saves one read of Q and K.",
    }),
    experiment(3, 2, "Paged KV with 16-token blocks", [run(3, "Succeeded", 1241), run(6, "Succeeded", 1236)]),
    experiment(4, 2, "Split-K attention", [run(4, "Failed", null)]),
    experiment(5, 3, "CUDA graphs for the decode step", [run(7, "Running", 1302, 132_000)], {
      note: "Capture the whole step once; replay it per token.",
    }),
    experiment(8, 1, "Int8 KV cache", [run(5, "Succeeded", 931)]),
  ],
}

const story = (state: LabState, pick?: number) => ({
  render: () => (
    <div style={{ width: "460px", height: "640px", display: "flex" }}>
      <LabView state={state} pick={pick} onPick={() => {}} onAct={() => {}} onRetry={() => {}} t={t} />
    </div>
  ),
})

export default {
  title: "Plugins/Lab",
  id: "plugins-lab",
  parameters: {
    docs: {
      description: {
        component: "The Experiments tab beside the chat: a project's study, its experiment tree and the picked experiment.",
      },
    },
  },
}

/** A study with a live run: the live run is picked by default. */
export const Research = story({ kind: "ready", snapshot: research })

/** The person picked the kept parent. */
export const PickedParent = story({ kind: "ready", snapshot: research }, 2)

/** A study set up before the agent recorded anything. */
export const NoExperiments = story({ kind: "ready", snapshot: { study: research.study, experiments: [] } })

/** The web build has no main process to run the CLI. */
export const Unavailable = story({ kind: "unavailable" })

/** The CLI is missing or not connected. */
export const Failed = story({ kind: "error" })
