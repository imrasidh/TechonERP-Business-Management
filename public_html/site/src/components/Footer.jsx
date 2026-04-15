import { site } from "../config/site";

export function Footer() {
  return (
    <footer id="contact" className="border-t border-white/10 bg-black text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-white">{site.name}</p>
            <p className="mt-1 text-sm text-slate-500">{site.tagline}</p>
          </div>
          <div className="space-y-3 text-sm">
            <a
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="block transition hover:text-brand-300"
            >
              www.erp.techon.lk
            </a>
            <a href={site.mailto} className="block transition hover:text-brand-300">
              info@techon.lk
            </a>
            <a href={site.tel1} className="block transition hover:text-brand-300">
              {site.phoneDisplay1}
            </a>
            <a href={site.tel2} className="block transition hover:text-brand-300">
              {site.phoneDisplay2}
            </a>
          </div>
        </div>
        <div className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-slate-600 sm:text-left">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
