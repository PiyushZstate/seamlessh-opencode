import { Show, type JSX } from "solid-js"
import "./lab.css"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import { Tooltip } from "@opencode/ui/tooltip"
import type { RunStatus } from "./contract"

/*
 * The Lab's type and grid. Every block keeps one 12px inline edge, so the goal, the tree's nodes, the page's title and
 * every right-aligned number share vertical lines. 14px medium names things, 13px on the compact 16px line reads rows,
 * 12px carries meta, and every number is the code font with tabular figures so columns hold still while a run writes.
 */
export const EDGE = "px-3"

export const ROW_TEXT = "text-[13px] leading-[var(--line-height-compact)]"

export const FIGURES = "text-12-mono tabular-nums"

/** Colour means state: green is live, warning is waiting, danger is failure, grey is everything else. */
export function statusClass(status: RunStatus | undefined) {
  if (status === "Running") return "text-v2-state-fg-success"

  if (status === "Queued") return "text-v2-state-fg-warning"

  if (status === "Failed" || status === "Lost") return "text-v2-state-fg-danger"

  return "text-v2-text-text-faint"
}

/** A column's 48px head, the height of the session header, so the tree's and page's titles sit on the chat's line. */
export function ColumnHead(props: { children: JSX.Element; close: string; onClose: () => void; reserve?: boolean }) {
  return (
    <div
      class={`flex h-12 shrink-0 items-center gap-2 ${EDGE}`}
      // The session's header toggles float over the last column's end; its head leaves them room.
      classList={{ "pe-24": props.reserve, "pe-1.5": !props.reserve }}
      data-slot="lab-column-head"
    >
      <div class="flex min-w-0 flex-1 items-baseline gap-2">{props.children}</div>
      <Tooltip value={props.close} placement="bottom">
        <IconButton
          icon={<Icon name="close" />}
          variant="ghost-muted"
          size="normal"
          aria-label={props.close}
          onClick={() => props.onClose()}
        />
      </Tooltip>
    </div>
  )
}

/** The node at a row's start: hollow before a value, green while running, danger when it failed, ringed when kept. */
export function Node(props: { status: RunStatus | undefined; hasValue: boolean; best: boolean; kept: boolean }) {
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

export function Notice(props: { title?: string; body: string; children?: JSX.Element }) {
  return (
    <div class={`flex flex-col gap-1 py-4 ${EDGE}`} data-slot="lab-notice">
      <Show when={props.title}>
        <div class="text-14-medium text-v2-text-text-base">{props.title}</div>
      </Show>
      <div class="max-w-[52ch] text-12-regular text-v2-text-text-muted [text-wrap:pretty]">{props.body}</div>
      <Show when={props.children}>
        <div class="pt-2">{props.children}</div>
      </Show>
    </div>
  )
}

/** A small label over its section, in the muted 12px the session's side panels use. */
export function Label(props: { children: JSX.Element }) {
  return <div class="pb-1 text-12-medium text-v2-text-text-muted">{props.children}</div>
}

/** A reading: its label, then its figures in the code face, on the raised layer with a hairline. */
export function Tile(props: { label: string; live?: boolean; children: JSX.Element }) {
  return (
    <div
      class="flex min-w-0 flex-col rounded-[10px] border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-2"
      data-slot="lab-tile"
    >
      <span class="flex items-center gap-1.5 truncate text-[11px] leading-4 text-v2-text-text-faint">
        <Show when={props.live}>
          <span class="relative flex size-1.5">
            <span class="absolute inset-0 rounded-full bg-v2-state-fg-success" data-lab-pulse />
            <span class="relative size-1.5 rounded-full bg-v2-state-fg-success" />
          </span>
        </Show>
        {props.label}
      </span>
      <span class={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-mono text-[15px] leading-6 tabular-nums`}>
        {props.children}
      </span>
    </div>
  )
}

/** A study parameter as a quiet pill, as ArkenOS lists a design's inputs under its title. */
export function Chip(props: { mono?: boolean; children: JSX.Element }) {
  return (
    <span
      class="inline-flex h-5 max-w-full items-center truncate rounded-[6px] border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-01 px-1.5 text-[11px] text-v2-text-text-muted"
      classList={{ "font-mono tabular-nums": props.mono }}
    >
      {props.children}
    </span>
  )
}
