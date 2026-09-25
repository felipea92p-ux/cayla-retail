"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { MetodoPago } from "@cayla-retail/shared";
import { soles } from "@/lib/compras-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { agruparEnSemanas, pulsoDeVentas } from "@/lib/ventas-historial-reglas";
import type { TotalesHistorial } from "@/lib/ventas-historial";

// El pulso del período (Ventas ▸ Historial, ADR-0147), en la columna lateral: lo importante son las ventas y esto las
// acompaña, no las tapa. Cada día es un HILO vertical —la urdimbre del textil— y una curva de tendencia lo cruza —la
// trama—; el mejor día lleva un nudo (el mismo de la línea de tiempo) y una línea punteada marca el promedio. Al pasar
// el mouse por el dibujo, el día se enciende y su cifra aparece arriba. Debajo, los datos del período y cómo se pagó.
//
// Todo es del RANGO completo, no de la página, y sale de la misma consulta que las cifras del encabezado. Una venta
// anulada no cuenta. Con más de 120 días los hilos son semanas (cientos de hilos no se leen). Pasado el tope de 1000
// ventas el dibujo sería de los días más recientes nada más: no se hace, y se dice.
//
// Movimiento: los hilos crecen desde el suelo en cascada y la tendencia se traza una vez (`anim-crece-y`, `anim-trazo`,
// que exige `pathLength={1}`); la barra de pagos crece desde la izquierda. Nada en bucle; todo se apaga con
// `prefers-reduced-motion`.

const ANCHO = 300;
const ALTO = 116;
const MARGEN = { x: 6, arriba: 12, abajo: 14 };
const MAX_HILOS = 120;

const partes = (fecha: string) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d);
};
const conSemana = (fecha: string) => partes(fecha).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
const sinSemana = (fecha: string) => partes(fecha).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(/\./g, "");

const colorMetodo = (metodo: string) => `var(--color-metodo-${metodo})`;
const nombreMetodo = (metodo: string) => NOMBRE_METODO[metodo as MetodoPago] ?? metodo;

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: string }) {
  return (
    <div>
      <dt className="text-xs text-tinta/60">{etiqueta}</dt>
      <dd className="font-display text-xl tabular-nums text-tinta">
        {valor}
        {nota && <span className="ml-1.5 font-sans text-xs text-tinta/50">{nota}</span>}
      </dd>
    </div>
  );
}

