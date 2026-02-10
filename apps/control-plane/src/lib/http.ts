import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: string, message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ error, message, details }, { status });
}
