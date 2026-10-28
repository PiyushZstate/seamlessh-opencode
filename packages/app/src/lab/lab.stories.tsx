import { createSignal, Show } from "solid-js"
import { SessionPanelFrame } from "@/session/session-frame"
import { research, researchLog } from "./fixture"
import { LabGoalBar } from "./goal-bar"
import { LabPage } from "./page"
import type { LabState, PageTab } from "./state"
import { LabTree } from "./tree"

const log = async (id: number) => {
  const experiment = research.experiments.find((each) => each.id === id)

  return experiment ? researchLog(experiment) : ""
}

/**
 * Stand-in for the session's conversation, so the Lab is judged beside a chat the way it is used: the agent narrating
 * the loop. Story chrome only; the app draws the real session here.
 */
function Transcript() {
  const step = (words: string, code?: string) => (
    <div class="flex items-center gap-2 text-12-regular text-v2-text-text-faint">
      <span class="size-1 rounded-full bg-v2-text-text-faint" />
      {words}
      <Show when={code}>
        <code class="truncate font-mono text-[11px] text-v2-text-text-muted">{code}</code>
      </Show>
    </div>
  )

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pt-14 text-14-regular text-v2-text-text-base">
      <p class="max-w-[62ch] [text-wrap:pretty]">
        #5 dropped the KL term and cleared the target: <b class="font-medium">0.8166</b> on GSM8K test, and the rerun #9
        agrees within 0.3 pts. Answers grew by about 180 tokens, which the goal rules out.
      </p>
      {step("Read", "src/grpo/loss.py")}
      {step("Ran a command", "seamlessh exp ls")}
      <p class="max-w-[62ch] [text-wrap:pretty]">
        Next, from the best: Dr. GRPO's constant normaliser removes the length bias in the loss. It should hold accuracy
        and shorten answers. Recording it as #8 from #5.
      </p>
      {step("Edited", "src/grpo/loss.py")}
      {step("Ran a command", 'seamlessh exp record "Dr. GRPO length normalisation" --parent 5')}
      <div class="ms-auto max-w-[44ch] rounded-[12px] bg-v2-background-bg-layer-02 px-3 py-2 [text-wrap:pretty]">
        Good. If it holds, queue overlong shaping on top of clip-higher.
      </div>
      <p class="max-w-[62ch] text-v2-text-text-muted [text-wrap:pretty]">
        Queued #9 from #7. #8 is at step 410 of 600, 0.8097 so far.
      </p>
    </div>
  )
}

type PreviewArgs = { state: LabState; pick?: number; tab?: PageTab }

function Preview(props: PreviewArgs) {
  const [pick, setPick] = createSignal(props.pick)
  const [tab, setTab] = createSignal<PageTab>(props.tab ?? "overview")
  const snapshot = () => (props.state.kind === "ready" ? props.state.snapshot : undefined)
  const picked = () => snapshot()?.experiments.find((each) => each.id === pick())
  const running = () => snapshot()?.experiments.findLast((each) => each.runs.some((r) => r.status === "Running"))

  return (
    <div class="flex h-[860px] w-full gap-2 bg-v2-background-bg-deep p-2" data-slot="session-lab-row">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <SessionPanelFrame raised>
          <Transcript />
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
      <div class="flex min-h-0 w-[440px] shrink-0 flex-col">
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
export const Page = { args: { state: { kind: "ready", snapshot: research }, pick: 8 } }

/** The live run's curve against its parent's. */
export const Training = { args: { state: { kind: "ready", snapshot: research }, pick: 8, tab: "training" } }

/** The end of the live run's log. */
export const Log = { args: { state: { kind: "ready", snapshot: research }, pick: 8, tab: "log" } }

/** The best, finished, on Training. */
export const Best = { args: { state: { kind: "ready", snapshot: research }, pick: 5, tab: "training" } }

/** A run that failed: its error under the overview. */
export const Failed_run = { args: { state: { kind: "ready", snapshot: research }, pick: 6 } }

/** Waiting for the host's one slot. */
export const Queued = { args: { state: { kind: "ready", snapshot: research }, pick: 9 } }

/** A study set up before the agent recorded anything. */
export const NoExperiments = {
  args: { state: { kind: "ready", snapshot: { study: research.study, experiments: [] } } },
}

/** The CLI is missing or not connected. */
export const Failed = { args: { state: { kind: "error" } } }
