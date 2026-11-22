import "dotenv/config";

type Json = Record<string, unknown>;
type DemoAccount = { email: string; password: string; displayName: string; userId: string; token: string };
type DemoEvent = { type: string; taskId: string };

const apiBaseUrl = (process.env.DEMO_API_URL ?? `http://localhost:${process.env.PORT ?? "3000"}/api`).replace(/\/$/, "");
const ownerCredentials = {
  email: process.env.DEMO_OWNER_EMAIL ?? "taskmaster-owner@example.test",
  password: process.env.DEMO_OWNER_PASSWORD ?? "TaskMaster-Demo-Owner-2026!",
  displayName: "TaskMaster Demo Owner",
};
const memberCredentials = {
  email: process.env.DEMO_MEMBER_EMAIL ?? "taskmaster-member@example.test",
  password: process.env.DEMO_MEMBER_PASSWORD ?? "TaskMaster-Demo-Member-2026!",
  displayName: "TaskMaster Demo Member",
};

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo data seeding is disabled when NODE_ENV=production");
}

async function api(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<Json> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = response.status === 204 ? "" : await response.text();
  const result = raw ? JSON.parse(raw) as Json : {};
  if (!response.ok) {
    const error = result.error as { code?: string; message?: string } | undefined;
    throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${error?.code ?? raw}`);
  }
  return result;
}

function dataOf(response: Json): Json {
  return response.data as Json;
}

async function createOrLogin(credentials: Omit<DemoAccount, "userId" | "token">): Promise<DemoAccount> {
  let registration: Json;
  try {
    registration = await api("/auth/register", { method: "POST", body: credentials });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("EMAIL_ALREADY_EXISTS")) throw error;
    registration = {};
  }

  const login = dataOf(await api("/auth/login", {
    method: "POST",
    body: { email: credentials.email, password: credentials.password },
  }));
  const profile = (registration.data as Json | undefined)?.user as Json | undefined
    ?? login.user as Json;
  return {
    ...credentials,
    userId: profile.id as string,
    token: login.accessToken as string,
  };
}

async function openEventStream(token: string) {
  const controller = new AbortController();
  const response = await fetch(`${apiBaseUrl}/notifications/events`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    controller.abort();
    throw new Error(`Could not connect to notification stream (HTTP ${response.status})`);
  }

  const events: DemoEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";
  const consuming = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          if (line.startsWith("data: ")) {
            const event = JSON.parse(line.slice(6)) as { taskId: string };
            events.push({ type: eventType, taskId: event.taskId });
          }
          if (line === "") eventType = "";
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") throw error;
    }
  })();
  return { controller, events, consuming };
}

async function waitForEvents(events: DemoEvent[], taskId: string, expected: string[]) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const seen = new Set(events.filter((event) => event.taskId === taskId).map((event) => event.type));
    if (expected.every((event) => seen.has(event))) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Notification stream did not receive ${expected.join(" and ")} for task ${taskId}`);
}

