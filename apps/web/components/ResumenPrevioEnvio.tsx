"use client";

import { X, Truck, Tag } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { soles } from "@/lib/compras-reglas";
import { inicialesProveedor, type FilaResumenComprobante } from "@/lib/envio-reglas";

// «Confirma lo que entra» (spike de Recibir, 2026-09-19): el último vistazo ANTES de escribir en el stock.
// Recibir deja movimientos que no se editan después (principio 4: `movimientos` es append-only), y hasta ahora un
// clic los escribía sin verlos juntos. Acá se ven por comprobante —lo que entra y lo que faltó con qué decisión—,
// lo fuera de comprobante, lo de otra sede y, para el líder, cuánto baja lo que se le debe al proveedor por lo
// que se cierra. Confirmar hace la MISMA llamada atómica de siempre (`recibir_envio`); acá no cambia ninguna regla.

export type FilaResumen = FilaResumenComprobante & { decisiones: string[] };

export function ResumenPrevioEnvio({
  filas,
  fuera,
  fueraDetalle,
  deOtraSede,
  trasladosDetalle,
  cierresMonto,
  ubicacionNombre,
  numeroGuia,
  unidades,
  cargando,
  onConfirmar,
  onVolver,
}: {
  filas: FilaResumen[];
  fuera: number;
  fueraDetalle: string;
  deOtraSede: number;
  trasladosDetalle: string;
  /** Solo líder: lo que baja lo que se le debe a los proveedores por los faltantes que se cierran. `null` = no aplica o no se ve. */
  cierresMonto: number | null;
  ubicacionNombre: string;
  numeroGuia: string;
  unidades: number;
  cargando: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const filaClase = "anim-entra grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-tinta/10 py-2.5 first:border-t-0";
  let i = 0;
  const estilo = () => ({ "--i": i++ + 3 }) as React.CSSProperties;
  return (
    <Modal
      titulo="Confirma lo que entra"
      subtitulo={
        <>
          Entra al almacén de <b className="font-semibold text-tinta">{ubicacionNombre}</b> · {numeroGuia.trim() ? `Guía ${numeroGuia.trim()}` : "Sin guía anotada"}
        </>
      }
      ancho="max-w-xl"
      onClose={onVolver}
    >
      {(cerrar) => (
        <div className="mt-3">
          <div>
            {filas.map((f) => (
              <div key={f.compraId} style={estilo()} className={filaClase}>
                <span aria-hidden className="grid h-[30px] w-[30px] place-items-center rounded-full bg-sand text-[10.5px] font-bold tracking-wide text-tinta/75">
                  {inicialesProveedor(f.proveedorNombre)}
                </span>
                <span className="min-w-0 text-sm text-tinta">
                  {f.proveedorNombre}
                  <span className="block text-xs text-tinta/65">
                    {f.documento}
                    {f.faltan > 0 ? ` · faltan ${f.faltan}: ${f.decisiones.join(", ")}` : " · llegó completo"}
                  </span>
                </span>
                <span className="font-display text-[22px] tabular-nums text-tinta">+{f.llegan.toLocaleString("es-PE")}</span>
              </div>
            ))}
            {fuera > 0 && (
              <div style={estilo()} className={filaClase}>
                <span aria-hidden className="grid h-[30px] w-[30px] place-items-center rounded-full bg-sand text-tinta/75">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm text-tinta">
                  Fuera de comprobante
                  <span className="block truncate text-xs text-tinta/65">{fueraDetalle}</span>
                </span>
                <span className="font-display text-[22px] tabular-nums text-tinta">+{fuera.toLocaleString("es-PE")}</span>
              </div>
            )}
            {deOtraSede > 0 && (
              <div style={estilo()} className={filaClase}>
                <span aria-hidden className="grid h-[30px] w-[30px] place-items-center rounded-full bg-sand text-tinta/75">
                  <Truck className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm text-tinta">
                  De otra sede
                  <span className="block truncate text-xs text-tinta/65">{trasladosDetalle}</span>
                </span>
                <span className="font-display text-[22px] tabular-nums text-tinta">+{deOtraSede.toLocaleString("es-PE")}</span>
              </div>
            )}
            {cierresMonto != null && (
              <div style={estilo()} className={filaClase}>
                <span aria-hidden className="grid h-[30px] w-[30px] place-items-center rounded-full bg-sand text-tinta/75">
                  <X className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm text-tinta">
                  Faltantes que se cierran
                  <span className="block text-xs text-tinta/65">Bajan lo que se le debe al proveedor</span>
                </span>
                <span className="font-display text-[22px] tabular-nums text-tinta">−{soles(cierresMonto)}</span>
              </div>
            )}
          </div>
          <p className="mt-3 border-l-2 border-taupe pl-3 text-[12.5px] text-tinta/65">
            Cada prenda entra como un movimiento del historial. Después no se edita: si algo estuvo mal, se corrige con un ajuste.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Boton peso="discreto" onClick={cerrar} disabled={cargando}>
              Volver a contar
            </Boton>
            <Boton peso="primario" cargando={cargando} onClick={onConfirmar}>
              Confirmar y recibir {unidades.toLocaleString("es-PE")} {unidades === 1 ? "unidad" : "unidades"}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
