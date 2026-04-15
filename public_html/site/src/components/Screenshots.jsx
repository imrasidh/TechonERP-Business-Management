import { SectionTitle } from "./SectionTitle";

const shots = [
  { label: "Dashboard", src: "https://placehold.co/800x500/0a3622/8fccb0/png?text=Dashboard&font=raleway" },
  { label: "Sales & POS", src: "https://placehold.co/800x500/0a3622/8fccb0/png?text=Sales+%26+POS&font=raleway" },
  { label: "Inventory", src: "https://placehold.co/800x500/0a3622/8fccb0/png?text=Inventory&font=raleway" },
  { label: "Reports", src: "https://placehold.co/800x500/0a3622/8fccb0/png?text=Reports&font=raleway" },
];

export function Screenshots() {
  return (
    <section id="screenshots" className="border-b border-white/5 bg-brand-950/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionTitle subtitle="Replace placeholders with real captures from your build.">
          Screenshots
        </SectionTitle>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {shots.map((s) => (
            <figure
              key={s.label}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-glass backdrop-blur-sm transition duration-200 hover:border-brand-500/20"
            >
              <img
                src={s.src}
                alt={`${s.label} screen preview`}
                width={800}
                height={500}
                className="h-auto w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <figcaption className="border-t border-white/10 bg-black/40 px-4 py-3 text-sm font-medium text-slate-200">
                {s.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
