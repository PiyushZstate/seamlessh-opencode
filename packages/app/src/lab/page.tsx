import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Tabs } from "@opencode/ui/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import { LabChart } from "./chart"
import type { Experiment, Run, Study, Verb } from "./contract"
import { ancestry, deltaWords, duration, figure, live, valueOf } from "./model"
import { ColumnHead, EDGE, FIGURES, Label, Notice, READINGS, statusClass, Tile } from "./parts"
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

/** The latest run that printed values, which is the one a curve can show. */
const plotted = (experiment: Experiment | undefined) => experiment?.runs.findLast((run) => run.points.length > 0)

/** What an experiment stands at: its finished value, else a live run's newest print. */
const standing = (experiment: Experiment | undefined) => {
  if (!experiment) return

  const run = experiment.runs.at(-1)

  if (run?.status === "Running") return run.points.at(-1) ?? run.value ?? undefined

  return valueOf(experiment)
}

/**
 * The picked experiment (D24), laid out as ArkenOS lays out a report: its title and where it grew from, its inputs as
 * chips, the actions, four readings across (the metric, the change on its parent and on the baseline, and its runs),
 * then five tabs. Overview draws the run's curve against its parent's with the target and the peak called out;
 * Training adds every run as its own small chart; Log is the end of the latest run's output.
 */
export function LabPage(props: LabPageProps) {
  const language = useLanguage()
  const id = () => props.experiment.id
  const parent = () => props.all.find((other) => other.id === props.experiment.parent)
  const direction = () => props.study?.direction ?? "Higher"
  const run = () => props.experiment.runs.at(-1)
  const going = () => run()?.status === "Running"
  const value = () => standing(props.experiment)
  const root = () => props.all.find((other) => other.id === ancestry(props.all, id())[0])

  const change = (than: Experiment | undefined) => {
    const now = value()
    const before = standing(than)

    if (now === undefined || before === undefined || than?.id === id()) return

    const sign = now === before ? 0 : (direction() === "Higher" ? now > before : now < before) ? 1 : -1

    return { words: deltaWords(now, before, direction()) ?? "—", sign }
  }

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
        <span class="truncate text-12-regular text-v2-text-text-faint">
          {props.study?.repo ?? props.experiment.repo}
          <span class="px-1.5">›</span>
          {language.t("research.tree.title")}
          <span class="px-1.5">›</span>
          <span class="text-v2-text-text-muted">#{id()}</span>
        </span>
      </ColumnHead>
      <div class="min-h-0 flex-1 overflow-y-auto" data-scrollable data-slot="lab-page-body">
        <div class={`flex flex-col gap-4 pb-4 ${EDGE}`}>
          {/* Two tones, as Polar's headlines: what it is, then where it grew from, quieter, in one breath. */}
          <h2 class="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-v2-text-text-base [text-wrap:balance]">
            {props.experiment.title}
            <Show when={parent()}>
              {(from) => (
                <span class="text-v2-text-text-faint">
                  {" "}
                  {language.t("research.page.from", { id: from().id, title: from().title })}
                </span>
              )}
            </Show>
          </h2>
          {/* Facts as one quiet line, parted by dots, as a Finder or Xcode inspector reads: status first, in its colour. */}
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-12-regular" data-slot="lab-page-facts">
            <span class={`inline-flex items-center gap-1.5 ${statusClass(run()?.status)}`}>
              <span class="size-1.5 rounded-full bg-current" />
              {run() ? language.t(`research.status.${run()?.status ?? "Queued"}`) : language.t("research.page.unrun")}
              <Show when={run() && (run()?.millis ?? 0) > 0}>
                <span class="tabular-nums">{duration(run()?.millis ?? 0)}</span>
              </Show>
            </span>
            <span class="text-v2-text-text-faint">·</span>
            <span class="min-w-0 truncate font-mono text-[11px] text-v2-text-text-muted">
              {props.experiment.branch}
            </span>
            <Show when={props.experiment.commit}>
              <span class="text-v2-text-text-faint">·</span>
              <span class="font-mono text-[11px] text-v2-text-text-faint">{props.experiment.commit.slice(0, 7)}</span>
            </Show>
            <Show when={props.experiment.kept}>
              <span class="text-v2-text-text-faint">·</span>
              <span class="text-v2-text-text-muted">{language.t("research.page.kept")}</span>
            </Show>
          </div>
          <div class="flex flex-wrap gap-1.5" data-slot="lab-actions">
            <Button size="small" variant="contrast" onClick={() => props.onAct("run", id())}>
              {language.t("research.action.rerun")}
              <kbd class="ms-1.5 font-mono text-[10px] opacity-55">R</kbd>
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => props.onAct(props.experiment.kept ? "unkeep" : "keep", id())}
            >
              {language.t(props.experiment.kept ? "research.action.unkeep" : "research.action.keep")}
              <kbd class="ms-1.5 font-mono text-[10px] text-v2-text-text-faint">K</kbd>
            </Button>
            <Show when={live(props.experiment)}>
              <Button size="small" variant="ghost" onClick={() => props.onAct("cancel", id())}>
                {language.t("research.action.stop")}
                <kbd class="ms-1.5 font-mono text-[10px] text-v2-text-text-faint">S</kbd>
              </Button>
            </Show>
          </div>
          <div
            class={`${READINGS} grid-cols-[1.5fr_1fr_1fr_0.7fr] border-t border-v2-border-border-muted pt-3`}
            data-slot="lab-readings"
          >
            <Tile label={props.study?.metric ?? language.t("research.study.metric")} live={going()} large>
              <span class="text-v2-text-text-base">{value() !== undefined ? figure(value() ?? 0) : "—"}</span>
              <Show when={going()}>
                <span class="basis-full font-sans text-[11px] leading-4 text-v2-state-fg-success">
                  {language.t("research.page.live")}
                </span>
              </Show>
            </Tile>
            <Tile label={language.t("research.page.vsParent")}>
              <Reading
                change={change(parent())}
                under={parent() ? `#${parent()?.id}` : language.t("research.page.root")}
              />
            </Tile>
            <Tile label={language.t("research.page.vsBaseline")}>
              <Reading change={change(root())} under={root() ? `#${root()?.id}` : undefined} />
            </Tile>
            <Tile label={language.t("research.page.runs")}>
              <span class="text-v2-text-text-base">{props.experiment.runs.length}</span>
              <Show when={run()}>
                {(last) => (
                  <span class="basis-full font-sans text-[11px] leading-4 text-v2-text-text-faint">
                    #{last().number}
                  </span>
                )}
              </Show>
            </Tile>
          </div>
        </div>
        <Tabs
          value={props.tab}
          onChange={(next: string) => props.onTab(TABS.find((tab) => tab === next) ?? "overview")}
          variant="line"
          class="!h-auto sticky top-0 z-10 shrink-0"
          data-lab-bar
          data-slot="lab-page-tabs"
        >
          <Tabs.List class={`!h-9 !gap-3 ${EDGE}`}>
            <For each={TABS}>
              {(tab) => <Tabs.Trigger value={tab}>{language.t(`research.tab.${tab}`)}</Tabs.Trigger>}
            </For>
          </Tabs.List>
        </Tabs>
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

