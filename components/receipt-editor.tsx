"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  addReceiptLine,
  closeReceipt,
  editLine,
  removeLine,
  removeReceipt,
  reopenReceipt,
  setLineEaters,
  setLineMealTags,
  updateReceiptFacts,
  type FactsInput,
  type LineInput,
  type SaveResult,
} from "@/app/receipts/actions";
import type { Category, LineRow, Person, ReceiptSummary } from "@/lib/receipt-db";
import { MEAL_KINDS, MEAL_KIND_LABEL, aliasKey, pounds, type MealKind } from "@/lib/receipts";

const CARD = "rounded-[20px] bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]";
const BOX = "rounded-[12px] border border-border bg-background px-3 py-2.5 text-[15px] font-semibold";
const FIELD = `w-full ${BOX}`;
const LABEL = "text-[13px] font-extrabold text-muted-foreground";

interface MealOption {
  id: number;
  name: string;
  kind: MealKind;
}

function penceText(pence: number | null): string {
  return pence === null ? "" : (pence / 100).toFixed(2);
}

/**
 * One receipt, and everything still to say about it.
 *
 * The checklist sits at the top because it is the reason anybody opens this:
 * Sam's "semi-completed receipts have to have a checklist ordered by
 * importance". Under it the receipt's own facts, then the lines, each one a
 * row until tapped. A line opened shows every question about it at once -
 * category, long-term, a snack and whose, who shared it, which meals - because
 * those get answered together, by somebody holding the receipt and
 * remembering the shop, and a screen per question would be a screen per tap.
 *
 * Every change saves as it is made and then refreshes from the server, so the
 * checklist is always the server's opinion and never a second one kept here.
 */
