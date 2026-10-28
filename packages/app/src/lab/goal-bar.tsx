import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { Experiment, Study } from "./contract"
import { duration, reached } from "./model"
import { FIGURES } from "./parts"

/**
 * The study above the composer (D24): its goal on one line, then the live run's title, id, elapsed time and Stop, or
 * the green "target reached" words. Status, not a second way to set the study; stopping the agent stays OpenCode's.
 * Drawn as the composer lane's capsule, the activity chip's height, radius, hairline and lift.
 */
export function LabGoalBar(props: {
  study: Study
  all: readonly Experiment[]
  running: Experiment | undefined
  onStop: (id: number) => void
}) {
  const language = useLanguage()
  const run = () => props.running?.runs.findLast((each) => each.status === "Running" || each.status === "Queued")
  const met = createMemo(() => reached(props.study, props.all))

  // A one-second clock only while a run goes, so the elapsed time counts between the host's three-second reads.
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => run() && setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  const elapsed = () => {
    const current = run()

    if (!current || current.status !== "Running" || current.started === 0) return

    return duration(Math.max(now() - current.started * 1000, current.millis))
  }

  return (
    <div
      data-slot="lab-goal-bar"
      class="pointer-events-auto flex h-7 min-w-0 max-w-full items-center gap-2 rounded-[12px] border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-base ps-2.5 text-[13px] leading-[var(--line-height-compact)] whitespace-nowrap text-v2-text-text-base shadow-[var(--v2-elevation-raised)]"
      classList={{ "pe-1": !!run(), "pe-2.5": !run() }}
    >
      <span class="min-w-0 shrink truncate text-v2-text-text-muted" title={props.study.goal}>
        {props.study.goal.trim() || props.study.metric}
      </span>
      <Show when={run() && props.running}>
        {(experiment) => (
          <>
            <span class="h-3.5 w-px shrink-0 bg-v2-border-border-base" />
            <span
              class="size-1.5 shrink-0 rounded-full"
              classList={{
                "bg-[var(--v2-state-fg-success)]": run()?.status === "Running",
                "border border-[var(--v2-state-fg-warning)]": run()?.status === "Queued",
              }}
            />
            <span class="min-w-0 max-w-[24ch] shrink-[2] truncate">{experiment().title}</span>
            <span class={`shrink-0 text-v2-text-text-faint ${FIGURES}`}>#{experiment().id}</span>
            <Show when={elapsed()}>
              {(time) => <span class={`shrink-0 text-v2-text-text-muted ${FIGURES}`}>{time()}</span>}
            </Show>
            <button
              type="button"
              class="h-5 shrink-0 rounded-[8px] px-1.5 text-12-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              onClick={() => props.onStop(experiment().id)}
              data-slot="lab-goal-stop"
            >
              {language.t("research.action.stop")}
            </button>
          </>
        )}
      </Show>
      <Show when={!run() && met()}>
        <span class="h-3.5 w-px shrink-0 bg-v2-border-border-base" />
        <span class="shrink-0 text-v2-state-fg-success">{language.t("research.study.reached")}</span>
      </Show>
    </div>
  )
}
