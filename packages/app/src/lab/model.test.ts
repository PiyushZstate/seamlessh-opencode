import { describe, expect, test } from "bun:test"
import type { Experiment } from "./contract"
import { ancestry, deltaWords, duration, figure, picked, rows, ticks, tree } from "./model"

const experiment = (
  id: number,
  parent: number | null,
  value: number | null,
  status: Experiment["runs"][number]["status"] = "Succeeded",
): Experiment => ({
  id,
  repo: "sieve",
  parent,
  title: `e${id}`,
  branch: `exp/${id}`,
  commit: "",
  note: "",
  command: "",
  created: 0,
  kept: false,
  runs: [{ number: id, status, started: 0, millis: 0, exit: 0, value, points: [], error: null }],
})

describe("lab model", () => {
  test("the tree marks the best and each change on its parent", () => {
    const all = [
      experiment(1, null, 100),
      experiment(2, 1, 110),
      experiment(3, 1, null, "Failed"),
      experiment(4, 2, 104.5),
    ]

    const lines = rows(all, "Higher")

    expect(lines.map((line) => line.experiment.id)).toEqual([1, 2, 4, 3])
    expect(lines.map((line) => line.depth)).toEqual([0, 1, 2, 1])
    expect(lines[1]?.best).toBe(true)
    expect(lines[1]?.delta).toBe("+10.0%")
    expect(lines[2]?.delta).toBe("-5.0%")
    expect(lines[3]?.verdict).toBe("none")
    expect(lines[0]?.verdict).toBe("baseline")
  })

  test("scores change in points and big changes read as factors", () => {
    expect(deltaWords(0.8166, 0.7729, "Higher")).toBe("+4.4 pts")
    expect(deltaWords(0.3, 0.35, "Lower")).toBe("+5.0 pts")
    expect(deltaWords(129_326, 630, "Higher")).toBe("205×")
    expect(deltaWords(1, 4, "Higher")).toBe("÷4.0")
    expect(deltaWords(1.2, 1, "Lower")).toBe("-20.0%")
  })

  test("a parent cycle from a bad state file does not hang", () => {
    expect(tree([experiment(1, 2, 1), experiment(2, 1, 1)])).toEqual([])
  })

  test("the pick falls back to a live run, then the best", () => {
    const all = [experiment(1, null, 100), experiment(2, 1, 120), experiment(3, 1, null, "Running")]

    expect(picked(all, "Higher", undefined)?.id).toBe(3)
    expect(picked(all.slice(0, 2), "Higher", undefined)?.id).toBe(2)
    expect(picked(all, "Higher", 1)?.id).toBe(1)
  })

  test("numbers read as the CLI prints them", () => {
    expect(figure(72.90000000000001)).toBe("72.9")
    expect(figure(5e-7)).toBe("5e-7")
    expect(duration(62_000)).toBe("1m02s")
  })

  test("ticks land on round steps inside the range", () => {
    expect(ticks(0.613, 0.841, 4)).toEqual([0.65, 0.7, 0.75, 0.8])
    expect(ticks(0, 1000, 5)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(ticks(1, 1, 4)).toEqual([1])
  })

  test("ancestry walks to the root and stops on a cycle", () => {
    const all = [experiment(1, null, 1), experiment(2, 1, 2), experiment(3, 2, 3)]
    expect(ancestry(all, 3)).toEqual([1, 2, 3])
    expect(ancestry([experiment(1, 2, 1), experiment(2, 1, 1)], 1)).toEqual([2, 1])
  })
})
