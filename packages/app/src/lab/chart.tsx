import { createMemo, createSignal, For, Show } from "solid-js"
import { createElementSize } from "@solid-primitives/resize-observer"
import type { Direction } from "./model"
import { figure, ticks } from "./model"
import "./lab.css"

/** Space for the value labels at the left and the step labels below, in pixels. */
const LEFT = 44

const RIGHT = 14

const TOP = 18

const BOTTOM = 24

export type ChartProps = {
  /** The experiment's values in the order its run printed them. */
  points: readonly number[]
  /** The parent's latest curve, dashed behind it. */
  parent?: readonly number[]
  target?: number | null
  direction: Direction
  /** A live run: its newest value breathes in green. */
  live?: boolean
  /** A run that failed: its last value is marked in the failure colour. */
  failed?: boolean
  height: number
  /** Names the curve in the hover readout. */
  metric: string
  /** Names the parent in the hover readout. */
  parentName?: string
  /** Annotates the best value the run printed; a run that did not finish has no peak worth naming. */
  peak?: boolean
}

/**
 * One metric along a run, drawn the way ArkenOS draws its traces: a lit line with a faint field under it, the parent
 * dashed, the target as a dashed rule, the best value called out, and a crosshair that reads every series at the
 * pointer. Monochrome: green marks only a live run's newest value.
 */