export function ReceiptEditor({
  receipt,
  lines,
  household,
  categories,
  meals,
  shops,
  canEdit,
  me,
}: {
  receipt: ReceiptSummary;
  lines: LineRow[];
  household: Person[];
  categories: Category[];
  meals: MealOption[];
  shops: string[];
  canEdit: boolean;
  me: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [only, setOnly] = useState<number[] | null>(null);
  const closed = receipt.status === "closed";
  const editable = canEdit && !closed;

  function run(action: () => Promise<SaveResult>, after?: (result: SaveResult) => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That didn't save.");
        return;
      }
      after?.(result);
      router.refresh();
    });
  }

  const saveFacts = (input: FactsInput) => run(() => updateReceiptFacts(receipt.id, input));
  const shown = only ? lines.filter((line) => only.includes(line.id)) : lines;
  const total = receipt.total_pence;

  return (
    <div className="space-y-4" aria-busy={busy}>
      <header className="mt-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
          {receipt.shop_name ?? "A receipt"}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {receipt.line_count} {receipt.line_count === 1 ? "line" : "lines"} · {pounds(receipt.lines_pence)}
          {total !== null && total !== receipt.lines_pence ? ` · till said ${pounds(total)}` : ""}
          {closed ? " · closed" : ""}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-[14px] bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {!closed && receipt.checklist.length > 0 && (
        <section className={CARD}>
          <h2 className="text-[17px] font-extrabold">Still to say</h2>
          <ol className="mt-2 space-y-1.5">
            {receipt.checklist.map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3 text-sm font-bold">
                <span className={item.hard ? "text-destructive" : ""}>
                  {item.hard ? "● " : "○ "}
                  {item.label}
                </span>
                {item.lines && (
                  <button
                    type="button"
                    onClick={() => setOnly(only === item.lines ? null : item.lines ?? null)}
                    className="shrink-0 text-muted-foreground underline underline-offset-2"
                  >
                    {only === item.lines ? "Show all" : "Show them"}
                  </button>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13px] font-semibold text-muted-foreground">
            ● needed to split it fairly. ○ makes the numbers better; fine to leave.
          </p>
        </section>
      )}

      <section className={CARD}>
        <h2 className="text-[17px] font-extrabold">The receipt</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2 sm:col-span-1">
            <span className={LABEL}>Who paid</span>
            <select
              className={`${FIELD} mt-1`}
              disabled={!editable}
              value={receipt.purchaser_id ?? ""}
              onChange={(event) =>
                saveFacts({ purchaser_id: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Not sure yet</option>
              {household.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === me ? `${person.name} (me)` : person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className={LABEL}>Day</span>
            <input
              type="date"
              className={`${FIELD} mt-1`}
              disabled={!editable}
              defaultValue={receipt.bought_on ?? ""}
              onBlur={(event) => {
                const value = event.target.value || null;
                if (value !== receipt.bought_on) saveFacts({ bought_on: value });
              }}
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className={LABEL}>Shop</span>
            <input
              list="receipt-shops"
              className={`${FIELD} mt-1`}
              disabled={!editable}
              defaultValue={receipt.shop_name ?? ""}
              placeholder="Tesco, Lucky Star…"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (receipt.shop_name ?? "")) saveFacts({ shop: value || null });
              }}
            />
            <datalist id="receipt-shops">
              {shops.map((shop) => (
                <option key={shop} value={shop} />
              ))}
            </datalist>
          </label>
          <label>
            <span className={LABEL}>Card ending</span>
            <input
              inputMode="numeric"
              maxLength={4}
              className={`${FIELD} mt-1`}
              disabled={!editable}
              defaultValue={receipt.card_last4 ?? ""}
              placeholder="1234"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (receipt.card_last4 ?? "")) saveFacts({ card_last4: value || null });
              }}
            />
          </label>
          <label>
            <span className={LABEL}>Total paid</span>
            <input
              inputMode="decimal"
              className={`${FIELD} mt-1`}
              disabled={!editable}
              defaultValue={penceText(receipt.total_pence)}
              placeholder="0.00"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== penceText(receipt.total_pence)) saveFacts({ total: value });
              }}
            />
          </label>
          <label className="col-span-2">
            <span className={LABEL}>Note</span>
            <input
              className={`${FIELD} mt-1`}
              disabled={!editable}
              defaultValue={receipt.note ?? ""}
              placeholder="Anything worth remembering about this shop"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (receipt.note ?? "")) saveFacts({ note: value || null });
              }}
            />
          </label>
        </div>
      </section>

      <section className={`${CARD} px-0 pb-2`}>
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[17px] font-extrabold">
            {only ? `${shown.length} of ${lines.length} lines` : "Lines"}
          </h2>
          {only && (
            <button type="button" onClick={() => setOnly(null)} className="text-sm font-bold text-muted-foreground underline underline-offset-2">
              Show all
            </button>
          )}
        </div>
        {lines.length === 0 && (
          <p className="px-5 pt-2 pb-3 text-sm font-semibold text-muted-foreground">
            Nothing on it yet. Add what was bought below.
          </p>
        )}
        <ul className="mt-2 divide-y divide-border">
          {shown.map((line) => (
            <li key={line.id}>
              <LineRowView
                line={line}
                open={open === line.id}
                onToggle={() => setOpen(open === line.id ? null : line.id)}
                categories={categories}
                household={household}
              />
              {open === line.id && (
                <LineEditor
                  key={`${line.id}-${line.snack}-${line.eaters.join(",")}-${line.meals.join(",")}`}
                  line={line}
                  categories={categories}
                  household={household}
                  meals={meals}
                  purchaser={receipt.purchaser_id}
                  editable={editable}
                  busy={busy}
                  onEdit={(input) => run(() => editLine(receipt.id, line.id, input))}
                  onEaters={(people) => run(() => setLineEaters(receipt.id, line.id, people))}
                  onMeals={(ids, created) => run(() => setLineMealTags(receipt.id, line.id, ids, created))}
                  onRemove={() => run(() => removeLine(receipt.id, line.id), () => setOpen(null))}
                />
              )}
            </li>
          ))}
        </ul>
        {editable && <AddLine busy={busy} onAdd={(input) => run(() => addReceiptLine(receipt.id, input))} />}
      </section>

      {canEdit && (
        <section className="flex flex-wrap gap-2 pt-2">
          {closed ? (
            <button type="button" disabled={busy} onClick={() => run(() => reopenReceipt(receipt.id))} className="flex items-center gap-2 rounded-[14px] bg-chip px-5 py-3 text-sm font-bold">
              <RotateCcw className="h-4 w-4" /> Reopen it
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => closeReceipt(receipt.id), () => router.push("/receipts"))}
              className="flex items-center gap-2 rounded-[14px] bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground"
            >
              <Archive className="h-4 w-4" />
              {receipt.state === "done" ? "Close it" : "Close it, nothing more to say"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete this receipt? It comes out of the split and the spend.")) {
                run(() => removeReceipt(receipt.id), () => router.push("/receipts"));
              }
            }}
            className="flex items-center gap-2 rounded-[14px] px-4 py-3 text-sm font-bold text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </section>
      )}
      {!closed && receipt.state === "nearly" && (
        <p className="text-[13px] font-semibold text-muted-foreground">
          Closing it with things still unsaid is fine - it still counts. It just stops asking.
        </p>
      )}
    </div>
  );
}

