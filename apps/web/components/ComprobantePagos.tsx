"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ETIQUETA_METODO_PAGO, METODO_SALDO_A_FAVOR, fechaCorta, soles } from "@/lib/compras-reglas";
import { idsNuevos } from "@/lib/comprobante-linea-tiempo";

// «Pagos registrados» del detalle (ADR-0136): filas a todo el ancho —ficha del medio, fecha, N.° de operación
// (si se anotó) y monto a la derecha—, del más reciente al más antiguo, sin caja alrededor (como el prototipo). Cuando `router.refresh()` trae un pago que no estaba, esa fila ENTRA: se desliza
// desde la izquierda y su fondo destella en verde y se apaga (`cd-pago-nuevo`). Los que ya estaban al abrir no
// se animan (el detalle ya entra en cascada); tampoco se repite el efecto en un refresco cualquiera: solo es
// «nuevo» lo que aparece por primera vez DESPUÉS de haber pintado la lista.

export type PagoFila = { id: string; fecha: string; metodo: string; referencia: string | null; monto: number };

export function ComprobantePagos({ pagos }: { pagos: PagoFila[] }) {
  // Los ids que ya estaban cuando se abrió el detalle. Se fija una sola vez (estado inicial): un pago que
  // llega después no está en el conjunto y por eso se anima.
  const [iniciales] = useState<ReadonlySet<string>>(() => new Set(pagos.map((p) => p.id)));
  const idsNuevosOrdenados = idsNuevos(iniciales, pagos.map((p) => p.id));

  return (
    <section>
      <p className="label-cayla mb-1 text-[11px] text-tinta/65">Pagos registrados</p>
      {pagos.length === 0 ? (
        <p className="border-t border-tinta/10 py-2 text-[13px] text-tinta/55">Aún no hay pagos registrados.</p>
      ) : (
        <div>
          {pagos.map((p) => {
            const orden = idsNuevosOrdenados.indexOf(p.id);
            const nuevo = orden >= 0;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-tinta/10 py-2 text-[13px] sm:grid-cols-[auto_5.5rem_1fr_auto] ${nuevo ? "cd-pago-nuevo" : ""}`}
                style={nuevo ? ({ "--i": orden } as React.CSSProperties) : undefined}
              >
                <Chip tono="neutro">{ETIQUETA_METODO_PAGO[p.metodo] ?? p.metodo}</Chip>
                <span className="text-xs tabular-nums text-tinta/65">{fechaCorta(p.fecha)}</span>
                <span className="text-right font-semibold tabular-nums text-tinta sm:col-start-4 sm:row-start-1">{soles(p.monto)}</span>
                <span className={`col-span-3 truncate text-xs tabular-nums text-tinta/65 sm:col-span-1 sm:col-start-3 sm:row-start-1 ${p.referencia ? "" : "hidden sm:block"}`}>
                  {p.referencia ? (p.metodo === METODO_SALDO_A_FAVOR ? p.referencia : `Op. ${p.referencia}`) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
