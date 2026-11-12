import { useState } from "react";
import { X, Gift, Plus, Minus } from "lucide-react";
import type { Customer } from "@/types";

export default function LoyaltyDialog({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer;
  onClose: () => void;
  onSave: (points: number, notes: string) => void;
}) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState(10);
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-sm overflow-hidden max-h-[94dvh] md:max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="px-2.5 py-2 md:p-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Loyalty adjustment
            </div>
            <h2 className="font-display text-base md:text-xl font-bold truncate">
              {customer.name}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm h-7 w-7 p-0 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2.5 md:p-4 space-y-2.5 md:space-y-4">
          <div className="paper-card p-2 md:p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Gift className="w-4 h-4 text-magenta-reg shrink-0" />
              <span className="text-[10px] md:text-sm text-ink-mute truncate">
                Current balance
              </span>
            </div>
            <div className="num font-bold text-lg md:text-2xl shrink-0">
              {customer.loyaltyPoints}
            </div>
          </div>

          <div className="flex bg-paper border rounded-md p-0.5">
            {(["add", "remove"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 h-8 md:h-9 text-[11px] md:text-sm rounded ${
                  mode === m ? "bg-ink text-paper" : "text-ink-mute"
                }`}
              >
                {m === "add" ? (
                  <span className="inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add points
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> Remove points
                  </span>
                )}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="loyalty-points" className="label">Points</label>
            <input
              id="loyalty-points"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
              className="input mt-1 num text-right"
            />
          </div>

          <div>
            <label htmlFor="loyalty-reason" className="label">Reason (optional)</label>
            <input
              id="loyalty-reason"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Manual adjustment"
              className="input mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 px-2.5 md:px-4 pb-2.5 md:pb-4 border-t shrink-0">
          <button onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            onClick={() => onSave(mode === "add" ? amount : -amount, notes)}
            className="btn btn-primary"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
