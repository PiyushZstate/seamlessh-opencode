import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Tabs } from "@opencode/ui/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import type { Experiment, Run, Study, Verb } from "./contract"
import { duration, figure, live, rows, valueOf } from "./model"
import { ColumnHead, EDGE, FIGURES, Label, Node, Notice, ROW_TEXT, statusClass } from "./parts"
import type { PageTab } from "./state"

const TABS: readonly PageTab[] = ["overview", "training", "evals", "rollouts", "log"]

/** A live run's log is read again this often while the Log tab shows it. */
const LOG_EVERY = 3000

export type LabPageProps = {
  experiment: Experiment
  all: readonly Experiment[]
  study: Study | null
  tab: PageTab
  onTab: (tab: PageTab) => void
  onAct: (verb: Verb, id: number) => void
  onClose: () => void
  /** The end of the experiment's latest run log. */
  log: (id: number) => Promise<string>
  /** Leave room for the session's header toggles at the end of the head. */
  reserve?: boolean
}

/**
 * The picked experiment (D24): its title and branch, Rerun, Keep and Stop, and five tabs. Overview reads its climb
 * from the root, note, command and runs; Training draws the metric each run printed against its parent's; Log is the
 * end of the latest run's output. Evals and Rollouts wait for the host to report them.
 */
export function LabPage(props: LabPageProps) {
  const language = useLanguage()
  const id = () => props.experiment.id
  const parent = () => props.all.find((other) => other.id === props.experiment.parent)

  // Single keys while focus is in the page and not in a field, so OpenCode's own keymap keeps everything else.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return

    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return
    const key = event.key.toLowerCase()
    const tab = TABS[Number(key) - 1]

    if (tab) props.onTab(tab)
    else if (key === "r") props.onAct("run", id())
    else if (key === "k") props.onAct(props.experiment.kept ? "unkeep" : "keep", id())
    else if (key === "s" && live(props.experiment)) props.onAct("cancel", id())
    else return
    event.preventDefault()
  }

  return (
    <section
      class="@container flex size-full min-h-0 min-w-0 flex-col"
      data-slot="lab-page"
      aria-label={props.experiment.title}
      onKeyDown={onKeyDown}
    >
      <ColumnHead close={language.t("research.page.close")} onClose={props.onClose} reserve={props.reserve}>
        <span class="truncate text-14-medium text-v2-text-text-base">{props.experiment.title}</span>
        <span class={`shrink-0 text-v2-text-text-faint ${FIGURES}`}>#{id()}</span>
        <Show when={props.experiment.kept}>
          <span class="shrink-0 text-12-regular text-v2-text-text-muted">{language.t("research.page.kept")}</span>
        </Show>
      </ColumnHead>
      <div class={`flex shrink-0 flex-col gap-3 pb-2 ${EDGE}`}>
        <div class="-mt-2 flex min-w-0 items-baseline gap-2">
          <span class="min-w-0 shrink truncate text-12-mono text-v2-text-text-faint">{props.experiment.branch}</span>
          <Show when={parent()}>
            {(from) => (
              <span class="min-w-0 truncate text-12-regular text-v2-text-text-muted">
                {language.t("research.page.from", { id: from().id, title: from().title })}
              </span>
            )}
          </Show>
        </div>
        <div class="flex flex-wrap gap-1.5" data-slot="lab-actions">
          <Button size="small" variant="contrast" onClick={() => props.onAct("run", id())}>
            {language.t("research.action.rerun")}
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => props.onAct(props.experiment.kept ? "unkeep" : "keep", id())}
          >
            {language.t(props.experiment.kept ? "research.action.unkeep" : "research.action.keep")}
          </Button>
          <Show when={live(props.experiment)}>
            <Button size="small" variant="ghost" onClick={() => props.onAct("cancel", id())}>
              {language.t("research.action.stop")}
            </Button>
          </Show>
        </div>
      </div>
      <Tabs
        value={props.tab}
        onChange={(value: string) => props.onTab(TABS.find((tab) => tab === value) ?? "overview")}
        variant="line"
        class="!h-auto shrink-0"
        data-slot="lab-page-tabs"
      >
        <Tabs.List class={`!h-9 !gap-3 ${EDGE}`}>
          <For each={TABS}>{(tab) => <Tabs.Trigger value={tab}>{language.t(`research.tab.${tab}`)}</Tabs.Trigger>}</For>
        </Tabs.List>
      </Tabs>
      <div class="min-h-0 flex-1 overflow-y-auto" data-scrollable data-slot="lab-page-body">
        <Switch>
          <Match when={props.tab === "overview"}>
            <Overview {...props} />
          </Match>
          <Match when={props.tab === "training"}>
            <Training experiment={props.experiment} parent={parent()} study={props.study} />
          </Match>
          <Match when={props.tab === "evals"}>
            <Notice body={language.t("research.evals.empty")} />
          </Match>
          <Match when={props.tab === "rollouts"}>
            <Notice body={language.t("research.rollouts.empty")} />
          </Match>
          <Match when={props.tab === "log"}>
            <Log experiment={props.experiment} log={props.log} />
          </Match>
        </Switch>
      </div>
    </section>
  )
}

