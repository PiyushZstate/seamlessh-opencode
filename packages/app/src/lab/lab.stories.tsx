import { createSignal, Show } from "solid-js"
import { SessionPanelFrame } from "@/session/session-frame"
import type { Experiment, Run, Snapshot } from "./contract"
import { LabGoalBar } from "./goal-bar"
import { LabPage } from "./page"
import type { LabState, PageTab } from "./state"
import { LabTree } from "./tree"

// A climbing curve with noise, so the chart reads like a run that printed its metric as it went.
const curve = (from: number, to: number, count: number, seed: number) =>
  Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1)
    const wobble = Math.sin(index * 1.7 + seed) * (to - from) * 0.03

    return from + (to - from) * (1 - Math.exp(-4 * progress)) + wobble
  })

const run = (number: number, status: Run["status"], value: number | null, points: number[] = [], millis = 48_000) => ({
  number,
  status,
  started: status === "Running" ? Math.floor(Date.now() / 1000) - 132 : 0,
  millis,
  exit: status === "Succeeded" ? 0 : null,
  value,
  points,
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
  command: "python bench.py --tokens 512",
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
    experiment(1, null, "Baseline", [run(1, "Succeeded", 1012, curve(400, 1012, 40, 1))], { kept: true }),
    experiment(2, 1, "Fuse rotary into QKV", [run(2, "Succeeded", 1188, curve(420, 1188, 40, 2))], {
      kept: true,
      note: "Rotary was a separate launch per layer. Fusing it saves one read of Q and K.",
    }),
    experiment(3, 2, "Paged KV with 16-token blocks", [
      run(3, "Succeeded", 1241, curve(430, 1241, 40, 3)),
      run(6, "Succeeded", 1236, curve(430, 1236, 40, 4)),
    ]),
    experiment(4, 2, "Split-K attention", [run(4, "Failed", null)]),
    experiment(5, 3, "CUDA graphs for the decode step", [run(7, "Running", 1302, curve(440, 1302, 26, 5), 132_000)], {
      note: "Capture the whole step once; replay it per token. The launch overhead was a fifth of the step at batch one.",
    }),
    experiment(8, 1, "Int8 KV cache", [run(5, "Succeeded", 931, curve(380, 931, 40, 6))]),
  ],
}

const log = async () =>
  Array.from({ length: 26 }, (_, step) => `step ${step}: decode_tps: ${curve(440, 1302, 26, 5)[step]?.toFixed(1)}`).join(
    "\n",
  )

type PreviewArgs = { state: LabState; pick?: number; tab?: PageTab }

function Preview(props: PreviewArgs) {
  const [pick, setPick] = createSignal(props.pick)
  const [tab, setTab] = createSignal<PageTab>(props.tab ?? "overview")
  const snapshot = () => (props.state.kind === "ready" ? props.state.snapshot : undefined)
  const picked = () => snapshot()?.experiments.find((each) => each.id === pick())
  const running = () => snapshot()?.experiments.findLast((each) => each.runs.some((r) => r.status === "Running"))

  return (
    <div class="flex h-[720px] w-full gap-2 bg-v2-background-bg-deep p-2" data-slot="session-lab-row">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <SessionPanelFrame raised>
          <div class="flex-1" />
          <div class="relative mx-3 mb-3 h-24 rounded-[12px] border-[0.5px] border-v2-border-border-muted">
            <div class="pointer-events-none absolute inset-x-0 bottom-full flex items-end gap-2 pb-2.5">
              <Show when={snapshot()?.study}>
                {(study) => (
                  <LabGoalBar
                    study={study()}
                    all={snapshot()?.experiments ?? []}
                    running={running()}
                    onStop={() => {}}
                  />
                )}
              </Show>
            </div>
          </div>
        </SessionPanelFrame>
      </div>
      <div class="flex min-h-0 w-[340px] shrink-0 flex-col">
        <SessionPanelFrame raised>
          <LabTree
            state={props.state}
            picked={pick()}
            running={running()}
            onPick={setPick}
            onClose={() => {}}
            onRetry={() => {}}
          />
        </SessionPanelFrame>
      </div>
      <Show when={picked()}>
        {(shown) => (
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <SessionPanelFrame raised>
              <LabPage
                experiment={shown()}
                all={snapshot()?.experiments ?? []}
                study={snapshot()?.study ?? null}
                tab={tab()}
                onTab={setTab}
                onAct={() => {}}
                onClose={() => setPick(undefined)}
                log={log}
              />
            </SessionPanelFrame>
          </div>
        )}
      </Show>
    </div>
  )
}

export default {
  title: "Seamlessh/Lab",
  id: "seamlessh-lab",
  render: (args: PreviewArgs) => <Preview {...args} />,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A researching session (D24): chat with the goal bar in its composer lane, the study strip and experiment tree, and the picked experiment's page.",
      },
    },
  },
}

/** Nothing picked: chat | tree. */
export const Tree = { args: { state: { kind: "ready", snapshot: research } } }

/** The live run picked, on Overview. */
export const Page = { args: { state: { kind: "ready", snapshot: research }, pick: 5 } }

/** The live run's curve against its parent's. */
export const Training = { args: { state: { kind: "ready", snapshot: research }, pick: 5, tab: "training" } }

/** The end of the live run's log. */
export const Log = { args: { state: { kind: "ready", snapshot: research }, pick: 5, tab: "log" } }

/** A study set up before the agent recorded anything. */
export const NoExperiments = {
  args: { state: { kind: "ready", snapshot: { study: research.study, experiments: [] } } },
}

/** The CLI is missing or not connected. */
export const Failed = { args: { state: { kind: "error" } } }
