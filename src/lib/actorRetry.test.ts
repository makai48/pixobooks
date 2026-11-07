import { describe, expect, it } from "vitest";
import { resolveActor } from "@/lib/actor";
import { selectRetryable, type QueueOperation } from "@/lib/offlineQueue";

const op = (over: Partial<QueueOperation>): QueueOperation => ({
  id: "op1",
  type: "sale.complete",
  payload: {},
  status: "pending",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  retryCount: 0,
  ...over,
});

describe("resolveActor", () => {
  it("prefers the profile", () => {
    expect(
      resolveActor(
        { id: "p1", name: "Mary", email: "m@x.com", role: "Admin" } as never,
        { id: "u1", email: "m@x.com" } as never
      )
    ).toEqual({ id: "p1", name: "Mary", role: "Admin" });
  });

  it("falls back to the auth user instead of Unknown", () => {
    expect(
      resolveActor(null, { id: "u1", email: "john@shop.com" } as never)
    ).toEqual({ id: "u1", name: "john", role: undefined });
  });

  it("returns undefined with no session at all", () => {
    expect(resolveActor(null, null)).toBeUndefined();
    expect(resolveActor(undefined, undefined)).toBeUndefined();
  });
});

describe("selectRetryable", () => {
  it("always takes pending, skips syncing/synced", () => {
    const now = Date.now();
    const ops = [
      op({ id: "a", status: "pending" }),
      op({ id: "b", status: "syncing" }),
      op({ id: "c", status: "synced" }),
    ];
    expect(selectRetryable(ops, now).map((o) => o.id)).toEqual(["a"]);
  });

  it("retries failed/conflict only after backoff and under caps", () => {
    const now = Date.now();
    const old = new Date(now - 10 * 60 * 1000).toISOString();
    const ops = [
      op({ id: "fresh-fail", status: "failed", retryCount: 1, updatedAt: new Date(now).toISOString() }),
      op({ id: "old-fail", status: "failed", retryCount: 1, updatedAt: old }),
      op({ id: "dead-fail", status: "failed", retryCount: 10, updatedAt: old }),
      op({ id: "old-conflict", status: "conflict", retryCount: 1, updatedAt: old }),
      op({ id: "dead-conflict", status: "conflict", retryCount: 8, updatedAt: old }),
    ];
    expect(selectRetryable(ops, now).map((o) => o.id).sort()).toEqual(["old-conflict", "old-fail"]);
  });
});
