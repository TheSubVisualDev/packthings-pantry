"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A text field that also drops down what's already in use.
 *
 * Not a <select>: tags and places are free text, and a strict list would mean
 * you can't file the first jar of something new without a code change. Not a
 * bare datalist either - browsers only surface those while you type, so the
 * existing options stay invisible until you guess one. This shows them.
 */
export function SoftSelect({
  id,
  name,
  options,
  defaultValue = "",
  className,
  onValueChange,
}: {
  id: string;
  name: string;
  options: string[];
  defaultValue?: string;
  className?: string;
  /** For callers holding the value themselves; the field still posts its own. */
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Options matching what's typed, so the list narrows as you go. An empty
  // field matches everything, which is what makes the chevron worth having.
  const needle = value.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.toLowerCase().includes(needle))
    : options;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function update(next: string) {
    setValue(next);
    onValueChange?.(next);
  }

  function choose(option: string) {
    update(option);
    setOpen(false);
    setActiveIndex(-1);
    input.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }

    // Enter only commits a highlighted suggestion. Without one it falls
    // through to submitting the form, which is what typing a new name means.
    if (event.key === "Enter" && open && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault();
      choose(matches[activeIndex]);
    }
  }

  return (
    <div ref={wrapper} className="relative">
      <input
        ref={input}
        id={id}
        name={name}
        type="text"
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        onChange={(event) => {
          update(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={className}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Hide existing categories" : "Show existing categories"}
        onClick={() => {
          setOpen((current) => !current);
          input.current?.focus();
        }}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
      >
        <span className={open ? "rotate-180 text-xs" : "text-xs"}>▼</span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[14px] border border-border bg-card py-1 shadow-[0_12px_28px_-12px_rgba(60,44,30,0.45)]"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-2.5 text-sm font-semibold text-muted-foreground">
              Not used here yet &mdash; it&apos;ll be created.
            </li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option === value}
                onMouseDown={(event) => {
                  // mousedown, not click: the input's blur would close the
                  // list before a click ever landed.
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-4 py-2.5 text-[15px] font-semibold ${
                  index === activeIndex ? "bg-chip" : ""
                }`}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
