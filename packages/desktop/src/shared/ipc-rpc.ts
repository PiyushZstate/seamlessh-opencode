import { RpcClient, RpcClientError } from "effect/rpc"
import { AppRpcs } from "./ipc-rpc/app"
import { EventRpcs } from "./ipc-rpc/events"
import { PluginRpcs } from "./ipc-rpc/plugins"
import { FileRpcs } from "./ipc-rpc/files"
import { LabRpcs } from "./ipc-rpc/lab"
import { MenuRpcs } from "./ipc-rpc/menu"
import { StorageRpcs } from "./ipc-rpc/storage"
import { WindowRpcs } from "./ipc-rpc/window"

export { AppRpcs } from "./ipc-rpc/app"

export { EventRpcs } from "./ipc-rpc/events"

export { PluginRpcs } from "./ipc-rpc/plugins"

export { FileRpcs } from "./ipc-rpc/files"

export { LabRpcs } from "./ipc-rpc/lab"

export { MenuRpcs } from "./ipc-rpc/menu"

export { StorageRpcs } from "./ipc-rpc/storage"

export { WindowRpcs } from "./ipc-rpc/window"

export const DesktopRpcs = AppRpcs.merge(StorageRpcs, FileRpcs, WindowRpcs, MenuRpcs, EventRpcs, PluginRpcs, LabRpcs)

export type DesktopRpcClient = RpcClient.FromGroup<typeof DesktopRpcs, RpcClientError.RpcClientError>
