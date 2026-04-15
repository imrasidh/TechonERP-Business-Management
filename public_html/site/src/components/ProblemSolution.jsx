export function ProblemSolution() {
  const problems = [
    "Manual stock issues and mismatched counts",
    "Missed payments and unclear receivables",
    "No single view of profit or performance",
    "Spreadsheets and tools that don’t talk to each other",
  ];

  return (
    <section className="border-b border-white/5 bg-brand-950/50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-glass backdrop-blur-sm sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-300">Common problems</h3>
            <ul className="mt-6 space-y-4 text-slate-300">
              {problems.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-brand-600/30 bg-brand-900/40 p-6 shadow-glow backdrop-blur-sm sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-200">The solution</h3>
            <p className="mt-4 text-lg font-medium leading-relaxed text-white">
              TechonERP unifies sales, inventory, accounts, repairs, and reporting in one Windows app — built
              for real workflows, not slide decks.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Stay productive offline at the till; add optional sync when you need remote visibility.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
