import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { CifraAnimada } from "@/components/ui/CifraAnimada";

/* ====================================================================
   ResumenSede · las tres cifras de la sede (Atelier, 2026-09-19)

   Cada cifra va CENTRADA sobre su etiqueta, con el ícono que la ubica, y
   las tres viven en un mismo recuadro de papel: se leen juntas, no como
   tres datos sueltos. La sede a la que pertenecen la dice el encabezado
   (`EncabezadoPagina`), así que aquí solo entra en el `aria-label`.

   Movimiento: el recuadro sube, las cifras suben hasta su valor
   (`CifraAnimada`) y las divisiones son un hilo que se desvanece en las
   puntas. Es de servidor a propósito: el ícono es un componente y no puede
   cruzar a un componente de cliente; solo el número lo es.
   ==================================================================== */

export type CifraResumen = {
  valor: number;
  formato?: "entero" | "soles";
  etiqueta: string;
  icono: LucideIcon;
  /** La cifra se puede tocar y lleva ahí (Devoluciones: «Por aprobar» → `#por-aprobar`). */
  href?: string;
  /** Pide atención (ámbar): hay algo esperando a alguien. Nunca rojo — el rojo es de lo urgente. */
  alerta?: boolean;
};

export function ResumenSede({ sede, cifras }: { sede: string; cifras: readonly CifraResumen[] }) {
  return (
    <section
      aria-label={`Resumen de ${sede}`}
      className="anim-sube w-full rounded-[20px] bg-papel/70 shadow-[0_22px_44px_-30px_rgba(80,50,20,0.5)] ring-1 ring-tinta/[0.07] backdrop-blur-sm sm:w-auto"
      style={{ "--i": 1 } as CSSProperties}
    >
      <ul className="flex">
        {cifras.map(({ valor, formato, etiqueta, icono: Icono, href, alerta }) => {
          const contenido = (
            <>
              {/* Con cuatro cifras, en el celular el número baja un punto y no se parte ("S/" arriba, el monto abajo). */}
              <span
                className={`font-display lining-nums whitespace-nowrap leading-none tabular-nums sm:text-[42px] ${cifras.length > 3 ? "text-[17px]" : "text-xl"} ${alerta ? "text-ambar-profundo" : "text-tinta"}`}
              >
                <CifraAnimada valor={valor} formato={formato} />
              </span>
              <span className={`mt-2 flex items-center gap-1.5 text-[11px] leading-tight sm:text-xs ${alerta ? "font-semibold text-ambar-profundo" : "text-tinta/70"}`}>
                <Icono className={`hidden h-3.5 w-3.5 shrink-0 sm:block ${alerta ? "" : "text-taupe"}`} aria-hidden />
                {etiqueta}
              </span>
            </>
          );
          return (
            <li
              key={etiqueta}
              className={`relative flex min-w-0 flex-1 before:absolute before:inset-y-5 before:left-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-tinta/20 before:to-transparent first:before:hidden sm:flex-none ${cifras.length > 3 ? "sm:min-w-[7.5rem]" : "sm:min-w-[9.5rem]"}`}
            >
              {href ? (
                <a
                  href={href}
                  className="m-1 flex flex-1 flex-col items-center rounded-2xl px-1 py-3 text-center transition-colors duration-200 hover:bg-hueso/70 focus-visible:bg-hueso/70 sm:px-4"
                >
                  {contenido}
                </a>
              ) : (
                <span className={`flex flex-1 flex-col items-center px-2 py-4 text-center ${cifras.length > 3 ? "sm:px-4" : "sm:px-7"}`}>{contenido}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
