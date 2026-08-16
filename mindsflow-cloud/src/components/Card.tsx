// Cartão padrão do app. Existe para o espaçamento e a sombra serem os
// mesmos em toda tela — mude aqui e muda em todo lugar.

export function Card({
  title,
  hint,
  children,
  action,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
      {title || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
            ) : null}
            {hint ? (
              <p className="mt-0.5 text-xs text-brand-400">{hint}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-brand-900">{value}</p>
    </div>
  );
}
