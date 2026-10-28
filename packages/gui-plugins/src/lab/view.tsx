import { createMemo, For, Match, Show, Switch, type JSX } from "solid-js"
import { Button } from "@opencode/ui/button"
import type { Experiment, RunStatus, Snapshot, Study, Verb } from "./contract"
import type en from "./i18n/en"
import { best, duration, figure, live, picked, reached, rows, valueOf, type Row } from "./model"

export type LabText = (key: keyof typeof en, params?: Record<string, string | number>) => string

/** What the panel has to show: the host's research, or why there is none. */
export type LabState =
  | { kind: "ready"; snapshot: Snapshot }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }

export type LabViewProps = {
  state: LabState
  /** The experiment the person picked in this session, if any. */
  pick: number | undefined
  onPick: (id: number) => void
  onAct: (verb: Verb, id: number) => void
  onRetry: () => void
  t: LabText
}

/*
 * Layout: every block keeps one 12px inline edge, so the goal, the tree's nodes, the detail's title and every right-
 * aligned number share two vertical lines. A tree row's hover wash reaches 6px past that edge, as OpenCode's lists do.
 * Type: 14px medium names things (goal, picked title), 13px on the compact 16px line reads rows, 12px carries meta, and
 * every number is the code font with tabular figures so columns hold still while a run writes.
 */
const EDGE = "px-3"

const ROW_TEXT = "text-[13px] leading-[var(--line-height-compact)]"

const FIGURES = "text-12-mono tabular-nums"

/**
 * The Experiments tab: the study, the tree, and the picked experiment with its runs (D24). Colour means state: the
 * success token is live or better, warning is queued, danger is failed or worse, everything else is grey.
 */
export function LabView(props: LabViewProps) {
  return (
    <div class="@container flex h-full min-h-0 w-full min-w-0 flex-col bg-v2-background-bg-base" data-slot="lab-panel">
      <Switch>
        <Match when={props.state.kind === "unavailable"}>
          <Notice title={props.t("unavailable.title")} body={props.t("unavailable.body")} />
        </Match>
        <Match when={props.state.kind === "error"}>
          <Notice title={props.t("error.title")} body={props.t("error.body")}>
            <Button size="small" variant="neutral" onClick={() => props.onRetry()}>
              {props.t("retry")}
            </Button>
          </Notice>
        </Match>
        <Match when={props.state.kind === "ready" && props.state.snapshot}>
          {(snapshot) => <Research snapshot={snapshot()} {...props} />}
        </Match>
      </Switch>
    </div>
  )
}

function Research(props: LabViewProps & { snapshot: Snapshot }) {
  const direction = () => props.snapshot.study?.direction ?? "Higher"
  const lines = createMemo(() => rows(props.snapshot.experiments, direction()))
  const shown = createMemo(() => picked(props.snapshot.experiments, direction(), props.pick))

  return (
    <>
      <Show when={props.snapshot.study}>
        {(study) => <StudyHead study={study()} all={props.snapshot.experiments} t={props.t} />}
      </Show>
      <Show
        when={lines().length > 0}
        fallback={<Notice title={props.t("empty.title")} body={props.t("empty.body")} />}
      >
        <div class="max-h-[50%] shrink-0 overflow-y-auto px-1.5 py-1.5" data-scrollable data-slot="lab-tree" role="listbox">
          <For each={lines()}>
            {(line) => (
              <TreeRow
                line={line}
                picked={shown()?.id === line.experiment.id}
                onPick={() => props.onPick(line.experiment.id)}
              />
            )}
          </For>
        </div>
        <Show when={shown()} keyed>
          {(experiment) => <Detail experiment={experiment} all={props.snapshot.experiments} {...props} />}
        </Show>
      </Show>
    </>
  )
}

