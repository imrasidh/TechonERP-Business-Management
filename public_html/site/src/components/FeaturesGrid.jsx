import { SectionTitle } from "./SectionTitle";

const features = [
  {
    title: "Sales & Billing",
    desc: "Fast invoicing, POS-style flows, and print-ready documents.",
    icon: IconReceipt,
  },
  {
    title: "Inventory Management",
    desc: "Stock levels, valuations, and low-stock visibility you can trust.",
    icon: IconCube,
  },
  {
    title: "Accounting (auto journal)",
    desc: "Postings that follow your operations — less manual rework.",
    icon: IconBook,
  },
  {
    title: "Returns Handling",
    desc: "Sales and purchase returns with clear audit trails.",
    icon: IconArrowPath,
  },
  {
    title: "Repairs Management",
    desc: "Track jobs from intake to delivery with consistent status.",
    icon: IconWrench,
  },
  {
    title: "Reports & Analytics",
    desc: "P&L, inventory, customers, and business summaries.",
    icon: IconChart,
  },
  {
    title: "Customers & Suppliers",
    desc: "Profiles, history, and balances in one place.",
    icon: IconUsers,
  },
  {
    title: "Receivables & Payables",
    desc: "What you're owed and what you owe — always visible.",
    icon: IconScale,
  },
];

function IconReceipt(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14h6M9 10h6M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-3-2-3 2z" />
    </svg>
  );
}
function IconCube(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
function IconBook(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
function IconArrowPath(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function IconWrench(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconChart(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function IconScale(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  );
}

export function FeaturesGrid() {
  return (
    <section id="features" className="border-b border-white/5 bg-page-dark py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionTitle subtitle="Core modules — integrated, not bolted on.">Key features</SectionTitle>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ title, desc, icon: Icon }) => (
            <article
              key={title}
              className="group flex gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-glass backdrop-blur-sm transition duration-200 hover:border-brand-500/25 hover:bg-white/[0.06]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-800/60 text-brand-200 ring-1 ring-brand-500/20 transition group-hover:bg-brand-700/60 group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
