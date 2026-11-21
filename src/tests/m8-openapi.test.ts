import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, Record<string, unknown>>;
};

const document = JSON.parse(readFileSync(resolve(process.cwd(), "docs/openapi.json"), "utf8")) as OpenApiDocument;

test("OpenAPI document declares the current API paths and HTTP operations", () => {
  assert.equal(document.openapi, "3.1.0");
  const required: Record<string, string[]> = {
    "/health": ["get"],
    "/health/ready": ["get"],
    "/auth/register": ["post"],
    "/auth/login": ["post"],
    "/auth/logout": ["post"],
    "/users/me": ["get", "patch"],
    "/projects": ["get", "post"],
    "/projects/{projectId}": ["get", "patch", "delete"],
    "/projects/{projectId}/members": ["get"],
    "/projects/{projectId}/members/{userId}": ["patch", "delete"],
    "/projects/{projectId}/invitations": ["get", "post"],
    "/invitations/{token}/accept": ["post"],
    "/tasks/assigned-to-me": ["get"],
    "/projects/{projectId}/tasks": ["get", "post"],
    "/projects/{projectId}/tasks/{taskId}": ["get", "patch", "delete"],
    "/projects/{projectId}/tasks/{taskId}/comments": ["get", "post"],
    "/projects/{projectId}/tasks/{taskId}/comments/{commentId}": ["patch", "delete"],
    "/projects/{projectId}/tasks/{taskId}/attachments": ["get", "post"],
    "/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/complete": ["post"],
    "/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download": ["get"],
    "/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}": ["delete"],
    "/notifications/events": ["get"],
  };

  for (const [path, methods] of Object.entries(required)) {
    assert.ok(document.paths[path], `Missing documented path ${path}`);
    for (const method of methods) {
      const operation = document.paths[path][method] as { responses?: unknown; security?: unknown } | undefined;
      assert.ok(operation, `Missing documented operation ${method.toUpperCase()} ${path}`);
      assert.ok(operation.responses, `Missing responses for ${method.toUpperCase()} ${path}`);
      if (!new Set(["/health", "/health/ready", "/auth/register", "/auth/login"]).has(path)) {
        assert.ok(operation.security, `Missing auth declaration for ${method.toUpperCase()} ${path}`);
      }
    }
  }
});

test("OpenAPI component references resolve to defined reusable components", () => {
  const serialized = JSON.stringify(document);
  for (const [, reference] of serialized.matchAll(/\"\$ref\":\"([^\"]+)\"/g)) {
    assert.ok(reference.startsWith("#/components/"), `External or unsupported ref ${reference}`);
    const [, collection, name] = reference.match(/^#\/components\/([^/]+)\/([^/]+)$/) ?? [];
    assert.ok(collection && name, `Malformed component ref ${reference}`);
    assert.ok(document.components[collection]?.[name], `Unresolved component ref ${reference}`);
  }
});
