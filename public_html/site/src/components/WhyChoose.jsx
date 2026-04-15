import { SectionTitle } from "./SectionTitle";

const pillars = [
  {
    title: "Offline + cloud flexibility",
    desc: "Work at the counter without internet. Add sync when you need visibility outside the shop.",
    Icon: IconCloud,
  },
  {
    title: "Accounting integrity",
    desc: "Operations map to your books — fewer surprises at month-end.",
    Icon: IconShield,
  },
  {
    title: "Data you control",
    desc: "Local-first storage, backups, and licensing — your records stay yours.",
    Icon: IconDatabase,
  },
  {
    title: "Built for real shops",
    desc: "POS, stock, repairs, and reports shaped by how retailers actually work.",
    Icon: IconStore,
  },
];

function IconCloud(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}
function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconDatabase(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4-8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}
function IconStore(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

export function WhyChoose() {
  return (
    <section id="why" className="border-b border-white/5 bg-black py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionTitle subtitle="One product — clarity for owners, speed for staff.">
          Why choose TechonERP?
        </SectionTitle>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {pillars.map(({ title, desc, Icon }) => (
            <div key={title} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-800/40 text-brand-200 shadow-glass backdrop-blur-sm">
                <Icon className="h-7 w-7" aria-hidden />
              </div>
              <h3 className="mt-5 font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
