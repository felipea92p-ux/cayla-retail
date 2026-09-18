import type { LucideIcon } from "lucide-react";

/* ====================================================================
   ResumenSede · tres cifras chicas de la sede, con nombre y contenedor
   (2026-09-18, Cambios y Devoluciones)

   Antes eran tres cifras sueltas a la derecha del título, alineadas a la
   izquierda de su etiqueta y sin decir de qué eran: parecían flotar. Ahora
   cada cifra va CENTRADA sobre su etiqueta, con un ícono que la ubica, y
   las tres viven en un mismo recuadro con el nombre de la sede arriba: se
   entiende que son de ESTA sede sin tener que adivinarlo.

   Es de servidor a propósito (sin estado): los íconos son SVG y las cifras
   ya llegan calculadas desde la página.
   ==================================================================== */

export type CifraResumen = { valor: string; etiqueta: string; icono: LucideIcon };

export function ResumenSede({ sede, cifras }: { sede: string; cifras: readonly CifraResumen[] }) {
  return (
    <section aria-label={`Resumen de ${sede}`} className="w-full rounded-xl bg-papel ring-1 ring-tinta/[0.07] sm:w-auto">
      <p className="border-b border-tinta/[0.07] px-4 py-1.5 text-center text-xs font-medium text-tinta/70">Resumen de {sede}</p>
      <ul className="grid grid-cols-3 divide-x divide-tinta/[0.07]">
        {cifras.map(({ valor, etiqueta, icono: Icono }) => (
          <li key={etiqueta} className="flex flex-col items-center gap-0.5 px-2 py-3 text-center sm:px-6">
            <Icono className="h-4 w-4 text-tinta/50" aria-hidden />
            <span className="text-lg font-semibold tabular-nums leading-tight text-tinta sm:text-xl">{valor}</span>
            <span className="text-xs text-tinta/70">{etiqueta}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
