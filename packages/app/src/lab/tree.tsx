import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useLanguage } from "@/runtime/i18n/language"
import type { Experiment, Snapshot, Study } from "./contract"
import { best, figure, reached, rows, valueOf, type Row } from "./model"
import { ColumnHead, EDGE, FIGURES, Node, Notice, ROW_TEXT, statusClass } from "./parts"
import type { LabState } from "./state"

export type LabTreeProps = {
  state: LabState
  /** The experiment the page shows, if any. */
  picked: number | undefined
  /** The newest experiment with a live run, for the strip. */
  running: Experiment | undefined
  onPick: (id: number) => void
  onClose: () => void
  onRetry: () => void
  /** Leave room for the session's header toggles at the end of the head. */
  reserve?: boolean
}

/**
 * The Lab's tree column (D24): a strip with the study's goal, metric, best, target and running run, then the
 * experiment tree with each change against its parent. Picking a node opens the experiment page beside it.
 */
export function LabTree(props: LabTreeProps) {
  const language = useLanguage()
  const count = () => (props.state.kind === "ready" ? props.state.snapshot.experiments.length : 0)

  return (
    <div class="@container flex size-full min-h-0 min-w-0 flex-col" data-slot="lab-tree-column">
      <ColumnHead close={language.t("research.tree.close")} onClose={props.onClose} reserve={props.reserve}>
        <span class="truncate text-14-medium text-v2-text-text-base">{language.t("research.tree.title")}</span>
        <Show when={count() > 0}>
          <span class={`text-v2-text-text-faint ${FIGURES}`}>{count()}</span>
        </Show>
      </ColumnHead>
      <Switch>
        <Match when={props.state.kind === "error"}>
          <Notice title={language.t("research.error.title")} body={language.t("research.error.body")}>
            <Button size="small" variant="neutral" onClick={() => props.onRetry()}>
              {language.t("research.retry")}
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

function Research(props: LabTreeProps & { snapshot: Snapshot }) {
  const language = useLanguage()
  const direction = () => props.snapshot.study?.direction ?? "Higher"
  const lines = createMemo(() => rows(props.snapshot.experiments, direction()))

  return (
    <>
      <Show when={props.snapshot.study}>
        {(study) => <Strip study={study()} all={props.snapshot.experiments} running={props.running} />}
      </Show>
      <Show
        when={lines().length > 0}
        fallback={<Notice title={language.t("research.empty.title")} body={language.t("research.empty.body")} />}
      >
        <div
          class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-1.5"
          data-scrollable
          data-slot="lab-tree"
          role="listbox"
          aria-label={language.t("research.tree.title")}
        >
          <For each={lines()}>
            {(line) => (
              <TreeRow
                line={line}
                picked={props.picked === line.experiment.id}
                onPick={() => props.onPick(line.experiment.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </>
  )
}

/** The goal as the column's headline, its numbers as labelled figures read across, then the running run. */
function Strip(props: { study: Study; all: readonly Experiment[]; running: Experiment | undefined }) {
  const language = useLanguage()
  const top = createMemo(() => best(props.all, props.study.direction))

  const value = () => {
    const experiment = top()

    return experiment && valueOf(experiment)
  }

  const met = () => reached(props.study, props.all)

  return (
    <div class={`flex shrink-0 flex-col gap-3 border-b border-v2-border-border-muted pb-3 ${EDGE}`} data-slot="lab-study">
      <Show when={props.study.goal.trim()}>
        <div class="line-clamp-3 text-14-regular text-v2-text-text-base [text-wrap:pretty]">{props.study.goal.trim()}</div>
      </Show>
      <div class="grid grid-cols-3 gap-3">
        <Figure
          label={language.t("research.study.metric")}
          value={props.study.metric}
          under={language.t(`research.direction.${props.study.direction}`)}
        />
        <Figure
          label={language.t("research.study.best")}
          value={value() !== undefined ? figure(value() ?? 0) : "—"}
          under={top() ? `#${top()?.id}` : undefined}
        />
        <Show when={props.study.target !== null}>
          <Figure
            label={language.t("research.study.target")}
            value={figure(props.study.target ?? 0)}
            under={met() ? language.t("research.study.reached") : undefined}
            good={met()}
          />
        </Show>
      </div>
      <Show when={props.running}>
        {(experiment) => (
          <div class="flex min-w-0 items-baseline gap-2" data-slot="lab-study-running">
            <span class="shrink-0 text-12-regular text-v2-state-fg-success">{language.t("research.study.running")}</span>
            <span class={`min-w-0 truncate text-v2-text-text-base ${ROW_TEXT}`}>{experiment().title}</span>
            <span class={`shrink-0 text-v2-text-text-faint ${FIGURES}`}>#{experiment().id}</span>
          </div>
        )}
      </Show>
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
  const language = useLanguage()
  const status = () => props.line.experiment.runs.at(-1)?.status

  return (
    <button
      type="button"
      role="option"
      aria-selected={props.picked}
      class="relative flex h-7 w-full items-center gap-2 rounded-md pe-1.5 text-start hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-v2-background-bg-layer-02": props.picked }}
      // The node's slot starts on the column's 12px edge at depth 0; each level steps 16px, one node and its gap.
      style={{ "padding-inline-start": `${6 + props.line.depth * 16}px` }}
      onClick={() => props.onPick()}
      data-slot="lab-row"
    >
      <Node
        status={status()}
        hasValue={props.line.value !== undefined}
        best={props.line.best}
        kept={props.line.experiment.kept}
      />
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
      {/* A narrow column gives the id's room to the title; the page still names it. */}
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
        {props.line.value !== undefined ? figure(props.line.value) : (status() ? language.t(`research.status.${status() ?? "Queued"}`) : "—")}
      </span>
    </button>
  )
}
