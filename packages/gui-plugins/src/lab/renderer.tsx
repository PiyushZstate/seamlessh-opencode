import { createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode/ui/toast"
import { Command, createKeyed, createLatest, Panel, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { Lab, type Snapshot, type Verb } from "./contract"
import type definition from "./index"
import { LabView, type LabState } from "./view"

const TAB = "experiments"

/** The host's research changes while runs go; read it again this often while a session is shown. */
const EVERY = 3000

/**
 * The Lab (Seamlessh D24) as a side-region tab beside OpenCode's chat: the project's study, its experiment tree and
 * the picked experiment. A session whose project does research opens on it the first time it is shown; closing it
 * sticks for the run. Data comes from the Seamlessh host through main's `seamlessh exp` bridge.
 */
const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const lab = ctx.use(Lab)
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((n) => n + 1), EVERY)
  onCleanup(() => clearInterval(timer))

  const directory = () => sessions.current()?.directory

  const research = createLatest(
    () => {
      const live = lab()
      const dir = directory()

      return live.status === "active" && dir ? { client: live.value, dir, tick: tick() } : undefined
    },
    (source, signal) => source.client.snapshot(source.dir, { signal }).then((snapshot) => ({ dir: source.dir, snapshot })),
  )

  // Only the current directory's reply counts: `latest` holds the previous directory's while the next loads.
  const snapshot = (): Snapshot | undefined => {
    const latest = research.latest

    return latest && latest.dir === directory() ? latest.snapshot : undefined
  }

  const researching = () => {
    const current = snapshot()

    return !!current && (current.study !== null || current.experiments.length > 0)
  }

  const state = (): LabState => {
    if (lab().status === "inactive") return { kind: "unavailable" }
    const current = snapshot()

    if (current) return { kind: "ready", snapshot: current }

    if (research.error) return { kind: "error" }

    return { kind: "loading" }
  }

  const [picks, setPicks] = createStore<Record<string, number>>({})
  const opened = new Set<string>()

  // A researching session opens on its experiments the first time this run shows it.
  createKeyed(
    () => (researching() && !layout.narrow() ? sessions.current() : undefined),
    (session) => {
      if (opened.has(session.key)) return
      opened.add(session.key)
      layout.open(`${ctx.id}:${TAB}`, session, { tab: "select", background: true })
    },
  )

  const act = (verb: Verb, id: number) => {
    const live = lab()
    const dir = directory()

    if (live.status !== "active" || !dir) return void showToast({ title: ctx.t("unavailable.title") })
    live.value
      .act({ directory: dir, verb, id })
      .then(() => setTick((n) => n + 1))
      .catch(() => showToast({ title: ctx.t("error.title") }))
  }

  const tab: PanelTab = {
    id: TAB,
    get title() {
      const count = snapshot()?.experiments.length ?? 0

      return count > 0 ? ctx.t("tab.count", { count }) : ctx.t("tab.title")
    },
  }

  ctx.add(Panel, {
    id: TAB,
    region: "side",
    list: (input) => (researching() && input.session.directory === directory() ? [tab] : []),
    render: (props) => (
      <LabView
        state={state()}
        pick={picks[props.session.key]}
        onPick={(id) => setPicks(props.session.key, id)}
        onAct={act}
        onRetry={() => setTick((n) => n + 1)}
        t={ctx.t}
      />
    ),
  })

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      enabled: researching() && !layout.narrow(),
      run: () => {
        const session = sessions.current()

        if (session) layout.open(`${ctx.id}:${TAB}`, session, { tab: "select" })
      },
    }),
  )
}

export default setup
