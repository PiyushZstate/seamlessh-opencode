import { createMemo, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createSizing } from "./helpers"
import type { SessionModel } from "./model"
import { clampSessionPanelWidth, sessionPanelWidthCss, sessionPanelWidthMax } from "./session-panel-width"

/**
 * wide asks for the wider session minimum. extra is the width, in pixels, of columns that share the chat's slot (the
 * Seamlessh Lab's tree and page): the slot grows by it, so the chat keeps its own width and the side panel gives way.
 */
export function createSessionScreenLayout(
  session: SessionModel,
  input: { wide: Accessor<boolean>; extra?: Accessor<number> },
) {
  const extra = () => input.extra?.() ?? 0
  const size = createSizing()
  const view = session.layout.view
  const tabsOpen = createMemo(() => session.isDesktop() && view().side.opened() && !!session.identity.params.id)

  const [rowSize, setRowSize] = createStore<{ width?: number }>({})
  let row: HTMLDivElement | undefined
  createResizeObserver(
    () => row,
    ({ width }) => setRowSize({ width }),
  )

  const available = createMemo<number | undefined>(() => {
    const width = rowSize.width

    if (width === undefined) return undefined

    return width - 8
  })

  const splitSide = createMemo(() => tabsOpen() && input.wide())

  const resizedWidth = createMemo(() =>
    clampSessionPanelWidth({
      width: view().session.width(),
      available: available(),
      split: splitSide(),
      resized: view().session.resized(),
    }),
  )

  // The slot's width with the extra columns, never wider than the row.
  const slotWidth = createMemo(() => Math.min(resizedWidth() + extra(), available() ?? Number.POSITIVE_INFINITY))

  const panelWidth = createMemo(() => {
    if (!tabsOpen()) return "100%"

    const css = sessionPanelWidthCss({
      width: view().session.width(),
      split: splitSide(),
      resized: view().session.resized(),
    })

    return extra() > 0 ? `min(calc(${css} + ${extra()}px), 100%)` : css
  })

  const panelMax = createMemo(() => {
    const width = available()

    if (width === undefined) return 1000

    return sessionPanelWidthMax({ available: width, split: splitSide(), resized: true })
  })

  // The side panel's open width, kept through a close as the far end of its travel.
  const sideWidth = createMemo<number | undefined>((previous) => {
    const width = available()

    if (tabsOpen() && width !== undefined) return Math.max(0, width - slotWidth())

    return previous
  })

  const sideContentWidth = createMemo<string>((previous) => {
    const width = sideWidth()

    return width === undefined ? previous : `${width}px`
  }, "100%")

  return {
    centered: createMemo(() => session.isDesktop()),
    panel: {
      max: panelMax,
      ref: (element: HTMLDivElement) => {
        row = element
      },
      resizable: tabsOpen,
      resizedWidth,
      width: panelWidth,
    },
    side: {
      contentWidth: sideContentWidth,
      width: sideWidth,
      open: tabsOpen,
      tabs: { open: tabsOpen },
    },
    size,
  }
}

export type SessionScreenLayout = ReturnType<typeof createSessionScreenLayout>
