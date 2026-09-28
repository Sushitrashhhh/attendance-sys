import React, { useEffect, useRef } from 'react';

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const button = {
  primary: `${btnBase} bg-accent text-white hover:bg-accent-hover`,
  secondary: `${btnBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-100`,
  danger: `${btnBase} bg-red-600 text-white hover:bg-red-700`,
  small: 'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
};

export const table = {
  wrap: 'overflow-x-auto',
  el: 'w-full text-left text-sm',
  th: 'border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-medium text-stone-500',
  td: 'border-b border-stone-100 px-4 py-3 align-middle',
};

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-stone-200 bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="px-6 py-10 text-center text-sm text-stone-500">{children}</div>
);

export const Loading = () => <div className="px-6 py-10 text-center text-sm text-stone-400">Loading…</div>;

export const ErrorNote = ({ message }: { message: string }) => (
  <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
    {message}
  </div>
);

export const MethodTag = ({ method }: { method: 'face' | 'manual' }) =>
  method === 'manual' ? (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Manual</span>
  ) : (
    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-600">Camera</span>
  );

export const LateTag = ({ status }: { status: string }) =>
  status === 'late' ? <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-800">Late</span> : null;

export function Pager({
  skip,
  limit,
  total,
  onChange,
}: {
  skip: number;
  limit: number;
  total: number;
  onChange: (skip: number) => void;
}) {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-stone-500">
      <span>
        {skip + 1}–{Math.min(skip + limit, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button className={button.secondary} disabled={skip === 0} onClick={() => onChange(Math.max(0, skip - limit))}>
          Previous
        </button>
        <button className={button.secondary} disabled={skip + limit >= total} onClick={() => onChange(skip + limit)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Native <dialog>: gives focus trapping and Esc-to-close for free. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="w-full max-w-md rounded-lg border border-stone-200 p-0 shadow-xl"
    >
      <div className="border-b border-stone-200 px-5 py-3 text-sm font-semibold">{title}</div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
    {children}
  </label>
);
