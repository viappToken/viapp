"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Grain } from "@/components/hero/Grain";
import { useMediaQuery } from "@/components/hero/useMediaQuery";
import { addressUrl, shortHex, sourceUrl, STELLAR_VAULT_ID } from "@/lib/proof";
import "./sections.css";

const STATE_OPEN = 1;
const STATE_CLAIMED = 2;
const STATE_REFUNDED = 3;
const LATEST_ROWS = 6;
const COUNT_UP_MS = 1200;
const VISIBLE_FRACTION = 0.4;
const STATS_TIMEOUT_MS = 20_000;

type LatestGift = { id: number; token: string; symbol?: string; state: number };

type Counts = { made: number; opened: number; waiting: number; latest: LatestGift[] };

type CountsState = { status: "loading" } | { status: "ready"; counts: Counts } | { status: "failed" };

/** Reads live on-chain gift statistics from the deployed Soroban GiftVault contract via /api/stats. */
async function readCounts(): Promise<Counts> {
  const res = await fetch("/api/stats", {
    signal: AbortSignal.timeout(STATS_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to read Stellar vault stats");
  const data = (await res.json()) as {
    ok?: boolean;
    made?: number;
    opened?: number;
    waiting?: number;
    latest?: LatestGift[];
  };
  if (!data || data.ok !== true) throw new Error("Invalid stats response");
  return {
    made: Number(data.made ?? 0),
    opened: Number(data.opened ?? 0),
    waiting: Number(data.waiting ?? 0),
    latest: Array.isArray(data.latest) ? data.latest.slice(0, LATEST_ROWS) : [],
  };
}

function useCounts(): { state: CountsState; reload: () => void } {
  const [state, setState] = useState<CountsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readCounts().then(
      (counts) => {
        if (!cancelled) setState({ status: "ready", counts });
      },
      () => {
        if (!cancelled) setState({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  }, []);
  return { state, reload };
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function Figure({ value, label, play, reduced }: { value: number; label: string; play: boolean; reduced: boolean }) {
  const digits = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = digits.current;
    if (!node) return;
    if (reduced) {
      node.textContent = String(value);
      return;
    }
    if (!play) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      node.textContent = String(Math.round(value * easeOutCubic(progress)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, play, reduced]);

  return (
    <div className="live-item">
      <p className="live-figure">
        <span ref={digits} aria-hidden="true">
          {reduced ? value : 0}
        </span>
        <span className="sr-only">{value}</span>
      </p>
      <p className="sec-label live-caption">{label}</p>
    </div>
  );
}

function SkeletonFigure({ label }: { label: string }) {
  return (
    <div className="live-item">
      <span className="skeleton-line live-skeleton" aria-label="Loading" />
      <p className="sec-label live-caption">{label}</p>
    </div>
  );
}

const CHIPS: Readonly<Record<number, { text: string; tone: string }>> = {
  [STATE_OPEN]: { text: "WAITING", tone: "waiting" },
  [STATE_CLAIMED]: { text: "OPENED", tone: "opened" },
  [STATE_REFUNDED]: { text: "TAKEN BACK", tone: "taken-back" },
};

function LatestGifts({ state, play, reduced }: { state: CountsState; play: boolean; reduced: boolean }) {
  const gifts = state.status === "ready" ? state.counts.latest.filter((gift) => CHIPS[gift.state] !== undefined) : null;
  if (gifts !== null && gifts.length === 0) return null;

  return (
    <div className="latest" data-motion={reduced ? undefined : "on"} data-play={play ? "true" : undefined}>
      <p className="sec-label" id="latest-label">
        LATEST GIFTS
      </p>
      <ol className="latest-list" aria-labelledby="latest-label" aria-busy={gifts === null}>
        {gifts !== null
          ? gifts.map((gift, index) => {
              const chip = CHIPS[gift.state];
              return (
                <li className="latest-row latest-row-live" key={gift.id} style={{ "--i": index } as CSSProperties}>
                  <span className="latest-id">#{gift.id}</span>
                  <span className="latest-symbol">{gift.symbol ?? shortHex(gift.token)}</span>
                  <span className={`latest-chip latest-chip-${chip?.tone}`}>{chip?.text}</span>
                </li>
              );
            })
          : Array.from({ length: LATEST_ROWS }, (_, index) => (
              <li className="latest-row" key={index}>
                <span className="skeleton-line latest-skeleton" aria-label="Loading" />
              </li>
            ))}
      </ol>
    </div>
  );
}

export function LiveNumbers() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { state, reload } = useCounts();
  const band = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = band.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: VISIBLE_FRACTION },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="live" ref={band} aria-labelledby="live-label">
      <div className="live-rule" aria-hidden="true" />
      <div className="live-inner">
        <p className="sec-label" id="live-label">
          LIVE ON STELLAR
        </p>
        <div className="live-body">
          {state.status === "failed" ? (
            <div className="live-failed">
              <p className="live-failed-text">Could not reach Stellar Soroban RPC just now.</p>
              <button type="button" className="gold-link live-retry" onClick={reload}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="live-row">
                {state.status === "ready" ? (
                  <>
                    <Figure value={state.counts.made} label="GIFTS MADE" play={visible} reduced={reduced} />
                    <Figure value={state.counts.opened} label="OPENED" play={visible} reduced={reduced} />
                    <Figure value={state.counts.waiting} label="WAITING TO BE OPENED" play={visible} reduced={reduced} />
                  </>
                ) : (
                  <>
                    <SkeletonFigure label="GIFTS MADE" />
                    <SkeletonFigure label="OPENED" />
                    <SkeletonFigure label="WAITING TO BE OPENED" />
                  </>
                )}
              </div>
              <LatestGifts state={state} play={visible} reduced={reduced} />
            </>
          )}
        </div>
        <p className="live-source">
          Read live from the viapp Soroban vault{" "}
          <a className="draw-link" href={addressUrl(STELLAR_VAULT_ID)} target="_blank" rel="noopener noreferrer">
            {shortHex(STELLAR_VAULT_ID)}
          </a>{" "}
          ·{" "}
          <a className="draw-link" href={sourceUrl(STELLAR_VAULT_ID)} target="_blank" rel="noopener noreferrer">
            verified on StellarExpert
          </a>
        </p>
      </div>
      <Grain />
    </section>
  );
}
