import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const instanceIdSchema = z.string().uuid();
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

export async function DELETE(_request: Request, { params }: { params: { id: string; name: string } }) {
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

  const decodedName = decodeURIComponent(params.name);
  const name = safeFileName(decodedName);
  if (!name) {
    return jsonError("invalid_request", "Invalid file name", 400);
  }

  const filesDir = getFilesDir(parsed.data);
  const filePath = path.join(filesDir, name);

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return jsonError("not_found", "File not found", 404);
    }
    return jsonError("delete_failed", (error as Error).message, 500);
  }

  const selected = await loadResources(parsed.data);
  if (selected.includes(name)) {
    const next = selected.filter((item) => item !== name);
    await saveResources(parsed.data, next);
  }

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "file_deleted",
      message: "Instance file deleted",
      meta: { file: name }
    }
  });

  return jsonOk({ status: "deleted", name });
}
