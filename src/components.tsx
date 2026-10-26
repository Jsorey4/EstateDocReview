import { ArrowUpRight, Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "neutral" | "blue";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  icon,
  iconAction,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  // Makes the icon itself a button, for empty states whose icon reads as "add".
  iconAction?: { label: string; onClick: () => void };
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {iconAction ? (
        <button
          className="empty-icon empty-icon-button"
          aria-label={iconAction.label}
          onClick={iconAction.onClick}
        >
          {icon}
        </button>
      ) : (
        <div className="empty-icon">{icon}</div>
      )}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const close = (e: Event) => {
      e.preventDefault();
      callback.current();
    };
    dialog.addEventListener("cancel", close);
    return () => {
      dialog.removeEventListener("cancel", close);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Questionnaire completion"
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Tick({ done }: { done: boolean }) {
  return (
    <span className={`tick ${done ? "done" : ""}`}>
      {done && <Check size={12} />}
    </span>
  );
}
export const disclaimer = "Not a substitute for the advice of an attorney.";
