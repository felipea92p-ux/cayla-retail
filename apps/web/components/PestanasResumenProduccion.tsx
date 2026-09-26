import Link from "next/link";

// «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller, una al lado de la otra (ADR-0133, F6 y F7). Eficiencia NO es una fila del lateral: el menú de Producción
// está en su tope de hijas (ver «DEUDA» en `lib/menu.test.ts`), así que se llega desde el Resumen. Componente de servidor: son dos enlaces.

const PESTANAS = [
  { href: "/produccion", etiqueta: "Hoy", ayuda: "Qué necesita mi decisión" },
  { href: "/produccion/eficiencia", etiqueta: "Eficiencia", ayuda: "Cuánto cuesta cada prenda" },
] as const;

export function PestanasResumenProduccion({ activa }: { activa: "hoy" | "eficiencia" }) {
  return (
    <nav aria-label="Miradas del Taller" className="inline-flex rounded-full border border-tinta/15 p-0.5">
      {PESTANAS.map((p) => {
        const esActiva = (p.href === "/produccion") === (activa === "hoy");
        return (
          <Link
            key={p.href}
            href={p.href}
            title={p.ayuda}
            aria-current={esActiva ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-[13px] outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 ${
              esActiva ? "bg-tinta text-crema" : "text-tinta/75 hover:text-rojo"
            }`}
          >
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
