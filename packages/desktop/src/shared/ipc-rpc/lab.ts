import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Snapshot, Verb } from "@opencode/app/lab-contract"

const directory = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_096))

const id = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

// The Seamlessh Lab reads the host through the `seamlessh` CLI, which only main can run.
export const LabRpcs = RpcGroup.make(
  Rpc.make("LabSnapshot", { payload: { directory }, success: Snapshot }),
  Rpc.make("LabAct", { payload: { directory, verb: Verb, id } }),
  Rpc.make("LabLog", { payload: { directory, id }, success: Schema.String }),
)
