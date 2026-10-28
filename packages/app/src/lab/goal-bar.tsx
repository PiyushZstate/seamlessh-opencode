import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { Experiment, Study } from "./contract"
import { best, duration, figure, reached, valueOf } from "./model"
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

  // The best so far against the target, from the baseline: how much of the way the study has come.
  const progress = createMemo(() => {
    const target = props.study.target
    const start = props.all.find((experiment) => experiment.parent === null)
    const top = best(props.all, props.study.direction)
    const from = start && valueOf(start)
    const now = top && valueOf(top)

    if (target === null || from === undefined || now === undefined || target === from) return

    return { share: Math.min(1, Math.max(0, (now - from) / (target - from))), now }
  })

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
      <span class="min-w-[6ch] shrink-[4] truncate text-v2-text-text-muted" title={props.study.goal}>
        {props.study.goal.trim() || props.study.metric}
      </span>
      <Show when={progress()}>
        {(meter) => (
          <span class="flex shrink-0 items-center gap-1.5" data-slot="lab-goal-meter">
            <span class="relative h-[3px] w-10 overflow-hidden rounded-full bg-v2-border-border-base">
              <span
                class="absolute inset-y-0 left-0 rounded-full"
                classList={{ "bg-v2-state-fg-success": met(), "bg-v2-text-text-base": !met() }}
                style={{ width: `${meter().share * 100}%` }}
              />
            </span>
            <span class={`text-v2-text-text-base ${FIGURES}`}>{figure(meter().now)}</span>
          </span>
        )}
      </Show>
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
            <span class="min-w-[10ch] max-w-[28ch] shrink truncate">{experiment().title}</span>
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
