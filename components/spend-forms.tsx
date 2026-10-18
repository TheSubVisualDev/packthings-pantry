"use client";

import { useActionState, useState, useTransition } from "react";
import { Confirm, TickBurst } from "@/components/ui/confirm";
import {
  addDueToList,
  markPaid,
  recordPayment,
  type SpendResult,
} from "@/app/spend/actions";

const FIELD =
  "min-h-11 w-full min-w-0 rounded-[14px] border border-border bg-card px-4 text-sm font-semibold outline-none focus:border-primary sm:min-h-10";
const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-label";
const SECONDARY =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-chip px-4 text-sm font-extrabold hover:bg-border disabled:opacity-60 sm:min-h-9";

/**
 * One suggested payment, made.
 *
 * Once it has gone through the row is about to vanish - the balance it came
 * from is zero now - so the tick is the only thing that says it worked before
 * the page redraws without it.
 */
export function MarkPaidButton({ from, to, pence }: { from: number; to: number; pence: number }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            const result = await markPaid(from, to, pence);
            if (result.ok) setDone(true);
            else setError(result.error ?? "That didn't save.");
          })
        }
        className={SECONDARY}
      >
        {done ? <TickBurst size={16} /> : null}
        {done ? "Paid" : pending ? "Saving…" : "Mark paid"}
      </button>
      {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}

export function AddToListButton({ name, every }: { name: string; every: number }) {
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending || said !== null}
        onClick={() =>
          startTransition(async () => {
            const result = await addDueToList(name, every);
            if (result.ok) setSaid(result.message ?? "On the list");
            else setError(result.error ?? "That didn't save.");
          })
        }
        className={SECONDARY}
      >
        {said !== null && <TickBurst size={16} />}
        {said ?? (pending ? "Adding…" : "Add to list")}
      </button>
      {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Any payment, not only a suggested one.
 *
 * People settle in round numbers and at odd times - "I'll give you twenty
 * now" - so the suggestions cannot be the only way in. The form resets after
 * a payment is recorded by being remounted with a new key.
 */
export function PaymentForm({
  people,
  me,
  today,
}: {
  people: { id: number; name: string }[];
  me: number;
  today: string;
}) {
  const [round, setRound] = useState(0);
  return (
    <>
      <PaymentFields key={round} people={people} me={me} today={today} onDone={() => setRound((n) => n + 1)} />
      {/* Out here rather than in the fields, which are thrown away on success. */}
      <div className="mt-3">
        <Confirm key={round} show={round > 0} label="Payment recorded">
          Recorded.
        </Confirm>
      </div>
    </>
  );
}

function PaymentFields({
  people,
  me,
  today,
  onDone,
}: {
  people: { id: number; name: string }[];
  me: number;
  today: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<SpendResult, FormData>(async (previous, formData) => {
    const result = await recordPayment(previous, formData);
    if (result.ok) onDone();
    return result;
  }, { ok: true });

  const other = people.find((person) => person.id !== me)?.id ?? people[0]?.id;

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="pay-from" className={LABEL}>
            From
          </label>
          <select id="pay-from" name="from" defaultValue={me} className={`mt-1.5 ${FIELD}`}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pay-to" className={LABEL}>
            To
          </label>
          <select id="pay-to" name="to" defaultValue={other} className={`mt-1.5 ${FIELD}`}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pay-amount" className={LABEL}>
            Amount
          </label>
          <input
            id="pay-amount"
            name="amount"
            inputMode="decimal"
            placeholder="12.40"
            required
            className={`mt-1.5 ${FIELD}`}
          />
        </div>
        <div>
          <label htmlFor="pay-date" className={LABEL}>
            Day
          </label>
          <input
            id="pay-date"
            name="on_date"
            type="date"
            defaultValue={today}
            max={today}
            className={`mt-1.5 ${FIELD}`}
          />
        </div>
      </div>
      <div>
        <label htmlFor="pay-note" className={LABEL}>
          Note
        </label>
        <input
          id="pay-note"
          name="note"
          maxLength={200}
          placeholder="Optional"
          className={`mt-1.5 ${FIELD}`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-[14px] bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
      {!state.ok && state.error && (
        <p className="text-sm font-semibold text-destructive">{state.error}</p>
      )}
    </form>
  );
}
