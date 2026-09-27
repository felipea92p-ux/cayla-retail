"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { resumenAntesDeConfirmar, type DestinoRecepcion, type LecturaConteo } from "@/lib/traslados-recepcion-reglas";

// Confirmar la recepción de un traslado (ADR-0239). Dos cosas antes de apretar:
//  · D-131: si la sede tiene piso de venta, dónde se deja lo que llegó, con «Piso de venta» ya marcado. Sin la
//    pregunta, lo recibido quedaba en el almacén y en la caja salía «está en el almacén» con la prenda en la mano.
//  · D-129: qué entra ahora y qué espera a un líder, con el nombre de cada prenda que no cuadra.
// Solo decide qué se pinta; la llamada (`confirmar_traslado`) la hace el panel con lo elegido aquí.

const OPCIONES: Record<"piso_venta" | "almacen_tienda", { titulo: string; ayuda: string }> = {
  piso_venta: { titulo: "Piso de venta — listo para vender", ayuda: "Se cuelga hoy y se vende desde la caja." },
  almacen_tienda: { titulo: "Almacén", ayuda: "Se guarda atrás; para venderlo, se baja al piso con Reponer." },
};

export function TrasladoConfirmarModal({
  numero,
  sede,
  opcionesDestino,
  lectura,
  ocupado,
  motivoSinResponsable,
  onConfirmar,
  onClose,
}: {
  numero: number;
  sede: string;
  /** Vacío = la sede no tiene piso de venta (el Taller): no se pregunta y la base usa su lugar de siempre. */
  opcionesDestino: ("piso_venta" | "almacen_tienda")[];
  lectura: LecturaConteo;
  ocupado: boolean;
  /** Por qué no se puede confirmar todavía (falta elegir quién hace la operación); `null` si se puede. */
  motivoSinResponsable: string | null;
  onConfirmar: (destino: DestinoRecepcion, cerrar: () => void) => void;
  onClose: () => void;
}) {
  const [destino, setDestino] = useState<DestinoRecepcion>(opcionesDestino.includes("piso_venta") ? "piso_venta" : (opcionesDestino[0] ?? null));
  const r = resumenAntesDeConfirmar(lectura, { destino, sede });

  return (
    <Modal titulo={`Confirmar recepción del Traslado ${numero}`} subtitulo={r.entran} ancho="max-w-md" bloqueado={ocupado} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          {opcionesDestino.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-tinta">¿Dónde dejas lo que llegó?</legend>
              {opcionesDestino.map((o) => (
                <label
                  key={o}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
                    destino === o ? "border-tinta/40 bg-hueso" : "border-sand bg-papel hover:bg-hueso/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="destino-recepcion"
                    checked={destino === o}
                    onChange={() => setDestino(o)}
                    disabled={ocupado}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-tinta"
                  />
                  <span>
                    <span className="block text-sm font-medium text-tinta">{OPCIONES[o].titulo}</span>
                    <span className="block text-xs text-taupe">{OPCIONES[o].ayuda}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {r.esperan && (
            <div className="rounded-xl bg-hueso px-4 py-3 text-sm">
              <p className="text-tinta">{r.esperan}</p>
              <ul className="mt-1.5 space-y-0.5 text-taupe">
                {r.detalleEsperan.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>
          )}

          {motivoSinResponsable && <p className="text-sm text-rojo-profundo">{motivoSinResponsable}</p>}

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={cerrar} disabled={ocupado} className="btn-cayla btn-secundario">
              Seguir contando
            </button>
            <button type="button" onClick={() => onConfirmar(destino, cerrar)} disabled={ocupado || motivoSinResponsable !== null} className="btn-cayla btn-primario">
              {ocupado ? "Confirmando…" : "Confirmar recepción"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
