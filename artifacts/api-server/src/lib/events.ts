import { EventEmitter } from "node:events";

export type LiveFeedEvent = {
  type: "call_update";
  call: unknown;
};

class LiveFeed extends EventEmitter {}

export const liveFeed = new LiveFeed();
liveFeed.setMaxListeners(0);

export function emitCallUpdate(call: unknown): void {
  liveFeed.emit("event", { type: "call_update", call } satisfies LiveFeedEvent);
}
