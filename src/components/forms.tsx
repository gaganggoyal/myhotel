"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialActionState, type ActionState } from "@/lib/action";
import { Alert, buttonClass, cx, type ButtonVariant } from "./ui";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SubmitButton({ children, variant = "primary", className, pendingLabel }: { children: ReactNode; variant?: ButtonVariant; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, className)}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

/**
 * A form bound to a server action with inline success/error feedback.
 * `confirm` shows a browser confirmation before destructive actions.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save changes",
  submitVariant = "primary",
  pendingLabel,
  className,
  confirm,
  hideSubmit,
  footer,
  encType,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel?: string;
  submitVariant?: ButtonVariant;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  hideSubmit?: boolean;
  footer?: ReactNode;
  encType?: "multipart/form-data";
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.message) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.at, state.message]);
  return (
    <form
      action={formAction}
      encType={encType}
      className={cx("space-y-5", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div ref={ref} aria-live="polite">
        {state.message ? <Alert tone={state.ok ? "good" : "bad"}>{state.message}</Alert> : null}
      </div>
      {hideSubmit ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant={submitVariant} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
          {footer}
        </div>
      )}
    </form>
  );
}

/** One-button form for simple actions (publish, delete, resend) with optional confirmation. */
export function ActionButton({
  action,
  label,
  variant = "secondary",
  confirm,
  hidden,
  className,
}: {
  action: Action;
  label: string;
  variant?: ButtonVariant;
  confirm?: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      className={cx("inline-flex flex-col gap-1", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} pendingLabel="Working…">
        {label}
      </SubmitButton>
      {state.message ? <span className={cx("text-xs", state.ok ? "text-emerald-700" : "text-red-700")}>{state.message}</span> : null}
    </form>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "px-2.5 py-1 text-xs")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked; the value is visible to copy by hand */
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