function Overview(props: LabPageProps) {
  const language = useLanguage()
  const direction = () => props.study?.direction ?? "Higher"

  // The path from the root to this experiment, each step with its change on the one before.
  const climb = createMemo(() => {
    const lines = rows(props.all, direction())
    const path: number[] = []
    const seen = new Set<number>()
    let at: Experiment | undefined = props.experiment

    while (at && !seen.has(at.id)) {
      seen.add(at.id)
      path.unshift(at.id)
      const up: number | null = at.parent
      at = props.all.find((other) => other.id === up)
    }

    return path.flatMap((id) => lines.find((line) => line.experiment.id === id) ?? [])
  })

  return (
    <div class={`flex flex-col gap-5 pb-5 pt-3 ${EDGE}`}>
      <Show when={climb().length > 1}>
        <div data-slot="lab-climb">
          <Label>{language.t("research.page.climb")}</Label>
          <For each={climb()}>
            {(line, index) => (
              <div class="flex h-7 items-center gap-2" style={{ "padding-inline-start": `${index() * 16}px` }}>
                <Node
                  status={line.experiment.runs.at(-1)?.status}
                  hasValue={line.value !== undefined}
                  best={line.best}
                  kept={line.experiment.kept}
                />
                <span
                  class={`min-w-0 flex-1 truncate ${ROW_TEXT}`}
                  classList={{
                    "text-v2-text-text-base": line.experiment.id === props.experiment.id,
                    "text-v2-text-text-muted": line.experiment.id !== props.experiment.id,
                  }}
                >
                  {line.experiment.title}
                </span>
                <span
                  class={`w-16 shrink-0 text-end ${FIGURES}`}
                  classList={{
                    "text-v2-state-fg-success": line.sign > 0,
                    "text-v2-state-fg-danger": line.sign < 0,
                    "text-v2-text-text-faint": line.sign === 0,
                  }}
                >
                  {line.delta ?? ""}
                </span>
                <span class={`w-16 shrink-0 text-end text-v2-text-text-base ${FIGURES}`}>
                  {line.value !== undefined ? figure(line.value) : ""}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.experiment.note.trim()}>
        <div data-slot="lab-note">
          <Label>{language.t("research.page.note")}</Label>
          <p class="max-w-[65ch] whitespace-pre-wrap text-14-regular text-v2-text-text-base [text-wrap:pretty]">
            {props.experiment.note.trim()}
          </p>
        </div>
      </Show>
      <Show when={props.experiment.command.trim()}>
        <div data-slot="lab-command">
          <Label>{language.t("research.page.command")}</Label>
          <code class="block overflow-x-auto whitespace-pre rounded-md bg-v2-background-bg-layer-02 px-2 py-1.5 text-12-mono text-v2-text-text-base">
            {props.experiment.command}
          </code>
        </div>
      </Show>
      <Show when={props.experiment.runs.length > 0}>
        <div data-slot="lab-runs">
          <Label>{language.t("research.page.runs")}</Label>
          <For each={props.experiment.runs.toReversed()}>{(run) => <RunRow run={run} />}</For>
        </div>
      </Show>
      <Show when={valueOf(props.experiment) === undefined && props.experiment.runs.at(-1)?.error}>
        {(error) => <div class="text-12-mono text-v2-state-fg-danger [overflow-wrap:anywhere]">{error()}</div>}
      </Show>
    </div>
  )
}

function RunRow(props: { run: Run }) {
  const language = useLanguage()

  return (
    // The same right-hand columns as the tree, so a run's value sits under the experiment's.
    <div class={`flex h-7 items-center gap-2 border-t border-v2-border-border-muted ${FIGURES}`} data-slot="lab-run">
      <span class="w-8 shrink-0 text-v2-text-text-faint">#{props.run.number}</span>
      <span class={`min-w-0 flex-1 truncate text-12-regular ${statusClass(props.run.status)}`}>
        {language.t(`research.status.${props.run.status}`)}
      </span>
      <span class="w-16 shrink-0 text-end text-v2-text-text-faint">
        {props.run.millis > 0 ? duration(props.run.millis) : ""}
      </span>
      <span class="w-16 shrink-0 text-end text-v2-text-text-base">
        {props.run.value !== null ? figure(props.run.value) : ""}
      </span>
    </div>
  )
}

/** The latest run that printed values, which is the one a curve can show. */
const plotted = (experiment: Experiment | undefined) => experiment?.runs.findLast((run) => run.points.length > 0)

/** SVG units across and down; the strokes do not scale, so only the shape stretches with the column. */
const WIDE = 600

const TALL = 200

/**
 * The metric each value a run printed, in order, against the parent's latest curve dashed. Monochrome: the
 * experiment in the base ink, its parent faint; only a live run's newest value is green.
 */
function Training(props: { experiment: Experiment; parent: Experiment | undefined; study: Study | null }) {
  const language = useLanguage()
  const run = () => plotted(props.experiment)
  const before = () => plotted(props.parent)

  const scale = createMemo(() => {
    const series = [run()?.points ?? [], before()?.points ?? []]
    const values = series.flat()
    const low = Math.min(...values)
    const high = Math.max(...values)
    // A flat curve gets a band around it, so it draws across the middle instead of along an edge.
    const pad = high === low ? Math.abs(high) * 0.05 || 1 : (high - low) * 0.08
    const steps = Math.max(...series.map((points) => points.length), 2) - 1

    return { low: low - pad, high: high + pad, steps }
  })

  const x = (index: number) => (index / scale().steps) * WIDE
  const y = (value: number) => TALL - ((value - scale().low) / (scale().high - scale().low)) * TALL

  const path = (points: readonly number[]) =>
    points.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("")

  const last = () => {
    const points = run()?.points ?? []
    const value = points.at(-1)

    return value === undefined ? undefined : { value, left: x(points.length - 1) / WIDE, top: y(value) / TALL }
  }

  return (
    <Show
      when={run()}
      fallback={
        <Notice body={language.t("research.training.empty", { metric: props.study?.metric ?? "metric" })} />
      }
    >
      {(current) => (
        <div class={`flex flex-col gap-2 pb-5 pt-3 ${EDGE}`} data-slot="lab-training">
          <div class="flex items-baseline justify-between gap-3">
            <span class="truncate text-12-mono text-v2-text-text-muted">{props.study?.metric}</span>
            <span class={`shrink-0 text-v2-text-text-faint ${FIGURES}`}>{figure(scale().high)}</span>
          </div>
          <div class="relative h-48 w-full">
            <svg
              class="absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${WIDE} ${TALL}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1="0"
                x2={WIDE}
                y1={TALL}
                y2={TALL}
                class="stroke-v2-border-border-base"
                vector-effect="non-scaling-stroke"
              />
              <Show when={before()}>
                {(earlier) => (
                  <path
                    d={path(earlier().points)}
                    fill="none"
                    class="stroke-v2-text-text-faint"
                    stroke-width="1.25"
                    stroke-dasharray="4 3"
                    vector-effect="non-scaling-stroke"
                  />
                )}
              </Show>
              <path
                d={path(current().points)}
                fill="none"
                class="stroke-v2-text-text-base"
                stroke-width="1.5"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <Show when={last()}>
              {(end) => (
                // HTML, not SVG, so the stretched viewBox does not squash it.
                <span
                  class="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  classList={{
                    "bg-[var(--v2-state-fg-success)]": current().status === "Running",
                    "bg-v2-text-text-base": current().status !== "Running",
                  }}
                  style={{ left: `${end().left * 100}%`, top: `${end().top * 100}%` }}
                />
              )}
            </Show>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <span class={`text-v2-text-text-faint ${FIGURES}`}>{figure(scale().low)}</span>
            <span class={`text-v2-text-text-base ${FIGURES}`}>{last() ? figure(last()?.value ?? 0) : ""}</span>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-12-regular text-v2-text-text-muted">
            <span class="flex items-center gap-1.5">
              <span class="h-px w-4 bg-v2-text-text-base" />
              {language.t("research.training.points", { count: current().points.length, run: current().number })}
            </span>
            <Show when={before() && props.parent}>
              <span class="flex items-center gap-1.5">
                <span class="w-4 border-t border-dashed border-v2-text-text-faint" />
                {language.t("research.training.parent", { id: props.parent?.id ?? 0 })}
              </span>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

function Log(props: { experiment: Experiment; log: (id: number) => Promise<string> }) {
  const language = useLanguage()
  const [text, setText] = createSignal<string>()
  const [failed, setFailed] = createSignal(false)
  let body: HTMLPreElement | undefined
  let turn = 0

  const read = () => {
    if (props.experiment.runs.length === 0) return
    const mine = ++turn
    props
      .log(props.experiment.id)
      .then((value) => {
        if (mine !== turn) return
        // The page body scrolls; follow the end while the reader is already there.
        const scroller = body?.parentElement
        const following = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24
        setFailed(false)
        setText(value)

        if (following && scroller) scroller.scrollTop = scroller.scrollHeight
      })
      .catch(() => mine === turn && setFailed(true))
  }

  createEffect(
    on(
      () => props.experiment.id,
      () => {
        setText(undefined)
        read()
      },
    ),
  )
  const timer = setInterval(() => live(props.experiment) && read(), LOG_EVERY)
  onCleanup(() => clearInterval(timer))

  return (
    <Switch>
      <Match when={props.experiment.runs.length === 0}>
        <Notice body={language.t("research.log.empty")} />
      </Match>
      <Match when={failed() && text() === undefined}>
        <Notice body={language.t("research.log.error")} />
      </Match>
      <Match when={true}>
        <pre
          ref={body}
          class={`whitespace-pre-wrap py-3 text-12-mono text-v2-text-text-muted [overflow-wrap:anywhere] ${EDGE}`}
          data-slot="lab-log"
        >
          {text() ?? ""}
        </pre>
      </Match>
    </Switch>
  )
}
