import type { CSSProperties } from "react";
import type { MetodoPago } from "@cayla-retail/shared";
import { soles } from "@/lib/compras-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { trazoDeVentas } from "@/lib/ventas-historial-reglas";
import type { TotalesHistorial } from "@/lib/ventas-historial";

// El pulso del período (Ventas ▸ Historial, ADR-0144): lo vendido día por día, dibujado como un HILO —el
// motivo de la casa (Atelier): una línea taupe que se traza al llegar, con un nudo en el mejor día— y, debajo,
// cómo se pagó. Es de servidor y todo SVG y CSS puro, como los gráficos de Caja: sin librería de gráficos.
//
// Todo lo que muestra es del RANGO completo, no de la página, y sale de la misma consulta que las cifras del
// encabezado. Una venta anulada no cuenta. Pasado el tope de 1000 ventas el trazo sería de los días más
// recientes nada más: no se dibuja, y se dice.
//
// Movimiento: entra con el resto de la página (`anim-sube`), el hilo se dibuja una vez (`anim-trazo`, exige
// `pathLength={1}`), el degradado aparece detrás y la barra de pagos crece desde la izquierda. Nada en bucle;
// todo se apaga con `prefers-reduced-motion`.

const ANCHO = 640;
const ALTO = 132;
const MARGEN = { x: 10, arriba: 16, abajo: 12 };

const partes = (fecha: string) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d);
};
const conSemana = (fecha: string) => partes(fecha).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
const sinSemana = (fecha: string) => partes(fecha).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(/\./g, "");

const colorMetodo = (metodo: string) => `var(--color-metodo-${metodo})`;

export function HistorialVentasPulso({ totales, periodo }: { totales: TotalesHistorial; periodo: string }) {
  const { resumen, parcial, porDia, porMetodo } = totales;
  const trazo = trazoDeVentas(porDia, { ancho: ANCHO, alto: ALTO, margen: MARGEN });
  const pico = trazo.pico ? porDia[trazo.pico.indice] : null;
  const base = ALTO - MARGEN.abajo;
  const cobrado = porMetodo.reduce((s, m) => s + m.monto, 0);
  const anuladas = resumen.anuladas > 0 ? ` · ${resumen.anuladas} ${resumen.anuladas === 1 ? "anulada no suma" : "anuladas no suman"}` : "";

  return (
    <section aria-label="Ventas por día" className="anim-sube rounded-[20px] bg-papel p-5 ring-1 ring-tinta/[0.07] sm:p-6" style={{ "--i": 2 } as CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <h2 className="text-sm font-bold text-tinta">Ventas por día</h2>
          <p className="mt-0.5 text-xs text-tinta/60">
            {periodo}
            {parcial ? "" : anuladas}
          </p>
        </div>
        {!parcial && resumen.ventas > 0 && (
          <dl className="flex flex-wrap items-end gap-x-8 gap-y-1 text-right">
            <div>
              <dt className="text-xs text-tinta/60">Ticket promedio</dt>
              <dd className="font-display text-xl tabular-nums text-tinta">{soles(resumen.ticket)}</dd>
            </div>
            {pico && (
              <div>
                <dt className="text-xs text-tinta/60">Mejor día, {conSemana(pico.fecha)}</dt>
                <dd className="font-display text-xl tabular-nums text-tinta">{soles(pico.total)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {parcial ? (
        <p className="mt-5 rounded-xl border border-dashed border-tinta/15 px-4 py-6 text-center text-sm text-tinta/65">
          Hay más de 1,000 ventas en este rango: acótalo (una tienda, menos días) para ver el trazo y los totales.
        </p>
      ) : pico && porDia.length > 1 ? (
        <>
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            role="img"
            aria-label={`Ventas por día, ${periodo}. Mejor día: ${conSemana(pico.fecha)}, ${soles(pico.total)}.`}
            className="mt-4 block h-auto w-full overflow-visible"
          >
            <defs>
              <linearGradient id="hilo-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--color-taupe)", stopOpacity: 0.26 }} />
                <stop offset="1" style={{ stopColor: "var(--color-taupe)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <line x1={MARGEN.x} x2={ANCHO - MARGEN.x} y1={base} y2={base} strokeDasharray="1 6" strokeLinecap="round" className="stroke-tinta/30" strokeWidth={1.5} />
            <path d={trazo.area} fill="url(#hilo-area)" className="anim-entra" style={{ "--i": 6 } as CSSProperties} />
            <path
              d={trazo.linea}
              fill="none"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="anim-trazo stroke-taupe"
            />
            {trazo.pico && (
              <g className="anim-entra" style={{ "--i": 12 } as CSSProperties}>
                <line x1={trazo.pico.x} x2={trazo.pico.x} y1={trazo.pico.y} y2={base} strokeDasharray="2 4" strokeWidth={1} className="stroke-taupe/50" />
                <circle cx={trazo.pico.x} cy={trazo.pico.y} r={6} strokeWidth={1.5} className="fill-crema stroke-taupe" />
                <circle cx={trazo.pico.x} cy={trazo.pico.y} r={2.4} className="fill-taupe" />
              </g>
            )}
            {trazo.ultimo && trazo.pico && trazo.ultimo.x !== trazo.pico.x && (
              <circle cx={trazo.ultimo.x} cy={trazo.ultimo.y} r={3.5} className="anim-entra fill-taupe" style={{ "--i": 14 } as CSSProperties} />
            )}
          </svg>
          <div className="mt-1.5 flex justify-between text-[11px] text-tinta/50">
            <span>{sinSemana(porDia[0].fecha)}</span>
            <span>{sinSemana(porDia[porDia.length - 1].fecha)}</span>
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-tinta/15 px-4 py-6 text-center text-sm text-tinta/65">
          {resumen.ventas === 0 ? "Sin ventas en este período." : "Solo hubo un día de ventas: todavía no hay trazo que dibujar."}
        </p>
      )}

      {!parcial && porMetodo.length > 0 && (
        <div className="mt-5 border-t border-dashed border-tinta/10 pt-4">
          <div
            role="img"
            aria-label={`Cómo se pagó: ${porMetodo.map((m) => `${NOMBRE_METODO[m.metodo as MetodoPago] ?? m.metodo} ${Math.round((m.monto / cobrado) * 100)} %`).join(", ")}`}
            className="anim-crece-x flex h-2 gap-px overflow-hidden rounded-full bg-sand"
            style={{ "--i": 8 } as CSSProperties}
          >
            {porMetodo.map((m) => (
              <span key={m.metodo} style={{ flex: `${m.monto} 1 0%`, backgroundColor: colorMetodo(m.metodo) }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-tinta/70">
            {porMetodo.map((m) => (
              <li key={m.metodo} className="flex items-center gap-1.5" title={soles(m.monto)}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: colorMetodo(m.metodo) }} />
                {NOMBRE_METODO[m.metodo as MetodoPago] ?? m.metodo}
                <span className="tabular-nums text-tinta/50">{Math.round((m.monto / cobrado) * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
