import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const instanceIdSchema = z.string().uuid();
const bodySchema = z.object({
  selected: z.array(z.string().min(1)).default([])
});

const baseDir = "/var/lib/clawdeploy/instances";

function getInstanceRoot(instanceId: string) {
  return path.join(baseDir, instanceId);
}

function getFilesDir(instanceId: string) {
  return path.join(getInstanceRoot(instanceId), "files");
}

function getResourcesPath(instanceId: string) {
  return path.join(getInstanceRoot(instanceId), "resources.json");
}

function safeFileName(rawName: string) {
  const name = path.basename(rawName);
  if (!name || name === "." || name === "..") return null;
  if (name !== rawName) return null;
  return name;
}

async function ensureInstance(session: { workspaceId: string }, instanceId: string) {
  return prisma.instance.findFirst({
    where: { id: instanceId, workspaceId: session.workspaceId }
  });
}

async function loadResources(instanceId: string) {
  const resourcePath = getResourcesPath(instanceId);
  try {
    const raw = await fs.promises.readFile(resourcePath, "utf8");
    const parsed = JSON.parse(raw) as { selected?: string[] };
    return Array.isArray(parsed.selected) ? parsed.selected : [];
  } catch {
    return [];
  }
}

async function saveResources(instanceId: string, selected: string[]) {
  const resourcePath = getResourcesPath(instanceId);
  await fs.promises.mkdir(getInstanceRoot(instanceId), { recursive: true });
  await fs.promises.writeFile(
    resourcePath,
    JSON.stringify({ selected, updatedAt: new Date().toISOString() }, null, 2)
  );
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const parsed = instanceIdSchema.safeParse(params.id);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid instance id", 400);
  }

  const instance = await ensureInstance(session, parsed.data);
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  const selected = await loadResources(parsed.data);
  return jsonOk({ selected });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const parsedId = instanceIdSchema.safeParse(params.id);
  if (!parsedId.success) {
    return jsonError("invalid_request", "Invalid instance id", 400);
  }

  const instance = await ensureInstance(session, parsedId.data);
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError("invalid_request", "Invalid resource payload", 400, {
      issues: parsedBody.error.flatten().fieldErrors
    });
  }

  const filesDir = getFilesDir(parsedId.data);
  await fs.promises.mkdir(filesDir, { recursive: true });

  const selected: string[] = [];
  for (const raw of parsedBody.data.selected) {
    const name = safeFileName(raw);
    if (!name) {
      return jsonError("invalid_request", "Invalid resource name", 400);
    }
    if (!selected.includes(name)) {
      selected.push(name);
    }
  }

  const missing: string[] = [];
  for (const name of selected) {
    try {
      await fs.promises.access(path.join(filesDir, name));
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    return jsonError("invalid_request", "Selected resources not found", 400, {
      missing
    });
  }

  await saveResources(parsedId.data, selected);

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "resources_updated",
      message: "Instance resources updated",
      meta: { selected }
    }
  });

  return jsonOk({ selected });
}
