import type { LucideIcon } from "lucide-react";
import { CifraAnimada } from "@/components/ui/CifraAnimada";

/* ====================================================================
   ResumenSede · tres cifras chicas de la sede, con nombre y contenedor
   (2026-09-18, Cambios y Devoluciones)

   Antes eran tres cifras sueltas a la derecha del título, alineadas a la
   izquierda de su etiqueta y sin decir de qué eran: parecían flotar. Ahora
   cada cifra va CENTRADA sobre su etiqueta y las tres viven en un mismo
   recuadro con el nombre de la sede arriba: se entiende que son de ESTA
   sede sin tener que adivinarlo (el nombre va centrado arriba del recuadro).

   Color: el `sand` del sistema (el de "recuadros neutrales"), un punto más
   hondo que el crema del fondo, para que no se lea como una tarjeta blanca
   más. Movimiento: entra el recuadro, entran las cifras una tras otra y los
   números suben hasta su valor (`CifraAnimada`).

   Es de servidor a propósito: el ícono es un componente y no puede cruzar a
   un componente de cliente; solo el número lo es.
   ==================================================================== */

export type CifraResumen = { valor: number; formato?: "entero" | "soles"; etiqueta: string; icono: LucideIcon };

export function ResumenSede({ sede, cifras }: { sede: string; cifras: readonly CifraResumen[] }) {
  return (
    <section aria-label={`Resumen de ${sede}`} className="anim-entrada w-full sm:w-auto">
      {/* El nombre de la sede va centrado ARRIBA del recuadro, no encima de su borde: el
          rótulo montado sobre la línea se leía como un corte en el recuadro. */}
      <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-tinta/70">Resumen de {sede}</p>
      <ul className="grid grid-cols-3 divide-x divide-tinta/[0.08] rounded-xl bg-sand/45 ring-1 ring-tinta/[0.08]">
        {cifras.map(({ valor, formato, etiqueta, icono: Icono }, i) => (
          <li key={etiqueta} className="anim-asentar flex flex-col items-center px-2 py-2.5 text-center sm:px-6" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums leading-tight text-tinta sm:text-[22px]">
              <CifraAnimada valor={valor} formato={formato} />
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-tinta/70">
              <Icono className="hidden h-3.5 w-3.5 shrink-0 text-tinta/50 sm:block" aria-hidden />
              {etiqueta}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
