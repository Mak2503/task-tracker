import { randomUUID } from "node:crypto";
import type { Response } from "express";

export type TaskEvent = {
  id: string;
  type: "task.assigned" | "task.updated";
  projectId: string;
  taskId: string;
  actorId: string;
  occurredAt: string;
  task: { title: string; status: string; assigneeId: string | null };
};

/** In-process SSE fanout with a small replay window for reconnecting clients. */
export class SseEventHub {
  private readonly subscribers = new Map<string, Set<Response>>();
  private readonly history: Array<{ event: TaskEvent; recipients: Set<string> }> = [];

  constructor(private readonly historyLimit = 500) {}

  subscribe(userId: string, response: Response, lastEventId?: string): () => void {
    let listeners = this.subscribers.get(userId);
    if (!listeners) {
      listeners = new Set();
      this.subscribers.set(userId, listeners);
    }
    listeners.add(response);
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    response.write(": connected\n\n");

    if (lastEventId) {
      const offset = this.history.findIndex(({ event }) => event.id === lastEventId);
      if (offset >= 0) {
        for (const entry of this.history.slice(offset + 1)) {
          if (entry.recipients.has(userId)) this.write(response, entry.event);
        }
      }
    }

    return () => {
      listeners?.delete(response);
      if (listeners?.size === 0) this.subscribers.delete(userId);
    };
  }

  publish(recipients: string[], event: Omit<TaskEvent, "id" | "occurredAt">): TaskEvent {
    const complete: TaskEvent = { ...event, id: randomUUID(), occurredAt: new Date().toISOString() };
    const recipientSet = new Set(recipients);
    this.history.push({ event: complete, recipients: recipientSet });
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    for (const userId of recipientSet) {
      for (const response of this.subscribers.get(userId) ?? []) this.write(response, complete);
    }
    return complete;
  }

  private write(response: Response, event: TaskEvent) {
    if (response.writableEnded || response.destroyed) return;
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
}