/** A change as a reading: its words coloured by whether it helped, and what it is measured against. */
function Reading(props: { change: { words: string; sign: number } | undefined; under?: string }) {
  return (
    <>
      <span
        classList={{
          "text-v2-state-fg-success": (props.change?.sign ?? 0) > 0,
          "text-v2-state-fg-danger": (props.change?.sign ?? 0) < 0,
          "text-v2-text-text-faint": !props.change || props.change.sign === 0,
        }}
      >
        {props.change?.words ?? "—"}
      </span>
      <Show when={props.under}>
        <span class="basis-full font-sans text-[11px] leading-4 text-v2-text-text-faint">{props.under}</span>
      </Show>
    </>
  )
}

function Overview(props: LabPageProps) {
  const language = useLanguage()
  const direction = () => props.study?.direction ?? "Higher"
  const parent = () => props.all.find((other) => other.id === props.experiment.parent)
  const current = () => plotted(props.experiment)

  return (
    <div class={`flex flex-col gap-6 pb-6 pt-4 ${EDGE}`}>
      <Show when={current()}>
        {(run) => (
          <div data-slot="lab-overview-chart">
            <div class="flex items-baseline justify-between gap-3 pb-1">
              <span class="text-12-medium text-v2-text-text-muted">{language.t("research.page.curve")}</span>
              <span class="truncate font-mono text-[11px] text-v2-text-text-faint">
                {props.study?.metric} · {language.t("research.page.ofRun", { run: run().number })}
              </span>
            </div>
            <LabChart
              points={run().points}
              parent={plotted(parent())?.points}
              parentName={parent() ? `#${parent()?.id}` : undefined}
              target={props.study?.target}
              direction={direction()}
              live={run().status === "Running"}
              failed={run().status === "Failed" || run().status === "Lost"}
              metric={`#${props.experiment.id}`}
              height={210}
              peak={run().status === "Succeeded" || run().status === "Running"}
            />
          </div>
        )}
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
          <code class="block overflow-x-auto whitespace-pre rounded-[8px] bg-v2-background-bg-layer-02 px-2.5 py-2 text-12-mono text-v2-text-text-base">
            <span class="select-none text-v2-text-text-faint">$ </span>
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
        {(error) => (
          <div class="rounded-[8px] bg-v2-state-bg-danger px-2.5 py-2 text-12-mono text-v2-state-fg-danger [overflow-wrap:anywhere]">
            {error()}
          </div>
        )}
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

/**
 * Every curve this experiment's runs printed: the latest large against its parent's, then each run as its own small
 * chart, so a rerun reads as a control beside the first.
 */
function Training(props: { experiment: Experiment; parent: Experiment | undefined; study: Study | null }) {
  const language = useLanguage()
  const direction = () => props.study?.direction ?? "Higher"
  const run = () => plotted(props.experiment)
  const runs = () => props.experiment.runs.filter((each) => each.points.length > 1)

  return (
    <Show
      when={run()}
      fallback={<Notice body={language.t("research.training.empty", { metric: props.study?.metric ?? "metric" })} />}
    >
      {(current) => (
        <div class={`flex flex-col gap-6 pb-6 pt-4 ${EDGE}`} data-slot="lab-training">
          <div>
            <div class="flex items-baseline justify-between gap-3 pb-1">
              <span class="truncate font-mono text-[12px] text-v2-text-text-base">{props.study?.metric}</span>
              <div class="flex shrink-0 items-center gap-3 text-[11px] text-v2-text-text-muted">
                <span class="flex items-center gap-1.5">
                  <span class="h-[1.5px] w-4 rounded-full bg-v2-text-text-base" />#{props.experiment.id}
                </span>
                <Show when={plotted(props.parent)}>
                  <span class="flex items-center gap-1.5">
                    <span class="w-4 border-t border-dashed border-v2-text-text-faint" />
                    {language.t("research.training.parent", { id: props.parent?.id ?? 0 })}
                  </span>
                </Show>
              </div>
            </div>
            <LabChart
              points={current().points}
              parent={plotted(props.parent)?.points}
              parentName={props.parent ? `#${props.parent.id}` : undefined}
              target={props.study?.target}
              direction={direction()}
              live={current().status === "Running"}
              failed={current().status === "Failed" || current().status === "Lost"}
              metric={`#${props.experiment.id}`}
              height={280}
              peak={current().status === "Succeeded" || current().status === "Running"}
            />
            <div class="pt-1 text-[11px] text-v2-text-text-faint">
              {language.t("research.training.points", { count: current().points.length, run: current().number })}
            </div>
          </div>
          <Show when={runs().length > 1}>
            <div>
              <Label>{language.t("research.training.runs")}</Label>
              <div class="grid grid-cols-1 gap-x-4 gap-y-3 @[460px]:grid-cols-2">
                <For each={runs()}>
                  {(each) => (
                    <div class="border-t border-v2-border-border-muted pt-2">
                      <div class="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                        <span class="text-v2-text-text-faint">#{each.number}</span>
                        <span class={each.status === "Running" ? "text-v2-state-fg-success" : "text-v2-text-text-base"}>
                          {each.value !== null ? figure(each.value) : ""}
                        </span>
                      </div>
                      <LabChart
                        points={each.points}
                        target={props.study?.target}
                        direction={direction()}
                        live={each.status === "Running"}
                        failed={each.status === "Failed" || each.status === "Lost"}
                        metric={`#${each.number}`}
                        height={110}
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
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

  // Numbers carry a log: they take the base ink, the words around them stay quiet.
  const lines = createMemo(() =>
    (text() ?? "")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) =>
        line
          .split(/(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i)
          .filter((part) => part !== "")
          .map((part) => ({ text: part, number: /^-?\d/.test(part) })),
      ),
  )

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
          class={`grid grid-cols-[auto_1fr] gap-x-3 py-3 text-12-mono text-v2-text-text-faint ${EDGE}`}
          data-slot="lab-log"
        >
          <For each={lines()}>
            {(line, index) => (
              <>
                <span class="select-none text-end tabular-nums opacity-60">{index() + 1}</span>
                <span class="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  <For each={line}>
                    {(part) => <span classList={{ "text-v2-text-text-base": part.number }}>{part.text}</span>}
                  </For>
                  <Show when={live(props.experiment) && index() === lines().length - 1}>
                    <span class="ms-1 inline-block h-3 w-1.5 translate-y-0.5 bg-v2-state-fg-success" />
                  </Show>
                </span>
              </>
            )}
          </For>
        </pre>
      </Match>
    </Switch>
  )
}
