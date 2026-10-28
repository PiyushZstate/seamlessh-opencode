import { Effect } from "effect"
import { LabRpcs } from "../../shared/ipc-rpc"
import * as Lab from "../lab"

export const labHandlers = LabRpcs.toLayer(
  Effect.succeed(
    LabRpcs.of({
      LabSnapshot: ({ directory }) => Lab.snapshot(directory).pipe(Effect.orDie),
      LabAct: ({ directory, verb, id }) => Lab.act(directory, verb, id).pipe(Effect.orDie),
      LabLog: ({ directory, id }) => Lab.log(directory, id).pipe(Effect.orDie),
    }),
  ),
)
