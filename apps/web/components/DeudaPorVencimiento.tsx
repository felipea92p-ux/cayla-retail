import { soles } from "@/lib/compras-reglas";
import type { DeudaPorVencimiento as Tramo, TramoVencimiento } from "@/lib/compras-indicadores";

// «Deuda por vencimiento» (maqueta 02): cuánto de lo que se debe ya venció, cuánto vence esta
// semana, este mes y después — la barra apilada da la proporción, la leyenda el monto y el %.
// Las cifras vienen de la base sobre TODA la deuda (`deuda_por_vencimiento()`), no de la página
// de 50 filas que se está mirando.
//
// Los días promedio de pago y el % pagado a tiempo no se inventan: necesitan comprobantes ya
// pagados por completo. Mientras no los haya, el recuadro punteado lo dice.

const ORDEN: TramoVencimiento[] = ["vencida", "0_7", "8_30", "mas_30"];
const TITULO: Record<TramoVencimiento, string> = { vencida: "Vencida", "0_7": "0–7 días", "8_30": "8–30 días", mas_30: "Más de 30" };
// Rojo solo para lo que ya venció (hay que actuar); ámbar lo inminente; el resto, tinta.
const COLOR: Record<TramoVencimiento, string> = { vencida: "bg-rojo", "0_7": "bg-ambar", "8_30": "bg-tinta/50", mas_30: "bg-tinta/20" };

export function DeudaPorVencimiento({ tramos }: { tramos: Tramo[] }) {
  const porTramo = new Map(tramos.map((t) => [t.tramo, t]));
  const filas = ORDEN.map((k) => ({ k, monto: porTramo.get(k)?.monto ?? 0 }));
  const total = filas.reduce((a, f) => a + f.monto, 0);

  return (
    <div className="card-cayla p-5">
      <p className="label-cayla text-[11px] text-tinta/65">Deuda por vencimiento</p>
      {total <= 0 ? (
        <p className="mt-4 text-sm text-tinta/65">No hay deuda pendiente con proveedores.</p>
      ) : (
        <>
          <div className="mt-3.5 flex h-3.5 overflow-hidden rounded-lg bg-sand" role="img" aria-label={`Deuda por vencimiento: ${filas.map((f) => `${TITULO[f.k]} ${soles(f.monto)}`).join(", ")}`}>
            {filas.map((f) => (
              <span key={f.k} className={COLOR[f.k]} style={{ width: `${(f.monto / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {filas.map((f) => (
              <div key={f.k}>
                <p className="flex items-center gap-1.5 text-xs text-tinta/65">
                  <span aria-hidden className={`h-[9px] w-[9px] rounded-[3px] ${COLOR[f.k]}`} />
                  {TITULO[f.k]}
                </p>
                <p className="font-display mt-0.5 text-[19px] tabular-nums text-tinta">{soles(f.monto)}</p>
                <p className="text-xs tabular-nums text-tinta/55">{Math.round((f.monto / total) * 100)} %</p>
              </div>
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
