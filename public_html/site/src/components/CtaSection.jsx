import { site } from "../config/site";

export function CtaSection() {
  const waHref = site.whatsappPrefill("Hi, I'm interested in TechonERP.");
  const demoHref = site.whatsappPrefill("Hi, I'd like to request a demo of TechonERP.");

  return (
    <section className="border-b border-white/5 bg-page-dark py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-brand-500/20 bg-brand-900/30 px-6 py-12 text-center shadow-glow backdrop-blur-md sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(61,143,108,0.2),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to simplify your business?
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Talk to us on WhatsApp or request a guided demo.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-[#25D366] px-6 text-sm font-semibold text-white shadow-[0_0_24px_rgba(37,211,102,0.35)] transition duration-200 hover:brightness-110"
              >
                WhatsApp Now
              </a>
              <a
                href={demoHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white transition duration-200 hover:border-brand-400/30 hover:bg-white/10"
              >
                Request Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
