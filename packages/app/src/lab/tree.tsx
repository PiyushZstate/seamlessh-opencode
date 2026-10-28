import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useLanguage } from "@/runtime/i18n/language"
import type { Experiment, Snapshot, Study } from "./contract"
import { best, duration, figure, reached, rows, valueOf, type Row } from "./model"
import { LabMap } from "./map"
import { Chip, ColumnHead, EDGE, FIGURES, Node, Notice, ROW_TEXT, statusClass, Tile } from "./parts"
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
        {(study) => (
          <>
            <Strip study={study()} all={props.snapshot.experiments} running={props.running} />
            <Show when={lines().length > 0}>
              <LabMap
                study={study()}
                all={props.snapshot.experiments}
                picked={props.picked}
                onPick={props.onPick}
                height={MAP_HEIGHT}
              />
            </Show>
          </>
        )}
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

/** The map's height: tall enough that a few points of accuracy read as a climb. */
const MAP_HEIGHT = 280

/**
 * The goal as the column's headline, then three tiles read across, as ArkenOS's readings are: the best value and
 * where it stands against the target, the target itself, and the run going now.
 */
function Strip(props: { study: Study; all: readonly Experiment[]; running: Experiment | undefined }) {
  const language = useLanguage()
  const top = createMemo(() => best(props.all, props.study.direction))

  const value = () => {
    const experiment = top()

    return experiment && valueOf(experiment)
  }

  const met = () => reached(props.study, props.all)
  const run = () => props.running?.runs.findLast((each) => each.status === "Running" || each.status === "Queued")

  // How far the best has come from the baseline toward the target, for the meter under it.
  const progress = createMemo(() => {
    const target = props.study.target
    const start = props.all.find((experiment) => experiment.parent === null)
    const from = start && valueOf(start)
    const now = value()

    if (target === null || from === undefined || now === undefined || target === from) return

    return Math.min(1, Math.max(0, (now - from) / (target - from)))
  })

  return (
    <div class={`flex shrink-0 flex-col gap-3 pb-3 ${EDGE}`} data-slot="lab-study">
      <Show when={props.study.goal.trim()}>
        <div class="line-clamp-3 text-14-medium text-v2-text-text-base [text-wrap:pretty]">
          {props.study.goal.trim()}
        </div>
      </Show>
      <div class="flex flex-wrap items-center gap-1.5">
        <Chip mono>{props.study.metric}</Chip>
        <Chip>{language.t(`research.direction.${props.study.direction}`)}</Chip>
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        <Tile label={language.t("research.study.best")}>
          <span class="text-v2-text-text-base">{value() !== undefined ? figure(value() ?? 0) : "—"}</span>
          <span class="text-v2-text-text-faint">{top() ? `#${top()?.id}` : ""}</span>
          <Show when={progress() !== undefined}>
            <span class="relative mt-1.5 block h-[3px] basis-full overflow-hidden rounded-full bg-v2-border-border-muted">
              <span
                class="absolute inset-y-0 left-0 rounded-full"
                classList={{ "bg-v2-state-fg-success": met(), "bg-v2-text-text-base": !met() }}
                style={{ width: `${(progress() ?? 0) * 100}%` }}
              />
            </span>
          </Show>
        </Tile>
        <Tile label={language.t("research.study.target")}>
          <span class="text-v2-text-text-base">{props.study.target !== null ? figure(props.study.target) : "—"}</span>
          <span
            class="basis-full font-sans text-[11px] leading-4"
            classList={{ "text-v2-state-fg-success": met(), "text-v2-text-text-faint": !met() }}
          >
            {met() ? language.t("research.study.reached") : language.t("research.study.open")}
          </span>
        </Tile>
        <Tile label={language.t("research.study.running")} live={run()?.status === "Running"}>
          <Show
            when={props.running}
            fallback={<span class="text-v2-text-text-faint">{language.t("research.study.idle")}</span>}
          >
            {(experiment) => (
              <>
                <span class="text-v2-text-text-base">#{experiment().id}</span>
                <span class="text-v2-text-text-faint">
                  {run()?.status === "Running" ? duration(run()?.millis ?? 0) : language.t("research.status.Queued")}
                </span>
              </>
            )}
          </Show>
        </Tile>
      </div>
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
        class={`w-[4.5rem] shrink-0 text-end ${FIGURES}`}
        classList={{
          "text-v2-text-text-base": props.line.value !== undefined,
          [statusClass(status())]: props.line.value === undefined,
        }}
      >
        {props.line.value !== undefined
          ? figure(props.line.value)
          : status()
            ? language.t(`research.status.${status() ?? "Queued"}`)
            : "—"}
      </span>
    </button>
  )
}