export function LabChart(props: ChartProps) {
  const [box, setBox] = createSignal<HTMLDivElement>()
  const size = createElementSize(box)
  const [hover, setHover] = createSignal<number>()

  const width = () => Math.max(size.width ?? 0, LEFT + RIGHT + 40)

  const scale = createMemo(() => {
    const values = [...props.points, ...(props.parent ?? []), ...(props.target != null ? [props.target] : [])]
    const low = Math.min(...values)
    const high = Math.max(...values)
    // A flat curve gets a band, so it draws across the middle instead of along an edge.
    const pad = high === low ? Math.abs(high) * 0.05 || 1 : (high - low) * 0.1
    const steps = Math.max(props.points.length, props.parent?.length ?? 0, 2) - 1

    return { low: low - pad, high: high + pad, steps }
  })

  const x = (index: number) => LEFT + (index / scale().steps) * (width() - LEFT - RIGHT)

  const y = (value: number) =>
    TOP + (1 - (value - scale().low) / (scale().high - scale().low)) * (props.height - TOP - BOTTOM)

  const line = (points: readonly number[]) =>
    points.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("")

  // A small chart is a glance: two values on its axis and no words on its target.
  const small = () => props.height < 150
  const valueTicks = createMemo(() => ticks(scale().low, scale().high, small() ? 2 : 4))
  const stepTicks = createMemo(() => ticks(0, scale().steps, Math.max(2, Math.floor((width() - LEFT) / 90))))

  const peak = createMemo(() => {
    if (!props.peak || props.points.length < 3) return

    const index = props.points.reduce(
      (held, value, at) =>
        (props.direction === "Higher" ? value > (props.points[held] ?? value) : value < (props.points[held] ?? value))
          ? at
          : held,
      0,
    )

    const value = props.points[index]

    return value === undefined ? undefined : { index, value }
  })

  const end = () => {
    const value = props.points.at(-1)

    return value === undefined ? undefined : { index: props.points.length - 1, value }
  }

  const onMove = (event: PointerEvent) => {
    const rect = box()?.getBoundingClientRect()

    if (!rect) return
    const along = (event.clientX - rect.left - LEFT) / (width() - LEFT - RIGHT)

    setHover(along < -0.02 || along > 1.02 ? undefined : Math.round(Math.min(1, Math.max(0, along)) * scale().steps))
  }

  // The readout's side flips past the middle, so it never runs off the chart.
  const readout = createMemo(() => {
    const index = hover()

    if (index === undefined) return
    const value = props.points[index]
    const before = props.parent?.[index]

    return { index, value, before, left: x(index), flip: x(index) > width() / 2 }
  })

  return (
    <div ref={setBox} class="relative w-full select-none" style={{ height: `${props.height}px` }} data-slot="lab-chart">
      <Show when={size.width}>
        <svg
          class="absolute inset-0 overflow-visible"
          width={width()}
          height={props.height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
          aria-hidden="true"
        >
          <For each={valueTicks()}>
            {(tick) => (
              <>
                <line
                  x1={LEFT}
                  x2={width() - RIGHT}
                  y1={y(tick)}
                  y2={y(tick)}
                  class="stroke-v2-border-border-muted"
                  stroke-width="1"
                />
                <text
                  x={LEFT - 8}
                  y={y(tick)}
                  dy="0.32em"
                  text-anchor="end"
                  class="fill-v2-text-text-faint text-[10px] tabular-nums"
                >
                  {figure(tick)}
                </text>
              </>
            )}
          </For>
          <For each={stepTicks()}>
            {(tick) => (
              <text
                x={x(tick)}
                y={props.height - 6}
                text-anchor="middle"
                class="fill-v2-text-text-faint text-[10px] tabular-nums"
              >
                {tick}
              </text>
            )}
          </For>
          <Show when={props.target != null}>
            <line
              x1={LEFT}
              x2={width() - RIGHT}
              y1={y(props.target ?? 0)}
              y2={y(props.target ?? 0)}
              stroke-dasharray="5 4"
              stroke-width="1"
              class="stroke-v2-text-text-faint"
            />
            <text
              display={small() ? "none" : undefined}
              x={LEFT + 6}
              y={y(props.target ?? 0) - 6}
              text-anchor="start"
              class="fill-v2-text-text-faint text-[10px] tabular-nums"
            >
              target {figure(props.target ?? 0)}
            </text>
          </Show>
          <Show when={props.parent && props.parent.length > 1}>
            <path
              d={line(props.parent ?? [])}
              fill="none"
              stroke-width="1.25"
              stroke-dasharray="4 3"
              class="stroke-v2-text-text-faint"
            />
          </Show>
          <path
            d={line(props.points)}
            fill="none"
            stroke-width="1.75"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="stroke-v2-text-text-base"
          />
          <Show when={peak()}>
            {(top) => (
              <g>
                <line
                  x1={x(top().index)}
                  x2={x(top().index)}
                  y1={y(top().value)}
                  y2={TOP - 4}
                  class="stroke-v2-text-text-faint"
                  stroke-width="1"
                />
                <circle cx={x(top().index)} cy={y(top().value)} r="3" class="fill-v2-text-text-base" />
                <text
                  x={x(top().index) + (x(top().index) > width() * 0.7 ? -6 : 6)}
                  y={TOP + 4}
                  text-anchor={x(top().index) > width() * 0.7 ? "end" : "start"}
                  class="fill-v2-text-text-base text-[10px] font-medium tabular-nums"
                >
                  {figure(top().value)}
                  <tspan class="fill-v2-text-text-faint"> peak @ {top().index}</tspan>
                </text>
              </g>
            )}
          </Show>
          <Show when={end()}>
            {(last) => (
              <g>
                <Show when={props.live}>
                  <circle
                    cx={x(last().index)}
                    cy={y(last().value)}
                    r="3.5"
                    class="fill-v2-state-fg-success"
                    data-lab-pulse
                  />
                </Show>
                <circle
                  cx={x(last().index)}
                  cy={y(last().value)}
                  r="3.5"
                  class={
                    props.live
                      ? "fill-v2-state-fg-success"
                      : props.failed
                        ? "fill-v2-state-fg-danger"
                        : "fill-v2-text-text-base"
                  }
                />
              </g>
            )}
          </Show>
          <Show when={readout()}>
            {(at) => (
              <g pointer-events="none">
                <line
                  x1={at().left}
                  x2={at().left}
                  y1={TOP}
                  y2={props.height - BOTTOM}
                  class="stroke-v2-border-border-strong"
                  stroke-width="1"
                />
                <Show when={at().before !== undefined}>
                  <circle cx={at().left} cy={y(at().before ?? 0)} r="2.5" class="fill-v2-text-text-faint" />
                </Show>
                <Show when={at().value !== undefined}>
                  <circle
                    cx={at().left}
                    cy={y(at().value ?? 0)}
                    r="3.5"
                    class="fill-v2-background-bg-base stroke-v2-text-text-base"
                    stroke-width="1.5"
                  />
                </Show>
              </g>
            )}
          </Show>
        </svg>
        <Show when={readout()}>
          {(at) => (
            <div
              class="pointer-events-none absolute top-1 z-10 flex min-w-32 flex-col gap-0.5 rounded-[8px] border-[0.5px] border-v2-border-border-base bg-v2-background-bg-base px-2.5 py-1.5 shadow-[var(--v2-elevation-floating)]"
              style={{
                left: at().flip ? undefined : `${at().left + 10}px`,
                right: at().flip ? `${width() - at().left + 10}px` : undefined,
              }}
              data-slot="lab-chart-readout"
            >
              <span class="text-[11px] tabular-nums text-v2-text-text-faint">step {at().index}</span>
              <Show when={at().value !== undefined}>
                <span class="flex items-baseline justify-between gap-4 text-12-regular text-v2-text-text-muted">
                  {props.metric}
                  <span class="tabular-nums text-v2-text-text-base">{figure(at().value ?? 0)}</span>
                </span>
              </Show>
              <Show when={at().before !== undefined}>
                <span class="flex items-baseline justify-between gap-4 text-12-regular text-v2-text-text-faint">
                  {props.parentName ?? "parent"}
                  <span class="tabular-nums">{figure(at().before ?? 0)}</span>
                </span>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}
