import { site } from "../config/site";

const dashboardPlaceholder =
  "https://placehold.co/960x600/0a3622/8fccb0/png?text=TechonERP+Dashboard&font=raleway";

const chips = [
  { label: "New Invoice", position: "left-[2%] top-[8%] sm:left-0 sm:top-[12%]" },
  { label: "Stock Alert", position: "right-[0%] top-[18%] sm:right-[-4%] sm:top-[20%]" },
  { label: "Repair Orders", position: "left-[0%] bottom-[22%] sm:bottom-[18%] sm:left-[-2%]" },
  { label: "Today's sales", position: "right-[4%] bottom-[10%] sm:right-0 sm:bottom-[12%]" },
];

export function Hero() {
  const demoHref = site.whatsappPrefill(
    "Hi, I'd like to request a demo of TechonERP."
  );

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-white/5 bg-page-dark bg-hero-mesh"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_75%_45%,rgba(61,143,108,0.22),transparent)]" />
      <div className="pointer-events-none absolute right-0 top-1/2 h-[min(90vw,520px)] w-[min(90vw,520px)] -translate-y-1/2 translate-x-1/4 rounded-full bg-brand-700/20 blur-[100px]" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <p className="text-sm font-medium text-brand-300">Windows · Offline-first · Built for shops</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
            Run Your Entire Business in One Simple System
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            Sales, Inventory, Accounting, Repairs, and Reports — all in one powerful ERP built for real
            businesses.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={demoHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white shadow-glow transition duration-200 hover:bg-brand-500 hover:brightness-110"
            >
              Get Demo
            </a>
            <a
              href={site.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-sm transition duration-200 hover:border-brand-400/40 hover:bg-white/10"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
              </svg>
              WhatsApp Us
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none lg:justify-self-end">
          {chips.map((c) => (
            <div
              key={c.label}
              className={`pointer-events-none absolute z-10 hidden rounded-full border border-white/10 bg-brand-900/60 px-3 py-1.5 text-xs font-medium text-brand-100 shadow-glass backdrop-blur-md sm:block ${c.position}`}
            >
              {c.label}
            </div>
          ))}
          <div className="pointer-events-none absolute -inset-4 rounded-2xl bg-brand-600/25 blur-3xl sm:-inset-8" />
          <div className="relative rounded-2xl border border-white/10 bg-black/30 p-2 shadow-glow-lg backdrop-blur-sm">
            <div className="overflow-hidden rounded-xl border border-white/5 bg-brand-950/80">
              <img
                src={dashboardPlaceholder}
                alt="TechonERP dashboard preview"
                width={960}
                height={600}
                className="h-auto w-full object-cover opacity-95"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-slate-500 lg:text-right">
            Preview — replace with your product screenshot in <code className="text-slate-400">public/</code>
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:hidden">
            {chips.map((c) => (
              <span
                key={c.label}
                className="rounded-full border border-white/10 bg-brand-900/50 px-3 py-1 text-xs font-medium text-brand-100 backdrop-blur"
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
