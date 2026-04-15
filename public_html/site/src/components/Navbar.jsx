import { useEffect, useState } from "react";
import { site } from "../config/site";

const link =
  "text-sm font-medium text-slate-300 transition-colors duration-200 hover:text-white";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const demoHref = site.whatsappPrefill(
    "Hi, I'd like to request a demo of TechonERP."
  );

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-[background-color,backdrop-filter] duration-200 ${
        scrolled
          ? "border-white/10 bg-brand-950/90 shadow-lg shadow-black/20 backdrop-blur-md"
          : "border-transparent bg-brand-950/40 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
        <a href="#top" className="text-lg font-semibold tracking-tight text-white">
          {site.name}
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          <a href="#why" className={link}>
            Why us
          </a>
          <a href="#features" className={link}>
            Features
          </a>
          <a href="#screenshots" className={link}>
            Screenshots
          </a>
          <a href="#contact" className={link}>
            Contact
          </a>
        </nav>

        <div className="hidden md:block">
          <a
            href={demoHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition duration-200 hover:bg-brand-500 hover:brightness-110"
          >
            Get Demo
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-200 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-brand-950/98 px-4 py-4 backdrop-blur-md md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {[
              ["Why us", "#why"],
              ["Features", "#features"],
              ["Screenshots", "#screenshots"],
              ["Contact", "#contact"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                {label}
              </a>
            ))}
            <a
              href={demoHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-center rounded-lg bg-brand-600 py-3 text-center text-base font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Get Demo
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
