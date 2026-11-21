import assert from "node:assert/strict";
import { test } from "node:test";
import type { Response } from "express";
import { SseEventHub } from "../notifications/sse-event-hub.js";

function responseSink() {
  const chunks: string[] = [];
  const response = {
    writableEnded: false,
    destroyed: false,
    status() { return this; },
    set() { return this; },
    flushHeaders() {},
    write(chunk: string) { chunks.push(chunk); return true; },
  };
  return { response: response as unknown as Response, chunks };
}

const eventInput = {
  type: "task.updated" as const,
  projectId: "project-a",
  taskId: "task-a",
  actorId: "user-a",
  task: { title: "Review plan", status: "IN_PROGRESS", assigneeId: "user-b" },
};

test("SSE event hub delivers only to explicitly authorized user recipients", () => {
  const hub = new SseEventHub();
  const alice = responseSink();
  const bob = responseSink();
  const outsider = responseSink();
  hub.subscribe("alice", alice.response);
  hub.subscribe("bob", bob.response);
  hub.subscribe("outsider", outsider.response);

  const event = hub.publish(["alice", "bob"], eventInput);

  assert.ok(alice.chunks.join("").includes(`id: ${event.id}`));
  assert.ok(bob.chunks.join("").includes(`event: ${event.type}`));
  assert.equal(outsider.chunks.join("").includes(event.id), false);
});

test("SSE reconnect replays events after Last-Event-ID and unsubscribe stops delivery", () => {
  const hub = new SseEventHub();
  const first = hub.publish(["alice"], eventInput);
  hub.publish(["alice"], { ...eventInput, taskId: "task-b" });
  const reconnect = responseSink();
  const remove = hub.subscribe("alice", reconnect.response, first.id);

  assert.ok(reconnect.chunks.join("").includes("task-b"));
  assert.equal(reconnect.chunks.join("").includes(`id: ${first.id}`), false);
  remove();
  const next = hub.publish(["alice"], { ...eventInput, taskId: "task-c" });
  assert.equal(reconnect.chunks.join("").includes(next.id), false);
});

test("SSE replay preserves the original per-user recipient scope", () => {
  const hub = new SseEventHub();
  const cursor = hub.publish(["alice", "bob"], eventInput);
  hub.publish(["alice"], { ...eventInput, taskId: "alice-private-task" });
  const bob = responseSink();
  hub.subscribe("bob", bob.response, cursor.id);
  assert.equal(bob.chunks.join("").includes("alice-private-task"), false);
});

test("SSE reconnect with an unknown or expired event id remains connected without replay", () => {
  const hub = new SseEventHub(1);
  const expired = hub.publish(["alice"], eventInput);
  hub.publish(["alice"], { ...eventInput, taskId: "task-b" });
  const reconnect = responseSink();
  hub.subscribe("alice", reconnect.response, expired.id);
  assert.equal(reconnect.chunks.join("").includes("task-b"), false);
  assert.ok(reconnect.chunks.join("").includes(": connected"));
});
