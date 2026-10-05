import Link from "next/link";
import type { CifraResumen } from "@/components/ui/ResumenSede";
import { formatoSoles } from "@/lib/resumen-formato";

/* ====================================================================
   CifrasEnLinea · las cifras de la sede como una línea, solo en el celular (rediseño de Existencias, 2026-10-04)

   El recuadro de tres cifras grandes (`ResumenSede`) ocupa ~90 px y en el celular empuja las prendas fuera de la primera pantalla.
   Aquí las MISMAS cifras (la misma lista que arma la página, con sus notas y enlaces) van seguidas en una línea que se parte sola
   si no cabe: «26 colgadas · 43 guardadas · 6 en camino» (la etiqueta corta, `corta`; sin ella, la larga en minúscula). La primera sigue siendo la
   cifra grande (las colgadas: lo que cobra la caja, decisión de Felipe del 2026-10-04); las demás van en letra de texto.

   No decide nada: si la lista cambia (una nota nueva como «de 600 · por cuadrar»), esta línea la muestra sin tocarse. Una cifra que
   todavía no existe (`valor: null`) dice «—», nunca 0. Desde `sm` no se dibuja (CSS): ahí manda `ResumenSede`.
   ==================================================================== */

function formatoCifra(c: CifraResumen) {
  if (c.valor === null) return "—";
  return c.formato === "soles" ? formatoSoles(c.valor) : c.valor.toLocaleString("es-PE");
}

export function CifrasEnLinea({ sede, cifras }: { sede: string; cifras: readonly CifraResumen[] }) {
  if (cifras.length === 0) return null;
  return (
    <ul aria-label={`Resumen de ${sede}`} className="anim-sube flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] leading-snug text-tinta/70 sm:hidden">
      {cifras.map((c, i) => {
        const contenido = (
          <>
            <b className={`font-display lining-nums tabular-nums text-tinta ${i === 0 ? "text-[22px]" : "text-[16px]"} ${c.alerta ? "text-ambar-profundo" : ""}`}>{formatoCifra(c)}</b>
            {c.unidad && c.valor !== null && <small className="text-[0.7em]">{c.unidad}</small>}{" "}
            <span className={c.alerta ? "font-semibold text-ambar-profundo" : undefined}>{c.corta ?? c.etiqueta.charAt(0).toLowerCase() + c.etiqueta.slice(1)}</span>
            {c.nota && c.valor !== null && <span className="text-taupe"> · {c.nota}</span>}
          </>
        );
        return (
          <li key={c.etiqueta} className="flex items-baseline gap-x-2">
            {i > 0 && <span aria-hidden className="text-taupe">·</span>}
            {c.href ? (
              <Link href={c.href} className="underline decoration-tinta/25 underline-offset-[3px]">
                {contenido}
              </Link>
            ) : (
              <span>{contenido}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
