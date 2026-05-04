// Anthropic published rates as of 2026-04. Update if pricing changes.
// Keys are normalized model identifiers (lowercase, dashes preserved).
const RATES: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  // Sonnet family
  "claude-sonnet-4-6": { inPerMTok: 3, outPerMTok: 15 },
  "claude-sonnet-4-5": { inPerMTok: 3, outPerMTok: 15 },
  "claude-sonnet-4": { inPerMTok: 3, outPerMTok: 15 },
  "claude-3-7-sonnet": { inPerMTok: 3, outPerMTok: 15 },
  // Opus family
  "claude-opus-4-7": { inPerMTok: 15, outPerMTok: 75 },
  "claude-opus-4-6": { inPerMTok: 15, outPerMTok: 75 },
  "claude-opus-4": { inPerMTok: 15, outPerMTok: 75 },
  // Haiku family
  "claude-haiku-4-5": { inPerMTok: 1, outPerMTok: 5 },
  "claude-haiku-4": { inPerMTok: 1, outPerMTok: 5 },
};

const DEFAULT_RATE = { inPerMTok: 3, outPerMTok: 15 }; // Sonnet — sane fallback.

export interface CostBreakdown {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export class CostTracker {
  private tokensIn = 0;
  private tokensOut = 0;
  private readonly inRate: number;
  private readonly outRate: number;

  constructor(model: string) {
    const key = model.toLowerCase().replace(/^anthropic\./, "").split("@")[0]!;
    // Match by prefix so `claude-sonnet-4-6-20260101` style ids still resolve.
    const matched = Object.entries(RATES).find(([k]) => key.startsWith(k));
    const rate = matched ? matched[1] : DEFAULT_RATE;
    this.inRate = rate.inPerMTok;
    this.outRate = rate.outPerMTok;
  }

  add(tokensIn: number, tokensOut: number): void {
    if (Number.isFinite(tokensIn) && tokensIn > 0) this.tokensIn += tokensIn;
    if (Number.isFinite(tokensOut) && tokensOut > 0) this.tokensOut += tokensOut;
  }

  snapshot(): CostBreakdown {
    const costUsd =
      (this.tokensIn / 1_000_000) * this.inRate +
      (this.tokensOut / 1_000_000) * this.outRate;
    return {
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // 6dp precision
    };
  }

  exceeds(capUsd: number): boolean {
    return this.snapshot().costUsd > capUsd;
  }
}
