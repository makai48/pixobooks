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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-sm overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Loyalty adjustment
            </div>
            <h2 className="font-display text-xl font-bold">{customer.name}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="paper-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-magenta-reg" />
              <span className="text-sm text-ink-mute">Current balance</span>
            </div>
            <div className="num font-bold text-2xl">{customer.loyaltyPoints}</div>
          </div>

          <div className="flex bg-paper border rounded-md p-0.5">
            {(["add", "remove"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 h-9 text-sm rounded ${
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

          <div className="flex justify-end gap-2 pt-2 border-t">
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
    </div>
  );
}
