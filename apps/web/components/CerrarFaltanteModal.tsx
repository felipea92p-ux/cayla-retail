"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoSelectNativo } from "@/components/ui/campos";
import { ETIQUETA_MOTIVO_CIERRE, type CompraResumen, type LineaCompra, type MotivoCierre } from "@/lib/compras-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Cerrar una línea con faltante DESDE EL DETALLE de un comprobante (D2, ADR-0111): la vía para cerrar solo una
// PARTE de una línea, o para cerrar después lo que en la guía se dejó como «lo espero». Al recibir mercadería el
// faltante se decide en la misma fila de la guía y se registra junto con la recepción; esto es el camino suelto.
//
// Solo cierra. La nota de crédito NO se registra acá (es una por comprobante y solo con el comprobante resuelto al
// 100 %): se registra desde la sección «Notas de crédito» del comprobante, cuando ya se sabe cuánto faltó en total.

const MOTIVOS = Object.entries(ETIQUETA_MOTIVO_CIERRE) as [MotivoCierre, string][];

// Repartido entre tiendas (ADR-0139) el faltante es de UNA tienda: las que aún tienen algo pendiente de esta línea, con lo que
// les falta. Sin ellas (una base sin reparto) el cierre va sin tienda, como siempre, y la base infiere la única que hay.
export type TiendaConFaltante = { ubicacionId: string; nombre: string; pendiente: number };

const BTN_PRIMARIO = "label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";

export function CerrarFaltanteModal({
  compra,
  linea,
  producto,
  tiendas = [],
  onClose,
}: {
  compra: CompraResumen;
  linea: LineaCompra;
  producto: string;
  /** Las tiendas a las que aún les falta algo de esta línea (con reparto). Vacío = sin reparto. */
  tiendas?: TiendaConFaltante[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [tiendaId, setTiendaId] = useState(tiendas[0]?.ubicacionId ?? "");
  const tienda = tiendas.find((t) => t.ubicacionId === tiendaId);
  // Lo que se puede cerrar es lo pendiente de ESA tienda (sin reparto, de toda la línea).
  const tope = tienda ? tienda.pendiente : linea.pendiente;
  const [cantidad, setCantidad] = useState(String(tope));
  const [motivo, setMotivo] = useState<MotivoCierre>("no_llego");
  const [loading, setLoading] = useState(false);
  // Quién cierra (ADR-0161/0162): `cerrar_linea_compra` firma con esa persona.
  const responsable = useResponsable();

  const n = Math.floor(Number(cantidad));
  const cantidadOk = Number.isFinite(n) && n >= 1 && n <= tope;
  const pendienteComprobante = compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad;
  const cubreTodo = cantidadOk && pendienteComprobante - n <= 0;

  async function cerrar() {
    if (!cantidadOk) return void avisar.error(`La cantidad tiene que ser un entero entre 1 y ${tope}${tienda ? ` (lo que aún le falta a ${tienda.nombre})` : ""}.`, { enfocar: "cierre-cantidad" });
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(supabase.rpc("cerrar_linea_compra", {
      p_compra_item_id: linea.id,
      p_cantidad: n,
      p_motivo: motivo,
      // En una línea repartida la base exige saber de qué tienda es el faltante.
      ...(tienda ? { p_ubicacion_id: tienda.ubicacionId } : {}),
    }), responsable.firma());
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "cerrar la línea"));
      return;
    }
    avisar.exito(`Línea cerrada: ${n} ${n === 1 ? "unidad" : "unidades"} de ${producto}${tienda && tiendas.length > 1 ? ` (${tienda.nombre})` : ""}`, {
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
          {tiendas.length > 1 && (
            <CampoSelectNativo
              etiqueta="¿En qué tienda faltó?"
              value={tiendaId}
              onChange={(e) => {
                const t = tiendas.find((x) => x.ubicacionId === e.target.value);
                setTiendaId(e.target.value);
                setCantidad(String(t?.pendiente ?? linea.pendiente));
              }}
            >
              {tiendas.map((t) => (
                <option key={t.ubicacionId} value={t.ubicacionId}>
                  {t.nombre} · le faltan {t.pendiente}
                </option>
              ))}
            </CampoSelectNativo>
          )}

          <div>
            <label htmlFor="cierre-cantidad" className="label-cayla text-[11px] text-tinta/65">
              ¿Cuántas unidades se cierran?
            </label>
            <input
              id="cierre-cantidad"
              type="number"
              min={1}
              max={tope}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="ml-3 w-20 border-b border-tinta/25 bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
            />
            <span className="ml-2 text-xs text-tinta/55">
              de {tope} pendientes{tienda ? ` en ${tienda.nombre}` : ""}
            </span>
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

          <ComboResponsable control={responsable} deshabilitado={loading} />

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
