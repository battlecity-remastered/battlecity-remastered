import type { KnownTypedEventEnvelope } from "@battlecity/protocol";
import type { ClientState } from "../../app/state.js";

export type ThreeBattlefield = {
    canvas: HTMLCanvasElement;
    render: (state: ClientState) => void;
    prepare: (state: ClientState) => Promise<void>;
    observeServerEvent: (event: KnownTypedEventEnvelope, state: ClientState) => void;
    pickBuilding: (clientX: number, clientY: number, state: ClientState) => ClientState["buildings"] extends Map<string, infer B> ? B | null : never;
    pickGround: (clientX: number, clientY: number) => { tileX: number; tileY: number } | null;
    resize: () => void;
    previewBuild: (type: number, tileX: number, tileY: number) => void;
    previewRemove: (tileX: number, tileY: number) => void;
    previewOrb: (state: ClientState) => boolean;
    dispose: () => void;
};