/** The goal as the panel's headline, then its three numbers as labelled figures, read across. */
function StudyHead(props: { study: Study; all: readonly Experiment[]; t: LabText }) {
  const top = createMemo(() => best(props.all, props.study.direction))

  const value = () => {
    const experiment = top()

    return experiment && valueOf(experiment)
  }

  return (
    <div class={`flex shrink-0 flex-col gap-3 border-b border-v2-border-border-muted pb-3 pt-3 ${EDGE}`} data-slot="lab-study">
      <Show when={props.study.goal.trim()}>
        <div class="line-clamp-2 text-14-medium text-v2-text-text-base [text-wrap:pretty]">{props.study.goal.trim()}</div>
      </Show>
      <div class="grid grid-cols-3 gap-3">
        <Figure
          label={props.t("study.metricLabel")}
          value={props.study.metric}
          under={props.t(`direction.${props.study.direction}`)}
        />
        <Figure
          label={props.t("study.bestLabel")}
          value={value() !== undefined ? figure(value() ?? 0) : "—"}
          under={top() ? `#${top()?.id}` : undefined}
        />
        <Show when={props.study.target !== null}>
          <Figure
            label={props.t("study.targetLabel")}
            value={figure(props.study.target ?? 0)}
            under={reached(props.study, props.all) ? props.t("study.reached") : undefined}
            good={reached(props.study, props.all)}
          />
        </Show>
      </div>
    </div>
  )
}

function Figure(props: { label: string; value: string; under?: string; good?: boolean }) {
  return (
    <div class="flex min-w-0 flex-col">
      <span class="truncate text-12-regular text-v2-text-text-faint">{props.label}</span>
      <span class="truncate text-14-mono tabular-nums text-v2-text-text-base">{props.value}</span>
      <Show when={props.under}>
        <span
          class="text-12-regular [text-wrap:pretty]"
          classList={{ "text-v2-state-fg-success": props.good, "text-v2-text-text-faint": !props.good }}
        >
          {props.under}
        </span>
      </Show>
    </div>
  )
}

function TreeRow(props: { line: Row; picked: boolean; onPick: () => void }) {
  const status = () => props.line.experiment.runs.at(-1)?.status

  return (
    <button
      type="button"
      role="option"
      aria-selected={props.picked}
      class="flex h-7 w-full items-center gap-2 rounded-md pe-1.5 text-start hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-v2-background-bg-layer-02": props.picked }}
      // The node's slot starts on the panel's 12px edge at depth 0; each level steps 16px, one node and its gap.
      style={{ "padding-inline-start": `${6 + props.line.depth * 16}px` }}
      onClick={() => props.onPick()}
      data-slot="lab-row"
    >
      <Node status={status()} hasValue={props.line.value !== undefined} best={props.line.best} kept={props.line.experiment.kept} />
      <span
        class={`min-w-0 flex-1 truncate ${ROW_TEXT}`}
        classList={{
          "text-v2-text-text-base": props.picked || props.line.best,
          "text-v2-text-text-muted": !props.picked && !props.line.best,
        }}
      >
        {props.line.experiment.title}
      </span>
      <span
        class={`w-16 shrink-0 text-end ${FIGURES}`}
        classList={{
          "text-v2-state-fg-success": props.line.sign > 0,
          "text-v2-state-fg-danger": props.line.sign < 0,
          "text-v2-text-text-faint": props.line.sign === 0,
        }}
      >
        {props.line.delta ?? ""}
      </span>
            {/* A narrow panel gives the id's room to the title; the detail below still names it. */}
      <span class={`hidden w-8 shrink-0 text-end text-v2-text-text-faint @[400px]:block ${FIGURES}`}>
        #{props.line.experiment.id}
      </span>
      <span
        class={`w-16 shrink-0 text-end ${FIGURES}`}
        classList={{
          "text-v2-text-text-base": props.line.value !== undefined,
          [statusClass(status())]: props.line.value === undefined,
        }}
      >
        {props.line.value !== undefined ? figure(props.line.value) : (status()?.toLowerCase() ?? "—")}
      </span>
    </button>
  )
}

/** The node at a row's start: hollow before a value, filled green while running, danger when it failed, ringed when kept. */
function Node(props: { status: RunStatus | undefined; hasValue: boolean; best: boolean; kept: boolean }) {
  const dot = () => {
    if (props.status === "Running") return "bg-[var(--v2-state-fg-success)]"

    if (props.status === "Queued") return "border border-[var(--v2-state-fg-warning)]"

    if (props.status === "Failed" || props.status === "Lost") return "bg-[var(--v2-state-fg-danger)]"

    if (props.hasValue) return props.best ? "bg-v2-text-text-base" : "bg-v2-text-text-muted"

    return "border border-v2-text-text-faint"
  }

  return (
    <span
      class="flex size-3 shrink-0 items-center justify-center rounded-full"
      classList={{ "border border-v2-border-border-base": props.kept }}
    >
      <span class={`size-1.5 rounded-full ${dot()}`} />
    </span>
  )
}

