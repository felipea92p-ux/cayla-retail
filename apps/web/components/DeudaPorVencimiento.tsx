"use client";

import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { usePorPagar } from "@/components/PorPagarContexto";
import { soles } from "@/lib/compras-reglas";
import type { DeudaPorVencimiento as Tramo, TramoVencimiento } from "@/lib/compras-indicadores";
import { tramoVencimientoDe } from "@/lib/por-pagar-reglas";

// «Deuda por vencimiento» (maqueta 02): cuánto de lo que se debe ya venció, cuánto vence esta semana, este mes y después — la barra
// apilada da la proporción, la leyenda el monto y el %. Las cifras vienen de la base sobre TODA la deuda (`deuda_por_vencimiento()`),
// no de la página de 50 filas que se está mirando.
//
// Spike 2026-09-19 (mismo modelo que ADR-0128): la barra RESPONDE. Apuntar a un tramo enciende en la lista las filas que suman esa cifra
// y un clic deja solo esas filas (con un chip para quitarlo). Antes «Vencida S/ 6,670» no decía cuáles eran. Las barras se llenan una vez
// al llegar y, cuando una cifra cambia (se pagó algo), se reacomodan y las cifras cuentan hasta su valor nuevo.
// La barra es `<BarraApilada>`, la pieza del sistema (ADR-0358, 2026-10-09; las demás barras se migran módulo por módulo), con el
// movimiento que nació aquí. Esta pantalla solo decide qué cuenta cada tramo y qué pasa al apuntarlo o tocarlo.
//
// Los días promedio de pago y el % pagado a tiempo no se inventan: necesitan comprobantes ya pagados por completo. Mientras no los
// haya, el recuadro punteado lo dice.

const ORDEN: TramoVencimiento[] = ["vencida", "0_7", "8_30", "mas_30"];
const TITULO: Record<TramoVencimiento, string> = { vencida: "Vencida", "0_7": "0–7 días", "8_30": "8–30 días", mas_30: "Más de 30" };
// Rojo solo para lo que ya venció (hay que actuar); ámbar lo inminente; el resto, tinta.
const COLOR: Record<TramoVencimiento, string> = { vencida: "bg-rojo", "0_7": "bg-ambar", "8_30": "bg-tinta/50", mas_30: "bg-tinta/20" };

export function DeudaPorVencimiento({ tramos, indice = 0 }: { tramos: Tramo[]; /** Posición en la entrada escalonada de la pantalla. */ indice?: number }) {
  const { apuntar, filtroLocal, alternarFiltro } = usePorPagar();
  const porTramo = new Map(tramos.map((t) => [t.tramo, t]));
  const filas = ORDEN.map((k) => ({ k, monto: porTramo.get(k)?.monto ?? 0 }));
  const total = filas.reduce((a, f) => a + f.monto, 0);
  const hayFiltro = !!filtroLocal?.clave.startsWith("tramo:");

  const alternar = (k: TramoVencimiento) => alternarFiltro({ clave: `tramo:${k}`, etiqueta: `Vencimiento: ${TITULO[k]}`, coincide: (c) => tramoVencimientoDe(c) === k });
  const props = (k: TramoVencimiento) => ({
    onMouseEnter: () => apuntar({ tipo: "tramo", clave: k }),
    onMouseLeave: () => apuntar(null),
    onFocus: () => apuntar({ tipo: "tramo", clave: k }),
    onBlur: () => apuntar(null),
    onClick: () => alternar(k),
    "aria-pressed": filtroLocal?.clave === `tramo:${k}`,
  });
  // Las claves de la barra son las de `ORDEN`: se acotan aquí, en un solo lugar.
  const comoTramo = (clave: string) => clave as TramoVencimiento;

  return (
    <div className="card-cayla anim-entra min-w-0 p-5" style={{ ["--i" as string]: indice }}>
      <p className="label-cayla flex items-baseline justify-between gap-3 text-[11px] text-tinta/65">
        Deuda por vencimiento
        {total > 0 && <span className="text-[12px] font-normal normal-case tracking-normal text-tinta/55">clic para filtrar la lista</span>}
      </p>
      {total <= 0 ? (
        <p className="mt-4 text-sm text-tinta/65">No hay deuda pendiente con proveedores.</p>
      ) : (
        <>
          <BarraApilada
            className="mt-3.5"
            segmentos={filas.map((f) => ({ clave: f.k, nombre: TITULO[f.k], valor: f.monto, clase: COLOR[f.k] }))}
            unidad="soles"
            formato={soles}
            etiqueta={`Deuda por vencimiento: ${filas.map((f) => `${TITULO[f.k]} ${soles(f.monto)}`).join(", ")}`}
            respuesta={{
              onApuntar: (clave) => apuntar(clave === null ? null : { tipo: "tramo", clave: comoTramo(clave) }),
              onElegir: (clave) => alternar(comoTramo(clave)),
              elegida: hayFiltro ? (filtroLocal?.clave.slice("tramo:".length) ?? null) : null,
              accion: "Filtrar la lista",
            }}
          />
          <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
            {filas.map((f) => (
              <button
                key={f.k}
                type="button"
                {...props(f.k)}
                className={`-mx-1.5 -my-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-tinta/[0.04] ${filtroLocal?.clave === `tramo:${f.k}` ? "bg-tinta/[0.04]" : ""}`}
              >
                <span className="flex items-center gap-1.5 text-xs text-tinta/65">
                  <MuestraTramo clase={COLOR[f.k]} />
                  {TITULO[f.k]}
                </span>
                <span className="font-display mt-0.5 block text-[19px] tabular-nums text-tinta">
                  <CifraQueCuenta valor={f.monto} formato="soles" alMontar />
                </span>
                <span className="block text-xs tabular-nums text-tinta/55">{Math.round((f.monto / total) * 100)} %</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-3.5 flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-[10px] border border-dashed border-tinta/25 px-3 py-2 text-xs">
        <span className="text-tinta/65">Días promedio de pago · % pagado a tiempo</span>
        <span className="text-tinta/55">Aparecen con el primer comprobante pagado</span>
      </div>
    </div>
  );
}
