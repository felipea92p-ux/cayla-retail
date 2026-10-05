"use client";

import type { CSSProperties } from "react";
import { etiquetaDia, type OperacionMovimiento } from "@/lib/movimientos-reglas";
import { TIPOS_VISUALES, tipoDeOperacion } from "@/lib/movimientos-tipos";

// El encabezado de cada día de la lista (rediseño 2026-10-05, ADR-0345): su nombre y, al lado, una franja de color por cada
// operación —de la más vieja a la más nueva—, que muestra de qué estuvo hecho el día antes de leer una fila: ámbar las
// colgadas, verde las ventas, oliva las llegadas… Tocar una franja lleva a su fila (abre el mazo si está dentro de uno) y la
// destella una vez.
//
// SIN cifra («17 operaciones»): la lista carga de a 50 filas y esa cuenta era la de la página, no la del día (en TRU decía «14»
// con unas 90 operaciones; ADR-0234, 2026-10-03). Las franjas son lo que se ve en pantalla, y no prometen más. Para cuánto pasó
// en el día están los botones de la derecha con el período «Hoy».

/** La fila de una operación en la página (`data-op` es el id de su primera fila): la busca, abre su mazo y la destella. */
function irA(id: string) {
  const fila = document.querySelector<HTMLElement>(`[data-op="${CSS.escape(id)}"]`);
  if (!fila) return;
  const mazo = fila.closest<HTMLElement>("[data-mazo]");
  const hayQueAbrir = !!mazo && !mazo.hasAttribute("data-abierto");
  if (hayQueAbrir) mazo.querySelector<HTMLElement>("[data-mazo-tapa]")?.click();
  window.setTimeout(
    () => {
      fila.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      fila.setAttribute("data-flash", "");
      window.setTimeout(() => fila.removeAttribute("data-flash"), 1400);
    },
    hayQueAbrir ? 320 : 0
  );
}

/** «lunes 5 de octubre» de una fecha `aaaa-mm-dd`, con componentes locales (un servidor en UTC no la corre un día). */
function diaLargo(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
}

export function EncabezadoDia({ fecha, hoyLima, operaciones }: { fecha: string; hoyLima: string; operaciones: readonly OperacionMovimiento[] }) {
  const etiqueta = etiquetaDia(fecha, hoyLima);
  const esRelativo = etiqueta === "Hoy" || etiqueta === "Ayer";
  // «Hoy» y «Ayer» no dicen qué día de la semana es: se les suma («lunes 5 de octubre»). Los demás ya lo dicen.
  const largo = esRelativo ? diaLargo(fecha) : null;
  // Las operaciones llegan de la más nueva a la más vieja (como la lista); la franja se lee de izquierda a derecha, con el tiempo.
  const enOrden = [...operaciones].reverse();
  return (
    <header className="mv-dia">
      <h3 className="mv-dia-nombre">
        <b>{etiqueta}</b>
        {largo}
      </h3>
      <div className="mv-codigo" role="group" aria-label={`Las operaciones de ${etiqueta.toLowerCase()}, de la más antigua a la más reciente`}>
        {enOrden.map((op, i) => {
          const tipo = tipoDeOperacion(op.filas);
          const info = TIPOS_VISUALES[tipo];
          return (
            <button
              key={op.clave}
              type="button"
              data-mv-tono={info.tono}
              style={{ "--k": Math.min(i, 24) } as CSSProperties}
              title={`${op.hora} · ${info.nombre}`}
              aria-label={`${op.hora}, ${info.nombre}: ir a esa fila`}
              onClick={() => irA(op.filas[0].id)}
            />
          );
        })}
      </div>
    </header>
  );
}