function Detail(props: LabViewProps & { experiment: Experiment; all: readonly Experiment[] }) {
  const parent = () => props.all.find((other) => other.id === props.experiment.parent)
  const id = () => props.experiment.id

  return (
    <div
      class={`min-h-0 flex-1 overflow-y-auto border-t border-v2-border-border-muted pb-4 pt-3 ${EDGE}`}
      data-scrollable
      data-slot="lab-detail"
    >
      <div class="truncate text-14-medium text-v2-text-text-base">{props.experiment.title}</div>
      <div class="flex min-w-0 items-baseline gap-2">
        <span class="min-w-0 shrink truncate text-12-mono text-v2-text-text-faint">{props.experiment.branch}</span>
        <Show when={parent()}>
          {(from) => (
            <span class="min-w-0 truncate text-12-regular text-v2-text-text-muted">
              {props.t("detail.from", { id: from().id, title: from().title })}
            </span>
          )}
        </Show>
      </div>
      <Show when={props.experiment.note.trim()}>
        <p class="max-w-[65ch] whitespace-pre-wrap pt-2 text-14-regular text-v2-text-text-muted [text-wrap:pretty]">
          {props.experiment.note.trim()}
        </p>
      </Show>
      <div class="flex flex-wrap gap-1.5 pt-3" data-slot="lab-actions">
        <Button size="small" variant="contrast" onClick={() => props.onAct("run", id())}>
          {props.t("action.rerun")}
        </Button>
        <Button size="small" variant="ghost" onClick={() => props.onAct(props.experiment.kept ? "unkeep" : "keep", id())}>
          {props.t(props.experiment.kept ? "action.unkeep" : "action.keep")}
        </Button>
        <Show when={live(props.experiment)}>
          <Button size="small" variant="ghost" onClick={() => props.onAct("cancel", id())}>
            {props.t("action.stop")}
          </Button>
        </Show>
      </div>
      <Show when={props.experiment.runs.length > 0}>
        <div class="pb-1 pt-5 text-12-medium text-v2-text-text-muted">{props.t("detail.runs")}</div>
        <For each={props.experiment.runs.toReversed()}>
          {(run) => (
            // The same right-hand columns as the tree, so a run's value sits under the experiment's.
            <div class={`flex h-7 items-center gap-2 border-t border-v2-border-border-muted ${FIGURES}`} data-slot="lab-run">
              <span class="w-8 shrink-0 text-v2-text-text-faint">#{run.number}</span>
              <span class={`min-w-0 flex-1 truncate text-12-regular ${statusClass(run.status)}`}>
                {props.t(`status.${run.status}`)}
              </span>
              <span class="w-16 shrink-0 text-end text-v2-text-text-faint">{run.millis > 0 ? duration(run.millis) : ""}</span>
              <span class="w-16 shrink-0 text-end text-v2-text-text-base">{run.value !== null ? figure(run.value) : ""}</span>
            </div>
          )}
        </For>
      </Show>
      <Show when={valueOf(props.experiment) === undefined && props.experiment.runs.at(-1)?.error}>
        {(error) => <div class="pt-2 text-12-mono text-v2-state-fg-danger">{error()}</div>}
      </Show>
    </div>
  )
}

function Notice(props: { title: string; body: string; children?: JSX.Element }) {
  return (
    <div class={`flex flex-col gap-1 py-4 ${EDGE}`} data-slot="lab-notice">
      <div class="text-14-medium text-v2-text-text-base">{props.title}</div>
      <div class="max-w-[52ch] text-12-regular text-v2-text-text-muted [text-wrap:pretty]">{props.body}</div>
      <Show when={props.children}>
        <div class="pt-2">{props.children}</div>
      </Show>
    </div>
  )
}

function statusClass(status: RunStatus | undefined) {
  if (status === "Running") return "text-v2-state-fg-success"

  if (status === "Queued") return "text-v2-state-fg-warning"

  if (status === "Failed" || status === "Lost") return "text-v2-state-fg-danger"

  return "text-v2-text-text-faint"
}
