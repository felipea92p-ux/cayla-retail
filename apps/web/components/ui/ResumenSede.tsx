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

   Desde Frescura del piso (ADR-0208 paso 4, 2026-09-28), cuatro cosas opcionales
   que ninguna pantalla anterior usaba (sin ellas se dibuja igual que antes):
   una cifra que todavía no existe (`valor: null` → «—»), una unidad pegada al
   número («%»), una nota corta junto a él («quizá más», el «al menos» de las
   frases C) y una cifra que FILTRA en la misma pantalla (`alTocar` +
   `presionada`, un botón con `aria-pressed`): solo cuando `ResumenSede` se
   dibuja dentro de un componente de cliente, que es quien tiene la función.
   ==================================================================== */

export type CifraResumen = {
  /** Null: todavía no hay con qué calcularla; se dibuja «—». */
  valor: number | null;
  formato?: "entero" | "soles";
  /** Pegada al número, en la misma letra y más chica («%»). */
  unidad?: string;
  /** Al lado del número, en letra de texto y taupe («quizá más»): la cifra puede ser más. */
  nota?: string;
  etiqueta: string;
  icono: LucideIcon;
  /** La cifra se puede tocar y lleva ahí (Devoluciones: «Por aprobar» → `#por-aprobar`). */
  href?: string;
  /** La cifra filtra en la misma pantalla (Frescura: «Por decidir»). Solo desde un componente de cliente. */
  alTocar?: () => void;
  /** Con `alTocar`: el filtro está puesto. */
  presionada?: boolean;
  /** Lo que dice al pasar el mouse: de qué sale la cifra. */
  titulo?: string;
  /** Pide atención (ámbar): hay algo esperando a alguien. Nunca rojo — el rojo es de lo urgente. */
  alerta?: boolean;
};

// Ancho: hasta `lg` el recuadro ocupa la fila y las cifras se reparten el ancho (`flex-1`); desde `lg` cada una pide su
// mínimo. Antes el mínimo corría desde `sm` (640 px) y en una tablet con el menú lateral abierto cuatro cifras pedían
// 480 px donde había ~450: la página se desbordaba en horizontal (visto en Productos y Devoluciones, 2026-09-28).
export function ResumenSede({ sede, cifras }: { sede: string; cifras: readonly CifraResumen[] }) {
  return (
    <section
      aria-label={`Resumen de ${sede}`}
      className="anim-sube w-full rounded-[20px] bg-papel/70 shadow-[0_22px_44px_-30px_rgba(80,50,20,0.5)] ring-1 ring-tinta/[0.07] backdrop-blur-sm lg:w-auto"
      style={{ "--i": 1 } as CSSProperties}
    >
      <ul className="flex">
        {cifras.map(({ valor, formato, unidad, nota, etiqueta, icono: Icono, href, alTocar, presionada, titulo, alerta }) => {
          const contenido = (
            <>
              {/* Con cuatro cifras, en el celular el número baja un punto y no se parte ("S/" arriba, el monto abajo). */}
              <span
                className={`font-display lining-nums whitespace-nowrap leading-none tabular-nums sm:text-[42px] ${cifras.length > 3 ? "text-[17px]" : "text-xl"} ${alerta ? "text-ambar-profundo" : "text-tinta"}`}
              >
                {valor === null ? "—" : <CifraAnimada valor={valor} formato={formato} />}
                {unidad && valor !== null && <small className="ml-px text-[0.55em]">{unidad}</small>}
                {/* La nota sí se parte en dos renglones (el número no): «de 1800 (provisional)» en una cifra de tres a 375 px pedía
                    más ancho que el de su columna y se montaba sobre la de al lado. Una nota que cabe se ve igual que antes. */}
                {nota && valor !== null && (
                  <span className="ml-1 block whitespace-normal font-sans text-[11px] font-medium text-taupe sm:inline sm:text-[13px]">{nota}</span>
                )}
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
              className={`relative flex min-w-0 flex-1 before:absolute before:inset-y-5 before:left-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-tinta/20 before:to-transparent first:before:hidden lg:flex-none ${cifras.length > 3 ? "lg:min-w-[7.5rem]" : "lg:min-w-[9.5rem]"}`}
            >
              {alTocar ? (
                <button
                  type="button"
                  onClick={alTocar}
                  aria-pressed={!!presionada}
                  title={titulo}
                  className="m-1 flex flex-1 flex-col items-center rounded-2xl px-1 py-3 text-center transition-colors duration-200 hover:bg-hueso/70 focus-visible:bg-hueso/70 aria-pressed:bg-hueso/70 sm:px-4"
                >
                  {contenido}
                </button>
              ) : href ? (
                <a
                  href={href}
                  title={titulo}
                  className="m-1 flex flex-1 flex-col items-center rounded-2xl px-1 py-3 text-center transition-colors duration-200 hover:bg-hueso/70 focus-visible:bg-hueso/70 sm:px-4"
                >
                  {contenido}
                </a>
              ) : (
                <span title={titulo} className={`flex flex-1 flex-col items-center px-2 py-4 text-center ${cifras.length > 3 ? "sm:px-4" : "sm:px-7"}`}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
