import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { SseEventHub } from "../notifications/sse-event-hub.js";

export class NotificationController {
  constructor(private readonly events: SseEventHub) {}

  stream: RequestHandler = (req, res) => {
    if (!req.auth) throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
    const remove = this.events.subscribe(req.auth.userId, res, req.get("Last-Event-ID"));
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(": heartbeat\n\n");
    }, 25_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      remove();
    });
  };
}
