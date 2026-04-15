import { SectionTitle } from "./SectionTitle";

const steps = [
  {
    n: "1",
    title: "Install",
    body: "Download the Windows installer and complete setup in minutes on your machine.",
  },
  {
    n: "2",
    title: "Setup",
    body: "Enter shop details, tax, currency, and preferences — guided and straightforward.",
  },
  {
    n: "3",
    title: "Start using",
    body: "Invoice, stock, repairs, and accounts from day one — with room to grow.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-b border-white/5 bg-black py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionTitle subtitle="Three simple steps to go live.">How it works</SectionTitle>

        <div className="mt-16 grid gap-6 md:grid-cols-3 md:gap-8">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-6 shadow-glass backdrop-blur-sm transition duration-200 hover:border-brand-500/20"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700/50 text-sm font-semibold text-brand-100 ring-1 ring-brand-500/30">
                {s.n}
              </div>
              <h3 className="mt-5 font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
