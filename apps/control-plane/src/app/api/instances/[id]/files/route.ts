import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const instanceIdSchema = z.string().uuid();
const baseDir = "/var/lib/clawdeploy/instances";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_INSTANCE = 20;

function getInstanceRoot(instanceId: string) {
  return path.join(baseDir, instanceId);
}

function getFilesDir(instanceId: string) {
  return path.join(getInstanceRoot(instanceId), "files");
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

type FilePayload = {
  name: string;
  size: number;
  updatedAt: string;
};

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

  const filesDir = getFilesDir(parsed.data);
  await fs.promises.mkdir(filesDir, { recursive: true });

  const entries = await fs.promises.readdir(filesDir, { withFileTypes: true });
  const files: FilePayload[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(filesDir, entry.name);
    const stat = await fs.promises.stat(fullPath);
    files.push({
      name: entry.name,
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  return jsonOk({ files });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError("invalid_request", "Invalid form data", 400);
  }

  const incoming = formData.getAll("files");
  if (!incoming.length) {
    return jsonError("invalid_request", "No files provided", 400);
  }

  const filesDir = getFilesDir(parsed.data);
  await fs.promises.mkdir(filesDir, { recursive: true });

  const existingEntries = await fs.promises.readdir(filesDir, { withFileTypes: true });
  const existingCount = existingEntries.filter((entry) => entry.isFile()).length;
  const files: File[] = [];

  for (const item of incoming) {
    if (!item || typeof item === "string") {
      return jsonError("invalid_request", "Invalid file payload", 400);
    }
    files.push(item);
  }

  if (existingCount + files.length > MAX_FILES_PER_INSTANCE) {
    return jsonError("file_limit_exceeded", `Instance file limit exceeded (${MAX_FILES_PER_INSTANCE})`, 413);
  }

  const saved: FilePayload[] = [];

  for (const item of files) {
    if (item.size > MAX_FILE_SIZE_BYTES) {
      return jsonError("file_too_large", "File exceeds max size (5MB)", 413);
    }

    const rawName = typeof item.name === "string" ? item.name : "";
    const name = safeFileName(rawName);
    if (!name) {
      return jsonError("invalid_request", "Invalid file name", 400);
    }

    const arrayBuffer = await item.arrayBuffer();
    const filePath = path.join(filesDir, name);
    await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));

    const stat = await fs.promises.stat(filePath);
    saved.push({
      name,
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  }

  if (!saved.length) {
    return jsonError("invalid_request", "No valid files provided", 400);
  }

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "files_uploaded",
      message: "Instance files uploaded",
      meta: { files: saved.map((file) => file.name) }
    }
  });

  return jsonOk({ files: saved }, 201);
}
