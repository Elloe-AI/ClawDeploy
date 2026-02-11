import { z } from "zod";
import type { RunnerMessage } from "@/lib/host-agent";

const marketSchema = z.object({
  market_id: z.string().min(1),
  question: z.string().min(1),
  outcomes: z.object({
    YES: z.object({ price: z.number().finite() }),
    NO: z.object({ price: z.number().finite() })
  }),
  volume: z.number().finite(),
  liquidity: z.number().finite(),
  end_time: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.literal("polymarket")
});

const signalSchema = z.object({
  signal: z.enum(["BUY_YES", "BUY_NO", "HOLD"]),
  confidence: z.number().finite(),
  reasoning: z.string().min(1),
  warnings: z.array(z.string()).default([])
});

export type MarketState = z.infer<typeof marketSchema>;
export type SignalOutput = z.infer<typeof signalSchema>;

export type AgentInput = {
  context: {
    instance_id: string;
    execution_id: string;
    timestamp: string;
  };
  market_state: MarketState;
  constraints: {
    mode: "signal_only";
    max_messages_per_min: number;
  };
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractOutcomePrice(outcomes: unknown, prices: unknown): { yes: number; no: number } | null {
  if (Array.isArray(outcomes) && Array.isArray(prices) && outcomes.length === prices.length) {
    let yes: number | null = null;
    let no: number | null = null;
    outcomes.forEach((outcome, index) => {
      const label = typeof outcome === "string" ? outcome : (outcome as { name?: unknown })?.name;
      const price = toNumber(prices[index]);
      if (!label || price === null) return;
      const normalized = String(label).trim().toUpperCase();
      if (normalized === "YES") yes = price;
      if (normalized === "NO") no = price;
    });
    if (yes !== null && no !== null) {
      return { yes, no };
    }
  }

  if (Array.isArray(outcomes)) {
    let yes: number | null = null;
    let no: number | null = null;
    for (const outcome of outcomes) {
      if (!outcome || typeof outcome !== "object") continue;
      const name = String((outcome as { name?: unknown }).name ?? "").trim().toUpperCase();
      const price = toNumber((outcome as { price?: unknown }).price);
      if (!name || price === null) continue;
      if (name === "YES") yes = price;
      if (name === "NO") no = price;
    }
    if (yes !== null && no !== null) {
      return { yes, no };
    }
  }

  if (outcomes && typeof outcomes === "object" && !Array.isArray(outcomes)) {
    const yesPrice = toNumber((outcomes as Record<string, unknown>).YES ?? (outcomes as Record<string, unknown>).yes);
    const noPrice = toNumber((outcomes as Record<string, unknown>).NO ?? (outcomes as Record<string, unknown>).no);
    if (yesPrice !== null && noPrice !== null) {
      return { yes: yesPrice, no: noPrice };
    }
  }

  return null;
}

export function normalizePolymarketMarket(raw: unknown): MarketState {
  const direct = marketSchema.safeParse(raw);
  if (direct.success) {
    return direct.data;
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Market payload must be an object");
  }

  const record = raw as Record<string, unknown>;
  const marketId = firstString(record, ["market_id", "marketId", "id"]);
  const question = firstString(record, ["question", "title"]);
  const volume = toNumber(record.volume ?? record.volume_usd ?? record.volumeUsd);
  const liquidity = toNumber(record.liquidity ?? record.liquidity_usd ?? record.liquidityUsd);
  const endTime =
    toIsoString(record.end_time) ??
    toIsoString(record.endDateIso) ??
    toIsoString(record.end_date_iso) ??
    toIsoString(record.end_date) ??
    toIsoString(record.endTime);
  const timestamp =
    toIsoString(record.timestamp) ??
    toIsoString(record.updated_at) ??
    toIsoString(record.updatedAt) ??
    toIsoString(record.last_updated) ??
    new Date().toISOString();

  if (!marketId || !question) {
    throw new Error("Market payload missing market_id or question");
  }
  if (volume === null || liquidity === null) {
    throw new Error("Market payload missing volume or liquidity");
  }
  if (!endTime) {
    throw new Error("Market payload missing end_time");
  }

  const outcomePrices = extractOutcomePrice(record.outcomes, record.outcomePrices ?? record.outcome_prices);
  if (!outcomePrices) {
    throw new Error("Market payload missing YES/NO outcomes");
  }

  const normalized: MarketState = {
    market_id: marketId,
    question,
    outcomes: {
      YES: { price: outcomePrices.yes },
      NO: { price: outcomePrices.no }
    },
    volume,
    liquidity,
    end_time: endTime,
    timestamp,
    source: "polymarket"
  };

  const parsed = marketSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error("Market payload normalization failed");
  }
  return parsed.data;
}

export function parseMarketStateFromText(input: string): MarketState {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Market payload is required");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    throw new Error("Market payload must be JSON");
  }

  if (Array.isArray(raw)) {
    if (raw.length !== 1) {
      throw new Error("Market payload must contain a single market object");
    }
    raw = raw[0];
  }

  return normalizePolymarketMarket(raw);
}

export function buildAgentInput(options: {
  instanceId: string;
  executionId: string;
  marketState: MarketState;
  maxMessagesPerMin: number;
}): AgentInput {
  return {
    context: {
      instance_id: options.instanceId,
      execution_id: options.executionId,
      timestamp: new Date().toISOString()
    },
    market_state: options.marketState,
    constraints: {
      mode: "signal_only",
      max_messages_per_min: options.maxMessagesPerMin
    }
  };
}

export function parseSignalOutput(raw: unknown): SignalOutput | null {
  const parsed = signalSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

export function extractSignalOutput(messages: RunnerMessage[], output?: string): SignalOutput | null {
  for (const message of messages) {
    if (message.type !== "signal") continue;
    const candidate = {
      signal: message.text,
      confidence: message.confidence,
      reasoning: (message.metadata as { reasoning?: unknown })?.reasoning,
      warnings: (message.metadata as { warnings?: unknown })?.warnings
    };
    const parsed = parseSignalOutput(candidate);
    if (parsed) return parsed;
  }

  if (output) {
    try {
      const parsedJson = JSON.parse(output);
      return parseSignalOutput(parsedJson);
    } catch {
      return null;
    }
  }

  return null;
}

function formatConfidence(confidence: number): string {
  const value = confidence <= 1 ? confidence * 100 : confidence;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}%`;
}

export function formatSignalTelegramMessage(signal: SignalOutput, market: MarketState): string {
  const signalText = signal.signal.replace("_", " ");
  const warningBlock = signal.warnings.length
    ? `\n\nWarnings:\n${signal.warnings.map((warning) => `- ${warning}`).join("\n")}`
    : "";

  return `📊 Polymarket Signal

Market:
${market.question}

Signal:
${signalText}

Confidence:
${formatConfidence(signal.confidence)}

Reasoning:
${signal.reasoning}${warningBlock}

Mode:
Signal-only (no auto-trading)`;
}

export function formatSignalSummary(signal: SignalOutput, market: MarketState): string {
  return formatSignalTelegramMessage(signal, market);
}
