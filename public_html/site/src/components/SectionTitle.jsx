/**
 * Centered section title with subtle fade lines (premium dark UI)
 */
export function SectionTitle({ children, subtitle, className = "" }) {
  return (
    <div className={`text-center ${className}`}>
      <div className="flex items-center justify-center gap-3 sm:gap-6">
        <div
          className="h-px max-w-[100px] flex-1 bg-gradient-to-r from-transparent to-white/25 sm:max-w-[160px]"
          aria-hidden
        />
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{children}</h2>
        <div
          className="h-px max-w-[100px] flex-1 bg-gradient-to-l from-transparent to-white/25 sm:max-w-[160px]"
          aria-hidden
        />
      </div>
      {subtitle ? (
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}