/**
 * Whether the till's wording says something the name does not. "PAK CHOI
 * 1.10" under "Pak Choi" is the same words shouting, and repeating it under
 * every line made the list twice as long to read.
 */
function renamed(line: LineRow): boolean {
  return Boolean(line.raw) && aliasKey(line.raw ?? "") !== aliasKey(line.name);
}

function sharedBy(line: LineRow, household: Person[]): string {
  if (line.snack) {
    if (line.eaters.length === 0) return "a snack, for someone else";
    const who = household.find((person) => person.id === line.eaters[0]);
    return `${who?.name ?? "someone"}'s snack`;
  }
  if (line.eaters.length === 0) return "";
  return line.eaters
    .map((id) => household.find((person) => person.id === id)?.name ?? "?")
    .join(", ");
}

function LineRowView({
  line,
  open,
  onToggle,
  categories,
  household,
}: {
  line: LineRow;
  open: boolean;
  onToggle: () => void;
  categories: Category[];
  household: Person[];
}) {
  const category = categories.find((c) => c.id === line.category_id)?.name;
  const who = sharedBy(line, household);
  const details = [
    line.count > 1 ? `×${line.count}` : null,
    category ?? null,
    line.long_term ? "long-term" : null,
    who || null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-3 px-5 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold">{line.name}</p>
        <p className="truncate text-[13px] font-semibold text-muted-foreground">
          {details.length > 0 ? details.join(" · ") : renamed(line) ? line.raw : "Tap to say more"}
        </p>
      </div>
      <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${line.pence === null ? "text-destructive" : ""}`}>
        {line.pence === null ? "no price" : pounds(line.pence)}
      </span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function Chip({
  on,
  children,
  onClick,
  disabled,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors ${
        on ? "bg-primary text-primary-foreground" : "bg-chip"
      }`}
    >
      {children}
    </button>
  );
}