async function seed() {
  console.log(`Using API ${apiBaseUrl}`);
  const owner = await createOrLogin(ownerCredentials);
  const member = await createOrLogin(memberCredentials);
  await api("/users/me", { method: "PATCH", token: owner.token, body: { displayName: owner.displayName } });
  await api("/users/me", { method: "PATCH", token: member.token, body: { displayName: member.displayName } });

  const projectName = `TaskMaster Demo ${new Date().toISOString()}`;
  const projectData = dataOf(await api("/projects", {
    method: "POST",
    token: owner.token,
    body: { name: projectName, description: "Demo project with sample workflow data" },
  }));
  const project = projectData.project as Json;
  const projectId = project.id as string;

  const invitationData = dataOf(await api(`/projects/${projectId}/invitations`, {
    method: "POST", token: owner.token, body: { email: member.email },
  }));
  const invitation = invitationData.invitation as Json;
  await api(`/projects/${projectId}/invitations`, { token: owner.token });
  await api(`/invitations/${invitation.token as string}/accept`, { method: "POST", token: member.token });
  await api(`/projects/${projectId}/members/${member.userId}`, {
    method: "PATCH", token: owner.token, body: { role: "ADMIN" },
  });

  const pendingInvitationData = dataOf(await api(`/projects/${projectId}/invitations`, {
    method: "POST", token: owner.token, body: { email: `pending-${Date.now()}@example.test` },
  }));
  const pendingInvitation = pendingInvitationData.invitation as Json;
  await api(`/projects/${projectId}/invitations/${pendingInvitation.id as string}`, {
    method: "DELETE", token: owner.token,
  });

  await api("/projects", { token: owner.token });
  await api(`/projects/${projectId}`, { token: owner.token });
  await api(`/projects/${projectId}/members`, { token: owner.token });
  await api(`/projects/${projectId}`, {
    method: "PATCH", token: owner.token, body: { description: "Updated by the demo seeder" },
  });

  const events = await openEventStream(member.token);
  let primaryTaskId = "";
  try {
    const primaryTaskData = dataOf(await api(`/projects/${projectId}/tasks`, {
      method: "POST",
      token: owner.token,
      body: {
        title: "Demo: prepare product launch",
        description: "Assigned task used to demonstrate comments, status, filters, and notifications.",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assigneeId: member.userId,
      },
    }));
    const primaryTask = primaryTaskData.task as Json;
    primaryTaskId = primaryTask.id as string;

    await api(`/projects/${projectId}/tasks/${primaryTaskId}`, {
      method: "PATCH", token: member.token, body: { status: "IN_PROGRESS" },
    });
    await waitForEvents(events.events, primaryTaskId, ["task.assigned", "task.updated"]);

    const commentData = dataOf(await api(`/projects/${projectId}/tasks/${primaryTaskId}/comments`, {
      method: "POST", token: member.token, body: { body: "I am working on this demo task." },
    }));
    const comment = commentData.comment as Json;
    await api(`/projects/${projectId}/tasks/${primaryTaskId}/comments`, { token: owner.token });
    await api(`/projects/${projectId}/tasks/${primaryTaskId}/comments/${comment.id as string}`, {
      method: "PATCH", token: member.token, body: { body: "Progress update: initial review is complete." },
    });

    const moderatedCommentData = dataOf(await api(`/projects/${projectId}/tasks/${primaryTaskId}/comments`, {
      method: "POST", token: member.token, body: { body: "Temporary moderation example." },
    }));
    const moderatedComment = moderatedCommentData.comment as Json;
    await api(`/projects/${projectId}/tasks/${primaryTaskId}/comments/${moderatedComment.id as string}`, {
      method: "DELETE", token: owner.token,
    });

    await api(`/projects/${projectId}/tasks?status=IN_PROGRESS&search=product&sortBy=dueDate&sortOrder=asc`, {
      token: owner.token,
    });
    await api("/tasks/assigned-to-me?status=IN_PROGRESS", { token: member.token });
    await api(`/projects/${projectId}/tasks/${primaryTaskId}`, { token: member.token });

    const otherTasks = [
      { title: "Demo: review mockups", description: "Open and unassigned example." },
      { title: "Demo: publish release notes", description: "Task will be marked complete.", assigneeId: member.userId },
      { title: "Demo: owner follow-up", description: "Task assigned to the project owner.", assigneeId: owner.userId },
    ];
    const createdTasks: Json[] = [];
    for (const taskInput of otherTasks) {
      const result = dataOf(await api(`/projects/${projectId}/tasks`, {
        method: "POST", token: owner.token, body: taskInput,
      }));
      createdTasks.push(result.task as Json);
    }
    await api(`/projects/${projectId}/tasks/${createdTasks[1].id as string}`, {
      method: "PATCH", token: member.token, body: { status: "COMPLETED" },
    });
    await api(`/projects/${projectId}/tasks?assigneeId=unassigned`, { token: owner.token });
    await api(`/projects/${projectId}/tasks?status=COMPLETED`, { token: owner.token });

    const attachmentData = dataOf(await api(`/projects/${projectId}/tasks/${primaryTaskId}/attachments`, {
      method: "POST",
      token: member.token,
      body: {
        fileName: "demo-notes.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength("TaskMaster demo attachment.\n"),
      },
    }));
    const attachment = attachmentData.attachment as Json;
    const form = new FormData();
    for (const [key, value] of Object.entries(attachmentData.uploadFields as Record<string, string>)) {
      form.append(key, value);
    }
    form.append("file", new Blob(["TaskMaster demo attachment.\n"], { type: "text/plain" }), "demo-notes.txt");
    const uploadResponse = await fetch(attachmentData.uploadUrl as string, { method: "POST", body: form });
    if (!uploadResponse.ok) throw new Error(`Object storage upload failed with HTTP ${uploadResponse.status}`);

    await api(`/projects/${projectId}/tasks/${primaryTaskId}/attachments/${attachment.id as string}/complete`, {
      method: "POST", token: member.token,
    });
    await api(`/projects/${projectId}/tasks/${primaryTaskId}/attachments`, { token: owner.token });
    const downloadData = dataOf(await api(`/projects/${projectId}/tasks/${primaryTaskId}/attachments/${attachment.id as string}/download`, {
      token: owner.token,
    }));
    const downloadResponse = await fetch(downloadData.downloadUrl as string);
    const downloadedText = await downloadResponse.text();
    if (!downloadResponse.ok || downloadedText !== "TaskMaster demo attachment.\n") {
      throw new Error("Attachment download verification failed");
    }
    await api(`/projects/${projectId}/tasks/${createdTasks[0].id as string}`, {
      method: "DELETE", token: owner.token,
    });
  } finally {
    events.controller.abort();
    await events.consuming;
  }

  await api(`/projects/${projectId}/tasks/${primaryTaskId}`, {
    method: "PATCH", token: member.token, body: { status: "COMPLETED" },
  });
  await api("/auth/logout", { method: "POST", token: owner.token });
  await api("/auth/logout", { method: "POST", token: member.token });

  console.log("Demo data created successfully.");
  console.log(`Project: ${projectName} (${projectId})`);
  console.log(`Owner login: ${owner.email}`);
  console.log(`Member/admin login: ${member.email}`);
  console.log(`Primary task: ${primaryTaskId}`);
  console.log("Seeded features: project/member invitations, role changes, task assignment/status/filtering, comments/moderation, attachment upload/download, SSE notifications, and logout.");
}

seed().catch((error: unknown) => {
  console.error("Demo data seeding failed:", error);
  process.exitCode = 1;
});
