"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/campos";
import { MovimientoCajaModal } from "@/components/MovimientoCajaModal";
import { CerrarCajaModalV2 } from "@/components/CerrarCajaModalV2";
import type { CajaAbierta, MovimientoCaja, ResumenCaja } from "@/lib/caja";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

export function CajaAbiertaPanel({
  caja,
  resumen,
  movimientos,
}: {
  caja: CajaAbierta;
  resumen: ResumenCaja;
  movimientos: MovimientoCaja[];
}) {
  const [modal, setModal] = useState<"movimiento" | "cerrar" | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaSimple etiqueta="Apertura" valor={money(caja.montoApertura)} />
        <TarjetaSimple etiqueta="Ventas en efectivo" valor={money(resumen.ventasEfectivo)} />
        <TarjetaSimple etiqueta="Ventas con otro método" valor={money(resumen.ventasOtros)} />
        <TarjetaSimple etiqueta="Ingresos" valor={money(resumen.ingresos)} />
        <TarjetaSimple etiqueta="Egresos" valor={money(resumen.egresos)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton peso="discreto" onClick={() => setModal("movimiento")}>
          + Ingreso / egreso
        </Boton>
        <Boton peso="primario" onClick={() => setModal("cerrar")}>
          Cerrar caja
        </Boton>
      </div>

      {movimientos.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Movimientos de esta caja</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {movimientos.map((m) => (
              <div key={m.id} className="flex items-baseline gap-3 px-5 py-2.5">
                <span className="w-16 shrink-0 text-xs tabular-nums text-tinta/65">
                  {new Date(m.creadoEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="label-cayla w-16 shrink-0 text-[11px] text-tinta/65">{m.tipo}</span>
                <span className="min-w-0 flex-1 text-sm text-tinta">
                  {m.motivo}
                  {m.nota && <span className="block text-xs text-tinta/55">{m.nota}</span>}
                </span>
                <span className={`shrink-0 text-sm tabular-nums ${m.tipo === "egreso" ? "text-rojo" : "text-tinta"}`}>
                  {m.tipo === "egreso" ? "−" : "+"}
                  {money(m.monto)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal === "movimiento" && <MovimientoCajaModal cajaId={caja.id} onClose={() => setModal(null)} />}
      {modal === "cerrar" && (
        <CerrarCajaModalV2 cajaId={caja.id} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function TarjetaSimple({ etiqueta, valor, destacar = false }: { etiqueta: string; valor: string; destacar?: boolean }) {
  return (
    <div className={`card-cayla p-5 ${destacar ? "border-rojo/30" : ""}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-2 text-2xl ${destacar ? "text-rojo" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}