function LineEditor({
  line,
  categories,
  household,
  meals,
  purchaser,
  editable,
  busy,
  onEdit,
  onEaters,
  onMeals,
  onRemove,
}: {
  line: LineRow;
  categories: Category[];
  household: Person[];
  meals: MealOption[];
  purchaser: number | null;
  editable: boolean;
  busy: boolean;
  onEdit: (input: LineInput) => void;
  onEaters: (people: number[]) => void;
  onMeals: (ids: number[], created?: { name: string; kind: MealKind }) => void;
  onRemove: () => void;
}) {
  const [newMeal, setNewMeal] = useState("");
  const [newKind, setNewKind] = useState<MealKind>("riff");
  const disabled = !editable || busy;

  function toggleEater(id: number) {
    const next = line.eaters.includes(id) ? line.eaters.filter((e) => e !== id) : [...line.eaters, id];
    onEaters(next);
  }

  function toggleMeal(id: number) {
    const next = line.meals.includes(id) ? line.meals.filter((m) => m !== id) : [...line.meals, id];
    onMeals(next);
  }

  return (
    <div className="space-y-4 bg-background/60 px-5 pt-1 pb-5">
      {renamed(line) && (
        <p className="font-mono text-[12px] text-muted-foreground">On the receipt: {line.raw}</p>
      )}

      <div className="grid grid-cols-[1fr_96px_64px] gap-2">
        <label>
          <span className={LABEL}>What it is</span>
          <input
            className={`${FIELD} mt-1`}
            disabled={disabled}
            defaultValue={line.name}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== line.name) onEdit({ name: value });
            }}
          />
        </label>
        <label>
          <span className={LABEL}>Price</span>
          <input
            inputMode="decimal"
            className={`${FIELD} mt-1`}
            disabled={disabled}
            defaultValue={penceText(line.pence)}
            placeholder="0.00"
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== penceText(line.pence)) onEdit({ price: value });
            }}
          />
        </label>
        <label>
          <span className={LABEL}>How many</span>
          <input
            inputMode="numeric"
            className={`${FIELD} mt-1`}
            disabled={disabled}
            defaultValue={line.count}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value !== line.count) onEdit({ count: value });
            }}
          />
        </label>
      </div>

      <div>
        <p className={LABEL}>What kind of thing</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <Chip
              key={category.id}
              on={line.category_id === category.id}
              disabled={disabled}
              onClick={() => onEdit({ category_id: line.category_id === category.id ? null : category.id })}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip on={Boolean(line.long_term)} disabled={disabled} onClick={() => onEdit({ long_term: !line.long_term })}>
          Long-term (lasts ages)
        </Chip>
        <Chip on={Boolean(line.used_whole)} disabled={disabled} onClick={() => onEdit({ used_whole: !line.used_whole })}>
          Used up in one meal
        </Chip>
        <Chip on={Boolean(line.snack)} disabled={disabled} onClick={() => onEdit({ snack: !line.snack })}>
          Someone&apos;s snack
        </Chip>
      </div>

      {line.snack ? (
        <div>
          <p className={LABEL}>Whose snack</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {household.map((person) => (
              <Chip
                key={person.id}
                on={line.eaters[0] === person.id}
                disabled={disabled}
                onClick={() => onEaters(line.eaters[0] === person.id ? [] : [person.id])}
              >
                {person.name}
              </Chip>
            ))}
            <Chip on={line.eaters.length === 0} disabled={disabled} onClick={() => onEaters([])}>
              Someone else
            </Chip>
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
            {line.eaters.length === 0
              ? `Out of the split${purchaser ? " - whoever paid covers it" : ""}.`
              : "They cover it on their own."}
          </p>
        </div>
      ) : (
        <div>
          <p className={LABEL}>Shared by</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip on={line.eaters.length === 0} disabled={disabled} onClick={() => onEaters([])}>
              Everyone
            </Chip>
            {household.map((person) => (
              <Chip key={person.id} on={line.eaters.includes(person.id)} disabled={disabled} onClick={() => toggleEater(person.id)}>
                {person.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {!line.snack && (
        <div>
          <p className={LABEL}>
            For which meals{line.used_whole ? " (one, it's used up)" : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {meals.map((meal) => (
              <Chip key={meal.id} on={line.meals.includes(meal.id)} disabled={disabled} onClick={() => toggleMeal(meal.id)}>
                {meal.name}
              </Chip>
            ))}
          </div>
          {editable && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = newMeal.trim();
                if (!name) return;
                onMeals(line.meals, { name, kind: newKind });
                setNewMeal("");
              }}
            >
              <input
                className={`${BOX} min-w-0 flex-1`}
                value={newMeal}
                onChange={(event) => setNewMeal(event.target.value)}
                placeholder="A new meal: ramen, spag bol…"
                disabled={busy}
              />
              <select
                className={`${BOX} shrink-0`}
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as MealKind)}
                disabled={busy}
                aria-label="What kind of meal"
              >
                {MEAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MEAL_KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy || !newMeal.trim()} className="rounded-[12px] bg-chip px-3 text-sm font-bold">
                Add meal
              </button>
            </form>
          )}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-bold text-muted-foreground">More: amount, use-by</summary>
        <div className="mt-3 grid grid-cols-[1fr_96px_1fr] gap-2">
          <label>
            <span className={LABEL}>Amount</span>
            <input
              inputMode="decimal"
              className={`${FIELD} mt-1`}
              disabled={disabled}
              defaultValue={line.amount ?? ""}
              onBlur={(event) => {
                const text = event.target.value.trim();
                const value = text === "" ? null : Number(text);
                if (value !== line.amount && (value === null || Number.isFinite(value))) onEdit({ amount: value });
              }}
            />
          </label>
          <label>
            <span className={LABEL}>Unit</span>
            <select
              className={`${FIELD} mt-1`}
              disabled={disabled}
              value={line.unit ?? ""}
              onChange={(event) => onEdit({ unit: event.target.value || null })}
            >
              <option value="">-</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="count">pieces</option>
            </select>
          </label>
          <label>
            <span className={LABEL}>Use by</span>
            <input
              type="date"
              className={`${FIELD} mt-1`}
              disabled={disabled}
              defaultValue={line.use_by ?? ""}
              onBlur={(event) => {
                const value = event.target.value || null;
                if (value !== line.use_by) onEdit({ use_by: value });
              }}
            />
          </label>
        </div>
      </details>

      {editable && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Take ${line.name} off this receipt?`)) onRemove();
          }}
          className="flex items-center gap-1.5 text-sm font-bold text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Not on this receipt
        </button>
      )}
    </div>
  );
}

function AddLine({ busy, onAdd }: { busy: boolean; onAdd: (input: { name: string; price: string; count: number }) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <form
      className="mt-2 flex gap-2 border-t border-border px-5 pt-4 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd({ name, price, count: 1 });
        setName("");
        setPrice("");
      }}
    >
      <input
        className={`${BOX} min-w-0 flex-1`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add a line: chicken thighs"
        disabled={busy}
        aria-label="What was bought"
      />
      <input
        className={`${BOX} w-24 shrink-0`}
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        placeholder="0.00"
        disabled={busy}
        aria-label="Price"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        aria-label="Add the line"
        className="flex w-11 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}
