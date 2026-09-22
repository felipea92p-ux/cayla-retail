import type { CSSProperties, ReactNode } from "react";
import type { Lectura, TonoLectura } from "@/lib/resumen-lectura";

// Las cuatro cifras de arriba del Análisis de inventario (rediseño 2026-09-22, guía oficial). Las dos pestañas
// usan la misma tarjeta: etiqueta en versalitas → cifra en la serif → una línea que dice hacia dónde fue → el pie
// con el contexto. En Comparar la cifra es «A → B»: A chica y apagada, B grande, porque B es lo que se analiza
// y A es la referencia (A siempre antes que B, como en toda la pantalla).

export type TonoDelta = "alza" | "baja" | "neutro";

const TONO: Record<TonoDelta, string> = { alza: "text-verde-profundo", baja: "text-ambar-profundo", neutro: "text-taupe" };

/** «↑ 18%» / «↓ 5%» / «sin cambio» / «N/D» y su tono: subir es bueno para ventas, rotación y sell-through. */
export function flechaPct(pct: number | null, sufijo = "%"): { texto: string; tono: TonoDelta } {
  if (pct === null) return { texto: "N/D", tono: "neutro" };
  const n = Math.round(pct);
  if (n === 0) return { texto: "sin cambio", tono: "neutro" };
  return { texto: `${n > 0 ? "↑" : "↓"} ${Math.abs(n)}${sufijo}`, tono: n > 0 ? "alza" : "baja" };
}

export function TarjetaCifraAnalisis({
  i,
  titulo,
  cifra,
  antes,
  delta,
  pie,
  ayuda,
}: {
  /** Orden de entrada escalonada. */
  i: number;
  titulo: string;
  cifra: string;
  /** Solo en Comparar: la cifra de A, que va chica y apagada delante de la de B. */
  antes?: string;
  delta?: { texto: ReactNode; tono: TonoDelta };
  pie?: ReactNode;
  ayuda?: string;
}) {
  return (
    <div className="anim-entra card-cayla flex min-w-0 flex-col gap-0.5 p-4" title={ayuda} style={{ "--i": i } as CSSProperties}>
      <p className="label-cayla text-[11px] leading-4 text-taupe">{titulo}</p>
      {/* La cifra no se parte nunca («S/ 18.4k» en dos líneas se lee como dos cifras); si A → B no cabe junto, B baja. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-display tabular-nums leading-tight">
        {antes !== undefined && (
          <span className="whitespace-nowrap text-[1.05rem] text-taupe">
            <span className="sr-only">Período A: </span>
            {antes}
            <span aria-hidden className="ml-1.5 text-tinta/35">
              →
            </span>
          </span>
        )}
        <span className="whitespace-nowrap text-[1.75rem] text-tinta">
          {antes !== undefined && <span className="sr-only">Período B: </span>}
          {cifra}
        </span>
      </p>
      {delta && <p className={`text-[13px] ${TONO[delta.tono]}`}>{delta.texto}</p>}
      <p className="mt-auto min-h-4 pt-1 text-[11.5px] leading-4 text-taupe">{pie}</p>
    </div>
  );
}

/** La fila de cuatro: dos por fila en tableta, una en el celular. */
export function FilaCifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">{children}</div>;
}

// La dona de ritmo usa los colores de GRÁFICO (`--color-grafico-*`, validados como relleno vecino): el verde y el
// ámbar oficiales son para texto y se confunden como relleno. Siempre van con flecha, etiqueta y número al lado.
export const COLOR_ALZA = "var(--color-grafico-alza)";
export const COLOR_NEUTRO = "var(--color-grafico-neutro)";
export const COLOR_BAJA = "var(--color-grafico-baja)";

/** Lleva la vista a la tabla de abajo (la dona y «Ver ranking» filtran u ordenan la tabla, no otra pantalla). */
export function irALaTabla(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
}

const TONO_LECTURA: Record<TonoLectura, { texto: string; punto: string }> = {
  rojo: { texto: "text-rojo-profundo", punto: "bg-rojo" },
  ambar: { texto: "text-ambar-profundo", punto: "bg-ambar" },
  verde: { texto: "text-verde-profundo", punto: "bg-verde" },
  neutro: { texto: "text-taupe", punto: "bg-taupe/40" },
};

/** La celda «Cambio relevante» / «Lectura del período»: una frase con un punto del color de su tono (el color
 *  nunca va solo: la frase dice lo mismo). El porqué con números va en el `title`. Sin lectura: «—». */
export function LecturaCelda({ lectura }: { lectura: Lectura | null }) {
  if (lectura === null)
    return (
      <span role="cell" className="min-w-0 text-sm text-tinta/35" title="No hay suficiente historial para leer esta variante">
        —
      </span>
    );
  const t = TONO_LECTURA[lectura.tono];
  return (
    <span role="cell" className={`flex min-w-0 items-start gap-2 text-[13px] leading-snug ${t.texto}`} title={lectura.detalle}>
      <span aria-hidden className={`mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full ${t.punto}`} />
      <span className="min-w-0">{lectura.texto}</span>
    </span>
  );
}
