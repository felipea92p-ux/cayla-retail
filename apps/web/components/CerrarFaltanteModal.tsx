"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { ETIQUETA_MOTIVO_CIERRE, type CompraResumen, type LineaCompra, type MotivoCierre } from "@/lib/compras-reglas";

// Cerrar una línea con faltante DESDE EL DETALLE de un comprobante (D2, ADR-0111): la vía para cerrar solo una
// PARTE de una línea, o para cerrar después lo que en la guía se dejó como «lo espero». Al recibir mercadería el
// faltante se decide en la misma fila de la guía y se registra junto con la recepción; esto es el camino suelto.
//
// Solo cierra. La nota de crédito NO se registra acá (es una por comprobante y solo con el comprobante resuelto al
// 100 %): se registra desde la sección «Notas de crédito» del comprobante, cuando ya se sabe cuánto faltó en total.

const MOTIVOS = Object.entries(ETIQUETA_MOTIVO_CIERRE) as [MotivoCierre, string][];

const BTN_PRIMARIO = "label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";

export function CerrarFaltanteModal({ compra, linea, producto, onClose }: { compra: CompraResumen; linea: LineaCompra; producto: string; onClose: () => void }) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState(String(linea.pendiente));
  const [motivo, setMotivo] = useState<MotivoCierre>("no_llego");
  const [loading, setLoading] = useState(false);

  const n = Math.floor(Number(cantidad));
  const cantidadOk = Number.isFinite(n) && n >= 1 && n <= linea.pendiente;
  const pendienteComprobante = compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad;
  const cubreTodo = cantidadOk && pendienteComprobante - n <= 0;

  async function cerrar() {
    if (!cantidadOk) return void avisar.error(`La cantidad tiene que ser un entero entre 1 y ${linea.pendiente}.`, { enfocar: "cierre-cantidad" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("cerrar_linea_compra", { p_compra_item_id: linea.id, p_cantidad: n, p_motivo: motivo });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la línea"));
      return;
    }
    avisar.exito(`Línea cerrada: ${n} ${n === 1 ? "unidad" : "unidades"} de ${producto}`, {
      detalle: cubreTodo ? `${compra.documento} quedó resuelto al 100 %: ya puedes registrar la nota de crédito del proveedor.` : "La nota de crédito se registra cuando el comprobante quede resuelto al 100 %.",
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo={
        <>
          <span className="label-cayla mb-0.5 block text-[11px] text-tinta/65">Cerrar línea con faltante</span>
          <span className="block text-[28px] leading-tight">{producto}</span>
        </>
      }
      subtitulo={`Comprobante ${compra.documento} · ${compra.proveedorNombre}`}
      ancho="max-w-xl"
      onClose={onClose}
    >
      {() => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Un modal se monta en un portal, pero React propaga los eventos por el árbol de componentes, no
            // por el DOM: sin esto, este «enviar» subiría al <form> de quien lo abra (si lo hubiera).
            e.stopPropagation();
            void cerrar();
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor="cierre-cantidad" className="label-cayla text-[11px] text-tinta/65">
              ¿Cuántas unidades se cierran?
            </label>
            <input
              id="cierre-cantidad"
              type="number"
              min={1}
              max={linea.pendiente}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="ml-3 w-20 border-b border-tinta/25 bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
            />
            <span className="ml-2 text-xs text-tinta/55">de {linea.pendiente} pendientes</span>
          </div>

          <div>
            <p className="label-cayla mb-2 text-[11px] text-tinta/65">¿Qué pasó con las {cantidadOk ? n : "que faltan"}?</p>
            <div role="radiogroup" aria-label="Qué pasó con las unidades que faltan" className="inline-flex h-9 overflow-hidden rounded-lg border border-tinta/15">
              {MOTIVOS.map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={motivo === valor}
                  onClick={() => setMotivo(valor)}
                  className={`label-cayla px-3.5 text-[11px] transition-colors ${motivo === valor ? "bg-tinta text-crema" : "text-tinta/65 hover:text-rojo"}`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-tinta/60">
            {cubreTodo ? `Con este cierre ${compra.documento} queda resuelto al 100 % (recibido o cerrado). ` : ""}
            No se borra nada: el cierre queda como un registro nuevo en el historial del comprobante. La nota de crédito del proveedor, si emite una, se registra aparte, cuando el comprobante esté resuelto.
          </p>

          <div className="flex justify-end border-t border-tinta/10 pt-4">
            <button type="submit" className={BTN_PRIMARIO} disabled={loading}>
              {loading ? "Cerrando…" : "Cerrar línea con faltante"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
