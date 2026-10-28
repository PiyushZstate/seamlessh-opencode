import { createEffect, createMemo, on, onCleanup, type Accessor } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { showToast } from "@opencode/ui/toast"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { errorMessage } from "@/shell/layout/helpers"
import type { Experiment, Snapshot, Verb } from "./contract"
import { live } from "./model"

/** The host's research changes while runs go; read it again this often while the session is shown. */
const EVERY = 3000

/** What the Lab has to show: the host's research, or why there is none. */
export type LabState =
  | { kind: "ready"; snapshot: Snapshot }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }

export type PageTab = "overview" | "training" | "evals" | "rollouts" | "log"

/**
 * How each session left its Lab this run, by session key: whether the person closed the tree, which experiment the
 * page shows and on which tab. Closing sticks until the app restarts, as `docs/lab-layout.md` asks; it is not saved.
 */
type Remembered = { tree?: boolean; pick?: number; tab?: PageTab }

const [memory, setMemory] = createStore<Record<string, Remembered>>({})

/** Whether a project does research: it has a study or any experiment, as the host's `researching(repo)` reads it. */
export function researching(snapshot: Snapshot | undefined) {
  return !!snapshot && (snapshot.study !== null || snapshot.experiments.length > 0)
}

/**
 * The Lab of the routed session (Seamlessh D24): the host's study and experiments for the session's directory, read
 * through the desktop main process's `seamlessh exp` bridge, and which of the tree and the experiment page are open.
 * A researching session opens on its tree; a coding session never shows the Lab.
 */
export function createLab(input: {
  directory: Accessor<string | undefined>
  session: Accessor<string | undefined>
  /** Polls only while the session screen is shown. */
  visible: Accessor<boolean>
}) {
  const host = usePlatform().lab
  const language = useLanguage()
  const [store, setStore] = createStore<{ directory?: string; snapshot?: Snapshot; failed: boolean }>({ failed: false })
  // Only the newest read lands: a slow reply for the previous directory must not overwrite the next one's.
  let sequence = 0

  const read = () => {
    const directory = input.directory()

    if (!host || !directory) return
    const turn = ++sequence
    host
      .snapshot(directory)
      .then((snapshot) => {
        if (turn !== sequence) return
        setStore("directory", directory)
        setStore("failed", false)
        // Keyed by id, so a poll that changes one run redraws its row, not the whole tree.
        setStore("snapshot", reconcile(snapshot, { key: "id" }))
      })
      .catch(() => {
        if (turn !== sequence) return
        setStore({ directory, failed: true })
      })
  }

  createEffect(on(input.directory, read))
  const timer = setInterval(() => input.visible() && read(), EVERY)
  onCleanup(() => clearInterval(timer))

  // The previous directory's reply stays in the store while the next loads; it does not count for this one.
  const snapshot = createMemo(() => (store.directory === input.directory() ? store.snapshot : undefined))

  const state = createMemo<LabState>(() => {
    if (!host) return { kind: "unavailable" }
    const current = snapshot()

    if (current && !store.failed) return { kind: "ready", snapshot: current }

    if (store.failed && store.directory === input.directory()) return { kind: "error" }

    return { kind: "loading" }
  })

  const active = createMemo(() => researching(snapshot()))
  const remembered = () => memory[input.session() ?? ""] ?? {}

  const remember = (patch: Remembered) => {
    const key = input.session()

    if (key) setMemory(key, (current) => ({ ...current, ...patch }))
  }

  const experiments = (): readonly Experiment[] => snapshot()?.experiments ?? []

  /** The page's experiment: the person's pick while it still exists. Nothing picked shows chat | tree. */
  const picked = createMemo(() => {
    const pick = remembered().pick

    return pick === undefined ? undefined : experiments().find((experiment) => experiment.id === pick)
  })

  const tree = () => active() && remembered().tree !== false

  const act = (verb: Verb, id: number) => {
    const directory = input.directory()

    if (!host || !directory) return
    host
      .act(directory, verb, id)
      .then(read)
      .catch((error) =>
        showToast({
          title: language.t("research.action.failed"),
          description: errorMessage(error, language.t("common.requestFailed")),
        }),
      )
  }

  return {
    state,
    snapshot,
    researching: active,
    tree,
    page: () => tree() && !!picked(),
    picked,
    tab: () => remembered().tab ?? "overview",
    setTab: (tab: PageTab) => remember({ tab }),
    pick: (id: number) => remember({ pick: id }),
    closePage: () => remember({ pick: undefined }),
    toggleTree: () => remember({ tree: !tree() }),
    closeTree: () => remember({ tree: false }),
    /** The newest experiment with a run queued or going, for the goal bar. */
    running: createMemo(() => experiments().findLast(live)),
    act,
    log: (id: number) => {
      const directory = input.directory()

      return host && directory ? host.log(directory, id) : Promise.reject(new Error("unavailable"))
    },
    retry: read,
  }
}

export type Lab = ReturnType<typeof createLab>
