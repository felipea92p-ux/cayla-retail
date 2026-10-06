"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { IndicadorDeslizante } from "@/components/ui/IndicadorDeslizante";

/* ====================================================================
   Pestanas · la ÚNICA pestaña de vista del ERP (ADR-0354, «Pestañas y segmentos», Felipe 2026-10-06)

   Qué es: lo que se toca para ir a OTRA parte de la misma pantalla —otras columnas, otras acciones— (Movimientos /
   Pérdidas, Compras / Por aprobar / Resueltas, Desempeño / Comparar períodos). Si lo que se toca solo deja menos filas
   de la misma lista, NO es esto: es la píldora de filtro (`pildora-cayla`); si muestra lo mismo de otra forma u orden,
   es el segmento de modo (`SegmentoEnlaces`, `SegmentoDeslizante forma="modo"`). Así lo decidió Felipe con /unificar.

   Cómo se ve: la piel de la pestaña de Finanzas (`.fin-pestana`, ADR-0195), la pestaña de vista más usada del censo:
   13,5 px, inactiva en taupe, elegida en tinta y 500, subrayado de 2 px en TINTA (el rojo queda para lo que pide actuar,
   ADR-0169) que viaja de una pestaña a otra (340 ms, `IndicadorDeslizante` «linea-tinta», ADR-0136), 42 px de alto
   (44 con el dedo). El conteo va en una píldora sand; el que pide algo, en ámbar y con su texto para lector. El ancho de la
   letra en 500 está reservado (elegir una no corre a las vecinas) y el foco va hacia adentro. CSS: app/estilos/pestanas-y-segmentos.css.
   No hay pestaña «deshabilitada»: si la cuenta no ve esa vista, la pestaña no está; y una vista en 0 se abre y dice qué falta.

   Reemplaza (2026-10-06): el subrayado ROJO en MAYÚSCULAS de 11 px que dibujaba esta misma pieza desde ADR-0111, la pestaña
   a mano de ResumenCabecera, `TabsSubrayado` (Recibir, ficha del cliente), la pista tinta/5 de Devoluciones, las pastillas de
   PestanasResumenProduccion y las secciones de Atributos.

   Dos maneras de cambiar, una semántica cada una (patrones APG):
   · con `href` en cada pestaña, la vista vive en la URL: enlaces dentro de un `<nav>` con `aria-current="page"` (sirven en
     Server Components, se comparten y «atrás» funciona; Next no remonta la fila al cambiar los `searchParams`, así que el
     subrayado viaja aunque la página se vuelva a pedir);
   · con `onCambio`, la vista es estado de la pantalla: `tablist` con `aria-selected`, solo la elegida en el orden del Tab y
     las flechas ← → (Inicio / Fin) pasan de una a otra.
   ==================================================================== */

export type Pestana = {
  clave: string;
  etiqueta: ReactNode;
  /** Un icono delante de la palabra (16 px, `aria-hidden`): se reconoce antes de leer. Nunca solo el icono. */
  icono?: ReactNode;
  /** Con `href`, la pestaña es un enlace (la vista vive en la URL). Sin él, la fila necesita `onCambio`. */
  href?: string;
  /** Cuántos hay en esa vista. `null`/omitido = no se dibuja; el 0 sí se ve. */
  conteo?: ReactNode;
  /** El conteo pide algo (ámbar) y esto es lo que oye quien usa lector de pantalla tras el número: «esperan revisión». */
  pide?: string;
  /** Una línea de ayuda al pasar el mouse (`title`): «Cuánto cuesta cada prenda». */
  ayuda?: string;
};

export function Pestanas({
  items,
  activa,
  etiquetaAccesible,
  onCambio,
  className = "",
  style,
  idIndicador = "pestanas",
}: {
  items: Pestana[];
  activa: string;
  etiquetaAccesible: string;
  /** La vista es estado (no URL): la fila es un `tablist` y avisa la pestaña tocada. */
  onCambio?: (clave: string) => void;
  className?: string;
  /** Típico: `--i` de la entrada escalonada (`anim-entra`). */
  style?: CSSProperties;
  /** Nombra la memoria del subrayado que viaja (una por fila de pestañas de la pantalla). */
  idIndicador?: string;
}) {
  const fila = useRef<HTMLDivElement>(null);
  const porEstado = !!onCambio;

  // Flechas del tablist (APG, activación automática): mueven el foco y eligen. Se marca la tecla como usada para que un
  // cajón que pasa de registro con flechas no la tome también (ADR-0128).
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const ultimo = items.length - 1;
    const destino = e.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? ultimo : -1;
    if (destino < 0) return;
    e.preventDefault();
    e.stopPropagation();
    onCambio?.(items[destino].clave);
    fila.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[destino]?.focus();
  };

  const contenido = (p: Pestana) => (
    <>
      {p.icono && <span className="pestana-cayla__icono">{p.icono}</span>}
      <span className="pestana-cayla__texto" data-texto={typeof p.etiqueta === "string" ? p.etiqueta : undefined}>
        {p.etiqueta}
      </span>
      {p.conteo != null && (
        <span className="pestana-cayla__cuenta" data-pide={p.pide ? "" : undefined}>
          {typeof p.conteo === "number" ? p.conteo.toLocaleString("es-PE") : p.conteo}
          {p.pide && <span className="sr-only"> {p.pide}</span>}
        </span>
      )}
    </>
  );

  if (porEstado) {
    return (
      <div ref={fila} role="tablist" aria-label={etiquetaAccesible} className={`pestanas-cayla ${className}`} style={style}>
        {items.map((p, i) => {
          const esActiva = p.clave === activa;
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              aria-selected={esActiva}
              tabIndex={esActiva ? 0 : -1}
              onClick={() => onCambio?.(p.clave)}
              onKeyDown={(e) => alTeclear(e, i)}
              title={p.ayuda}
              className="pestana-cayla"
            >
              {contenido(p)}
            </button>
          );
        })}
        <IndicadorDeslizante activa={activa} id={idIndicador} variante="linea-tinta" selector='[aria-selected="true"]' />
      </div>
    );
  }

  return (
    <nav aria-label={etiquetaAccesible} className={`pestanas-cayla ${className}`} style={style}>
      {items.map((p) => (
        <Link key={p.clave} href={p.href ?? "#"} aria-current={p.clave === activa ? "page" : undefined} title={p.ayuda} className="pestana-cayla">
          {contenido(p)}
        </Link>
      ))}
      <IndicadorDeslizante activa={activa} id={idIndicador} variante="linea-tinta" />
    </nav>
  );
}