export function HistorialVentasPulso({ totales, periodo }: { totales: TotalesHistorial; periodo: string }) {
  const { resumen, parcial, porDia, porMetodo } = totales;
  const [activo, setActivo] = useState<number | null>(null);

  const porSemana = porDia.length > MAX_HILOS;
  const dias = porSemana ? agruparEnSemanas(porDia) : porDia;
  const pulso = pulsoDeVentas(dias, { ancho: ANCHO, alto: ALTO, margen: MARGEN });
  const hayDibujo = !parcial && pulso.pico !== null && dias.length > 1;
  const cobrado = porMetodo.reduce((s, m) => s + m.monto, 0);

  // Lo que dice la lectura de arriba: el día bajo el puntero o, sin puntero, el mejor.
  const enfocado = hayDibujo ? dias[activo ?? pulso.pico!.indice] : null;
  const nombreDia = (fecha: string) => (porSemana ? `Semana del ${sinSemana(fecha)}` : conSemana(fecha));

  function alMover(e: PointerEvent<SVGSVGElement>) {
    const caja = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.floor((x - MARGEN.x) / ((ANCHO - 2 * MARGEN.x) / dias.length));
    setActivo(Math.min(dias.length - 1, Math.max(0, i)));
  }

  return (
    <section aria-label="Ventas por día" className="anim-sube rounded-[20px] bg-papel p-5 ring-1 ring-tinta/[0.07]" style={{ "--i": 3 } as CSSProperties}>
      <h2 className="text-sm font-bold text-tinta">{porSemana ? "Ventas por semana" : "Ventas por día"}</h2>
      <p className="mt-0.5 text-xs text-tinta/60">{periodo}</p>

      {parcial ? (
        <p className="mt-4 rounded-xl border border-dashed border-tinta/15 px-3 py-5 text-center text-xs leading-relaxed text-tinta/65">
          Hay 1,000 ventas o más en este rango: acótalo (una tienda, menos días) para ver el pulso y los totales.
        </p>
      ) : hayDibujo && enfocado ? (
        <>
          <p className="mt-4 min-h-[3.25rem] text-xs text-tinta/60" aria-hidden>
            {activo === null ? "Mejor día · " : ""}
            {nombreDia(enfocado.fecha)}
            <span className="font-display block text-[26px] leading-tight tabular-nums text-tinta">
              {soles(enfocado.total)}
              <span className="ml-2 font-sans text-xs text-tinta/55">{enfocado.ventas === 1 ? "1 venta" : `${enfocado.ventas} ventas`}</span>
            </span>
          </p>

          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            role="img"
            aria-label={`Ventas ${porSemana ? "por semana" : "por día"}, ${periodo}. Mejor ${porSemana ? "semana" : "día"}: ${nombreDia(dias[pulso.pico!.indice].fecha)}, ${soles(dias[pulso.pico!.indice].total)}.`}
            className="block h-auto w-full touch-pan-y overflow-visible"
            onPointerMove={alMover}
            onPointerLeave={() => setActivo(null)}
          >
            <line x1={MARGEN.x} x2={ANCHO - MARGEN.x} y1={pulso.base} y2={pulso.base} strokeWidth={1} className="stroke-tinta/20" />
            {pulso.promedioY !== null && (
              <line x1={MARGEN.x} x2={ANCHO - MARGEN.x} y1={pulso.promedioY} y2={pulso.promedioY} strokeWidth={1} strokeDasharray="3 4" strokeLinecap="round" className="stroke-tinta/30" />
            )}
            {pulso.barras.map((b, i) =>
              b.alto > 0 ? (
                <rect
                  key={i}
                  x={b.x - pulso.anchoBarra / 2}
                  y={b.y}
                  width={pulso.anchoBarra}
                  height={b.alto}
                  rx={pulso.anchoBarra / 2}
                  className={`anim-crece-y transition-colors duration-150 ${i === pulso.pico?.indice || i === activo ? "fill-taupe" : "fill-taupe/50"}`}
                  // Los hilos nacen del suelo, no del borde del dibujo (el origen por defecto de `anim-crece-y` es «bottom»).
                  style={{ "--i": Math.min(i, 24), transformOrigin: `0 ${pulso.base}px` } as CSSProperties}
                />
              ) : (
                <circle key={i} cx={b.x} cy={pulso.base} r={Math.max(0.9, pulso.anchoBarra / 2.4)} className={i === activo ? "fill-taupe" : "fill-tinta/20"} />
              )
            )}
            <path d={pulso.hilo} fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-trazo stroke-taupe-profundo" />
            {pulso.pico && (
              <g className="anim-entra" style={{ "--i": 14 } as CSSProperties}>
                <circle cx={pulso.pico.x} cy={pulso.pico.y} r={4.4} strokeWidth={1.4} className="fill-crema stroke-taupe" />
                <circle cx={pulso.pico.x} cy={pulso.pico.y} r={1.7} className="fill-taupe" />
              </g>
            )}
            {activo !== null && <circle cx={pulso.barras[activo].x} cy={pulso.base + 7} r={1.9} className="fill-taupe" />}
            {/* La zona sensible: transparente y por encima de todo, para que el puntero se lea en cualquier parte del dibujo. */}
            <rect x={0} y={0} width={ANCHO} height={ALTO} fill="transparent" />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-tinta/50">
            <span>{sinSemana(dias[0].fecha)}</span>
            <span>{sinSemana(dias[dias.length - 1].fecha)}</span>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-tinta/15 px-3 py-5 text-center text-xs leading-relaxed text-tinta/65">
          {resumen.ventas === 0 ? "Sin ventas en este período." : "Solo hubo un día de ventas: todavía no hay dibujo."}
        </p>
      )}

      {!parcial && resumen.ventas > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-dashed border-tinta/10 pt-4">
          <Dato etiqueta="Ticket promedio" valor={soles(resumen.ticket)} />
          <Dato etiqueta={porSemana ? "Por semana" : "Por día"} valor={soles(resumen.total / Math.max(1, dias.length))} />
          <Dato etiqueta="Prendas" valor={resumen.unidades.toLocaleString("es-PE")} />
          <Dato etiqueta="Anuladas" valor={String(resumen.anuladas)} nota={resumen.anuladas > 0 ? "no suman" : undefined} />
        </dl>
      )}

      {!parcial && porMetodo.length > 0 && (
        <div className="mt-5 border-t border-dashed border-tinta/10 pt-4">
          <p className="text-xs font-semibold text-tinta">Cómo se pagó</p>
          <div
            role="img"
            aria-label={`Cómo se pagó: ${porMetodo.map((m) => `${nombreMetodo(m.metodo)} ${Math.round((m.monto / cobrado) * 100)} %`).join(", ")}`}
            className="anim-crece-x mt-2.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-sand"
            style={{ "--i": 8 } as CSSProperties}
          >
            {porMetodo.map((m) => (
              <span key={m.metodo} style={{ flex: `${m.monto} 1 0%`, backgroundColor: colorMetodo(m.metodo) }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {porMetodo.map((m) => (
              <li key={m.metodo} className="flex items-center gap-2 text-tinta/70">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorMetodo(m.metodo) }} />
                <span className="flex-1 truncate">{nombreMetodo(m.metodo)}</span>
                <span className="tabular-nums text-tinta/50">{Math.round((m.monto / cobrado) * 100)} %</span>
                <span className="w-[5.25rem] text-right tabular-nums text-tinta">{soles(m.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
