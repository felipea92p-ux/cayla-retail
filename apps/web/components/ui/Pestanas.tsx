"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { IndicadorDeslizante } from "@/components/ui/IndicadorDeslizante";

/* ====================================================================
   Pestanas · la ÚNICA pestaña de vista del ERP (ADR-0358, «Pestañas y segmentos»; Felipe la eligió mirando el 2026-10-07)

   Qué es: lo que se toca para ir a OTRA parte de la misma pantalla —otras columnas, otras acciones— (Movimientos /
   Pérdidas, Compras / Por aprobar / Resueltas, Desempeño / Comparar períodos, las vistas de Comprobantes y de Finanzas). Si
   lo que se toca solo deja menos filas de la misma lista, NO es esto: es la píldora de filtro (`pildora-cayla`); si muestra
   lo mismo de otra forma u orden, es el segmento de modo (`SegmentoEnlaces`, `SegmentoDeslizante forma="modo"`).

   Cómo se ve: el vidrio de Comprobantes (ADR-0124) con la píldora oscura que se desliza bajo la elegida (`IndicadorDeslizante`
   «pildora-tinta», 450 ms, ADR-0136), y la palabra en MAYÚSCULAS (versalitas de 12 px). El conteo va en su píldora chica; el
   que pide algo, en ámbar y con su texto para lector; el que avisa un rechazo, en rojo (`tono`). Foco hacia adentro. CSS:
   app/estilos/pestanas-y-segmentos.css. No hay pestaña «deshabilitada»: si la cuenta no ve esa vista, la pestaña no está.

   Reemplaza: el subrayado en tinta del 2026-10-06 (que no le gustó a Felipe al verlo aplicado), la pestaña de Finanzas
   (`PestanasFin`), `FacturacionPestanas` y las pestañas de la billetera de Traslados.

   Dos maneras de cambiar, una semántica cada una (patrones APG):
   · con `href` en cada pestaña, la vista vive en la URL: enlaces dentro de un `<nav>` con `aria-current="page"`;
   · con `onCambio`, la vista es estado de la pantalla: `tablist` con `aria-selected`, solo la elegida en el orden del Tab y
     las flechas ← → (Inicio / Fin) pasan de una a otra.
   Si la fila no cabe (celular), al abrir y al cambiar se centra la elegida.
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
  /** El tono del conteo: sin él, si hay `pide`, va en ámbar (pide algo); «rojo» avisa un problema («SUNAT rechazó»); «neutro»
   *  solo informa y usa `pide` como su texto para lector («vigentes»). */
  tono?: "rojo" | "neutro";
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
  const filaNav = useRef<HTMLElement>(null);
  const porEstado = !!onCambio;

  // En el celular la fila no cabe y se desliza: al abrir y al cambiar de vista se centra la elegida, si no la píldora queda
  // fuera de la pantalla y no se ve dónde estás (lo que ya hacía Comprobantes, ADR-0124).
  useLayoutEffect(() => {
    const el = porEstado ? fila.current : filaNav.current;
    const elegida = el?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    if (!el || !elegida || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = elegida.offsetLeft - (el.clientWidth - elegida.offsetWidth) / 2;
  }, [activa, porEstado]);

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
        <span className="pestana-cayla__cuenta" data-pide={p.pide && !p.tono ? "" : undefined} data-tono={p.tono} title={p.pide ? `${p.conteo} ${p.pide}` : undefined}>
          {typeof p.conteo === "number" ? p.conteo.toLocaleString("es-PE") : p.conteo}
          {p.pide && <span className="sr-only"> {p.pide}</span>}
        </span>
      )}
    </>
  );

  if (porEstado) {
    return (
      <div ref={fila} role="tablist" aria-label={etiquetaAccesible} className={`vidrio-cayla pestanas-cayla ${className}`} style={style}>
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
        <IndicadorDeslizante activa={activa} id={idIndicador} variante="pildora-tinta" selector='[aria-selected="true"]' />
      </div>
    );
  }

  return (
    <nav ref={filaNav} aria-label={etiquetaAccesible} className={`vidrio-cayla pestanas-cayla ${className}`} style={style}>
      {items.map((p) => (
        <Link key={p.clave} href={p.href ?? "#"} aria-current={p.clave === activa ? "page" : undefined} title={p.ayuda} className="pestana-cayla">
          {contenido(p)}
        </Link>
      ))}
      <IndicadorDeslizante activa={activa} id={idIndicador} variante="pildora-tinta" />
    </nav>
  );
}
