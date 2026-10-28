import { createMemo, createSignal, For, Show } from "solid-js"
import { createElementSize } from "@solid-primitives/resize-observer"
import type { Experiment, Study } from "./contract"
import { ancestry, best, figure, rows, ticks, valueOf, type Row } from "./model"
import "./lab.css"

const LEFT = 40

const RIGHT = 40

const TOP = 28
/** The floor lane holds experiments with no value: failed, cancelled, or not yet run. */

const FLOOR = 30

type Place = {
  row: Row
  x: number
  y: number
  /** Where the value came from: a finished run, a live run's newest print, the parent's (queued), or none. */
  kind: "value" | "live" | "queued" | "floor"
  value: number | undefined
}

/**
 * The research map (D24, after ArkenOS's lab canvas): every experiment placed by when it was recorded and how well it
 * did, better always upward, joined to its parent. The path from the baseline to the best is lit, the target is a
 * dashed rule, and a live run breathes in green on its newest value.
 * Experiments with no value sit on the floor, marked by how they ended.
 */
export function LabMap(props: {
  study: Study
  all: readonly Experiment[]
  picked: number | undefined
  onPick: (id: number) => void
  height: number
}) {
  const [box, setBox] = createSignal<HTMLDivElement>()
  const size = createElementSize(box)
  const [hover, setHover] = createSignal<number>()
  const width = () => Math.max(size.width ?? 0, LEFT + RIGHT + 80)
  const higher = () => props.study.direction === "Higher"

  const lines = createMemo(() => rows(props.all, props.study.direction))
  const deepest = createMemo(() => Math.max(1, ...lines().map((line) => line.depth)))
  const top = createMemo(() => best(props.all, props.study.direction)?.id)
  const lit = createMemo(() => new Set(top() === undefined ? [] : ancestry(props.all, top() ?? 0)))

  const provisional = (experiment: Experiment) => {
    const run = experiment.runs.at(-1)

    if (run?.status === "Running") return run.points.at(-1) ?? run.value ?? undefined
  }

  const domain = createMemo(() => {
    const values = props.all.flatMap((experiment) => {
      const value = valueOf(experiment) ?? provisional(experiment)

      return value === undefined ? [] : [value]
    })

    const all = props.study.target !== null ? [...values, props.study.target] : values

    if (all.length === 0) return { low: 0, high: 1 }
    const low = Math.min(...all)
    const high = Math.max(...all)
    const pad = high === low ? Math.abs(high) * 0.05 || 1 : (high - low) * 0.14

    return { low: low - pad, high: high + pad }
  })

  // A generation per step across: the baseline at the left, each child one step right of its parent, so the climb
  // reads left to right and no edge runs backward.
  const x = (depth: number) => LEFT + (depth / deepest()) * (width() - LEFT - RIGHT)

  // Better is up in either direction: a lower-is-better metric draws its smallest values at the top.
  const y = (value: number) => {
    const share = (value - domain().low) / (domain().high - domain().low)

    return TOP + (higher() ? 1 - share : share) * (props.height - TOP - FLOOR - 14)
  }

  const floor = () => props.height - FLOOR / 2 - 4

  const places = createMemo(() => {
    const byId = new Map<number, Place>()

    lines().forEach((row) => {
      const experiment = row.experiment
      const last = experiment.runs.at(-1)
      const value = valueOf(experiment)
      const now = provisional(experiment)
      const parent = experiment.parent === null ? undefined : byId.get(experiment.parent)

      const place = (): Pick<Place, "kind" | "value" | "y"> => {
        if (last?.status === "Running" && now !== undefined) return { kind: "live", value: now, y: y(now) }

        if (value !== undefined) return { kind: "value", value, y: y(value) }

        if (last?.status === "Queued" && parent?.value !== undefined)
          return { kind: "queued", value: undefined, y: y(parent.value) }

        return { kind: "floor", value: undefined, y: floor() }
      }

      byId.set(experiment.id, { row, x: x(row.depth), ...place() })
    })

    // Two experiments of one generation with nearly the same value would sit on one spot: step the later aside.
    const spots: Place[] = []
    byId.forEach((place) => {
      const crowd = spots.filter((other) => Math.abs(other.x - place.x) < 12 && Math.abs(other.y - place.y) < 10).length
      place.x += crowd * 14
      spots.push(place)
    })

    return byId
  })

  const edges = createMemo(() =>
    [...places().values()].flatMap((child) => {
      const parent = child.row.experiment.parent === null ? undefined : places().get(child.row.experiment.parent)

      if (!parent) return []
      const bend = (child.x - parent.x) * 0.55
      const path = `M${parent.x},${parent.y}C${parent.x + bend},${parent.y} ${child.x - bend},${child.y} ${child.x},${child.y}`

      return [
        {
          id: child.row.experiment.id,
          path,
          lit: lit().has(child.row.experiment.id),
          live: child.kind === "live" || child.kind === "queued",
          down: child.kind === "floor",
        },
      ]
    }),
  )

  const valueTicks = createMemo(() => ticks(domain().low, domain().high, 3))

  // Called out by name: the best, every live run, the picked one and the one under the pointer.
  const callouts = createMemo(() => {
    const ids = new Set<number>()
    const add = (id: number | undefined) => id !== undefined && places().has(id) && ids.add(id)
    add(top())
    props.all
      .filter((experiment) => experiment.runs.at(-1)?.status === "Running")
      .forEach((experiment) => add(experiment.id))
    add(props.picked)
    add(hover())

    return place(
      [...ids].flatMap((id) => places().get(id) ?? []),
      [...places().values()],
      width(),
      props.height,
    )
  })

  return (
    <div
      ref={setBox}
      class="relative w-full shrink-0 overflow-hidden"
      style={{ height: `${props.height}px` }}
      data-slot="lab-map"
    >
      <Show when={size.width}>
        <svg class="absolute inset-0" width={width()} height={props.height} aria-hidden="true">
          <For each={valueTicks()}>
            {(tick) => (
              <text
                x={LEFT - 10}
                y={y(tick)}
                dy="0.32em"
                text-anchor="end"
                class="fill-v2-text-text-faint text-[10px] tabular-nums"
              >
                {figure(tick)}
              </text>
            )}
          </For>
          <line
            x1={LEFT - 4}
            x2={width() - 8}
            y1={props.height - FLOOR - 2}
            y2={props.height - FLOOR - 2}
            class="stroke-v2-border-border-muted"
          />
          <text
            x={LEFT - 10}
            y={props.height - FLOOR / 2 - 4}
            dy="0.32em"
            text-anchor="end"
            class="fill-v2-text-text-faint text-[10px]"
          >
            none
          </text>
          <Show when={props.study.target !== null}>
            <line
              x1={LEFT - 4}
              x2={width() - 8}
              y1={y(props.study.target ?? 0)}
              y2={y(props.study.target ?? 0)}
              stroke-dasharray="5 4"
              class="stroke-v2-text-text-faint"
            />
            <text
              x={LEFT}
              y={y(props.study.target ?? 0) - 6}
              text-anchor="start"
              class="fill-v2-text-text-faint text-[10px] tabular-nums"
            >
              target {figure(props.study.target ?? 0)}
            </text>
          </Show>
          <For each={callouts()}>
            {(card) => {
              // From the node to the card's nearest edge, so a card set aside still points at its node.
              const toX = () => Math.min(Math.max(card.place.x, card.left), card.left + CARD_W)
              const toY = () => Math.min(Math.max(card.place.y, card.top), card.top + CARD_H)

              return (
                <line
                  x1={card.place.x}
                  y1={card.place.y}
                  x2={toX()}
                  y2={toY()}
                  class="stroke-v2-border-border-strong"
                  stroke-width="1"
                />
              )
            }}
          </For>
          <For each={edges()}>
            {(edge, index) => (
              <path
                d={edge.path}
                fill="none"
                stroke-linecap="round"
                stroke-width={edge.lit ? 1.5 : 1}
                class={
                  edge.live
                    ? "stroke-v2-state-fg-success"
                    : edge.lit
                      ? "stroke-v2-text-text-base"
                      : "stroke-v2-border-border-strong"
                }
                opacity={edge.down ? 0.5 : edge.lit || edge.live ? 0.9 : 0.8}
                // Still running: dashed, as a value not yet settled.
                stroke-dasharray={edge.live ? "3 3" : undefined}
              />
            )}
          </For>
          <For each={[...places().values()]}>
            {(place) => (
              <Node
                place={place}
                best={place.row.experiment.id === top()}
                picked={place.row.experiment.id === props.picked}
              />
            )}
          </For>
        </svg>
        {/* Hit targets over the nodes: buttons, so the map is reachable by keyboard as the list is. */}
        <For each={[...places().values()]}>
          {(place) => (
            <button
              type="button"
              class="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-v2-border-border-focus"
              style={{ left: `${place.x}px`, top: `${place.y}px` }}
              aria-label={`#${place.row.experiment.id} ${place.row.experiment.title}`}
              aria-pressed={place.row.experiment.id === props.picked}
              onPointerEnter={() => setHover(place.row.experiment.id)}
              onPointerLeave={() => setHover(undefined)}
              onFocus={() => setHover(place.row.experiment.id)}
              onBlur={() => setHover(undefined)}
              onClick={() => props.onPick(place.row.experiment.id)}
              data-slot="lab-map-node"
            />
          )}
        </For>
        <For each={callouts()}>
          {(card) => (
            <Callout
              place={card.place}
              left={card.left}
              top={card.top}
              best={card.place.row.experiment.id === top()}
              picked={card.place.row.experiment.id === props.picked}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

function Node(props: { place: Place; best: boolean; picked: boolean }) {
  const status = () => props.place.row.experiment.runs.at(-1)?.status
  const failed = () => status() === "Failed" || status() === "Lost"

  return (
    <g>
      <Show when={props.picked}>
        <circle
          cx={props.place.x}
          cy={props.place.y}
          r="9.5"
          fill="none"
          class="stroke-v2-text-text-base"
          stroke-width="1.25"
        />
      </Show>
      <Show when={props.place.row.experiment.kept && !props.picked}>
        <circle
          cx={props.place.x}
          cy={props.place.y}
          r="8"
          fill="none"
          class="stroke-v2-border-border-strong"
          stroke-width="1"
        />
      </Show>
      <Show when={props.place.kind === "live"}>
        <circle cx={props.place.x} cy={props.place.y} r="4.5" class="fill-v2-state-fg-success" data-lab-pulse />
        <circle cx={props.place.x} cy={props.place.y} r="4.5" class="fill-v2-state-fg-success" />
      </Show>
      <Show when={props.place.kind === "queued"}>
        <circle
          cx={props.place.x}
          cy={props.place.y}
          r="4"
          class="fill-v2-background-bg-base stroke-v2-state-fg-warning"
          stroke-width="1.25"
          stroke-dasharray="2 2"
        />
      </Show>
      <Show when={props.place.kind === "value"}>
        <circle
          cx={props.place.x}
          cy={props.place.y}
          r={props.best ? 5.5 : 4}
          class={props.best || props.picked ? "fill-v2-text-text-base" : "fill-v2-text-text-muted"}
        />
      </Show>
      <Show when={props.place.kind === "floor"}>
        <Show
          when={failed()}
          fallback={
            <circle
              cx={props.place.x}
              cy={props.place.y}
              r="3.5"
              fill="none"
              class="stroke-v2-text-text-faint"
              stroke-width="1.25"
            />
          }
        >
          <path
            d={`M${props.place.x - 3.5},${props.place.y - 3.5}L${props.place.x + 3.5},${props.place.y + 3.5}M${props.place.x + 3.5},${props.place.y - 3.5}L${props.place.x - 3.5},${props.place.y + 3.5}`}
            class="stroke-v2-state-fg-danger"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </Show>
      </Show>
    </g>
  )
}

/** A node's name card, as ArkenOS pins its readings to the model: id and title, then the value and the change. */
function Callout(props: { place: Place; left: number; top: number; best: boolean; picked: boolean }) {
  const experiment = () => props.place.row.experiment

  const tone = () => {
    if (props.place.kind === "live") return "text-v2-state-fg-success"

    if (props.place.row.sign > 0) return "text-v2-state-fg-success"

    if (props.place.row.sign < 0) return "text-v2-state-fg-danger"

    return "text-v2-text-text-faint"
  }

  return (
    <div
      class="pointer-events-none absolute z-10 flex flex-col rounded-[8px] border-[0.5px] bg-v2-background-bg-base px-2 py-1 shadow-[var(--v2-elevation-floating)]"
      classList={{
        "border-v2-border-border-strong": props.picked,
        "border-v2-border-border-base": !props.picked,
      }}
      style={{ left: `${props.left}px`, top: `${props.top}px`, width: `${CARD_W}px` }}
      data-slot="lab-map-callout"
    >
      <span class="flex min-w-0 items-baseline gap-1.5 text-[11px] leading-4">
        <span class="shrink-0 tabular-nums text-v2-text-text-faint">#{experiment().id}</span>
        <span class="min-w-0 truncate text-v2-text-text-base">{experiment().title}</span>
      </span>
      <span class="flex items-baseline gap-2 text-[11px] leading-4 tabular-nums">
        <Show
          when={props.place.value !== undefined}
          fallback={
            <span class="text-v2-text-text-faint">{experiment().runs.at(-1)?.status.toLowerCase() ?? "no runs"}</span>
          }
        >
          <span class="text-v2-text-text-base">{figure(props.place.value ?? 0)}</span>
        </Show>
        <Show when={props.place.kind === "live"}>
          <span class="text-v2-state-fg-success">live</span>
        </Show>
        <Show when={props.place.kind !== "live" && props.place.row.delta}>
          <span class={tone()}>{props.place.row.delta}</span>
        </Show>
        <Show when={props.best}>
          <span class="text-v2-text-text-faint">best</span>
        </Show>
      </span>
    </div>
  )
}

const CARD_W = 168

const CARD_H = 38

/**
 * Where each name card goes: beside its node, on the first of four corners that stays on the map and clear of the
 * nodes and of the cards placed before it. Earlier cards win, so callers list the most important first.
 */
function place(nodes: Place[], every: Place[], width: number, height: number) {
  const taken: { left: number; top: number; width: number; height: number }[] = every.map((node) => ({
    left: node.x - 7,
    top: node.y - 7,
    width: 14,
    height: 14,
  }))

  const clear = (left: number, top: number) =>
    left >= 2 &&
    top >= 2 &&
    left + CARD_W <= width - 2 &&
    top + CARD_H <= height - 2 &&
    taken.every(
      (box) =>
        left + CARD_W + 4 <= box.left ||
        box.left + box.width + 4 <= left ||
        top + CARD_H + 4 <= box.top ||
        box.top + box.height + 4 <= top,
    )

  return nodes.map((node) => {
    const corners = [
      { left: node.x + 12, top: node.y - CARD_H - 6 },
      { left: node.x + 12, top: node.y + 8 },
      { left: node.x - CARD_W - 12, top: node.y - CARD_H - 6 },
      { left: node.x - CARD_W - 12, top: node.y + 8 },
    ]
    // No corner fits: walk a centred card down, then up, from the node until it clears the others.

    const centre = Math.min(Math.max(2, node.x - CARD_W / 2), width - CARD_W - 2)
    const offsets = Array.from({ length: 24 }, (_, step) => (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 12)

    const spot = corners.find((corner) => clear(corner.left, corner.top)) ??
      offsets
        .map((offset) => ({ left: centre, top: node.y + 10 + offset }))
        .find((spot) => clear(spot.left, spot.top)) ?? {
        left: centre,
        top: Math.min(Math.max(2, node.y + 10), height - CARD_H - 2),
      }

    taken.push({ ...spot, width: CARD_W, height: CARD_H })

    return { place: node, ...spot }
  })
}
