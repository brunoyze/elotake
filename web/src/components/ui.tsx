"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-rec text-white hover:brightness-110",
        variant === "ghost" && "border border-line bg-panel text-fg hover:bg-panel-2",
        className,
      )}
    />
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted/80">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Choice({
  active,
  onClick,
  title,
  hint,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "group flex flex-col gap-2 rounded-xl border p-4 text-left transition",
        active ? "border-rec bg-rec-soft" : "border-line bg-panel hover:border-muted/50",
      )}
    >
      {children}
      <span className="font-medium">{title}</span>
      {hint && <span className="text-sm leading-snug text-muted">{hint}</span>}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-panel p-3 hover:border-muted/50">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-rec",
          checked ? "bg-rec" : "bg-line",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </label>
  );
}

export function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm transition",
            value === o.value ? "bg-fg text-ink" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg border border-rec/40 bg-rec-soft p-3 text-sm">{message}</p>;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
