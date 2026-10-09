"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { textosCambioEstado, type EstadoProducto, type VocabularioEstado } from "@/lib/cambiar-estado-productos-reglas";
import type { ProductoListado } from "@/lib/catalogo-v2";

/**
 * Confirmar descontinuar (o desactivar) o reactivar prendas, con el combo «Responsable» (ADR-0161: cambiar el estado de una
 * prenda es Catálogo, se firma). Se monta solo al abrirse: la lista no lee la asistencia mientras nadie va a guardar nada.
 *
 * La usan dos lugares, con la MISMA regla en la base (`cambiar_estado_productos`, ADR-0254):
 *  - la barra de prendas marcadas de la Tabla («Descontinuar» / «Reactivar», varias a la vez);
 *  - el botón «Desactivar» / «Reactivar» de la vista rápida de la Grilla y la salida de «Eliminar» cuando la prenda ya se
 *    vendió (2026-10-09): una sola prenda, con el verbo `desactivar`.
 * Los textos de cada vocabulario viven en `lib/cambiar-estado-productos-reglas.ts`.
 */
export function CambiarEstadoProductosHoja({
  estado,
  productos,
  vocabulario = "descontinuar",
  onClose,
  onHecho,
}: {
  /** A qué estado van las prendas. */
  estado: EstadoProducto;
  productos: Pick<ProductoListado, "productoId" | "referencia" | "estado" | "stockTotal">[];
  /** Cómo se llama el cambio de «activo» a «descontinuado» en la hoja: «Descontinuar» (la Tabla) o «Desactivar» (la vista rápida). */
  vocabulario?: VocabularioEstado;
  onClose: () => void;
  onHecho: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const reactivar = estado === "activo";
  const cambian = productos.filter((p) => (reactivar ? p.estado !== "activo" : p.estado === "activo"));
  const textos = textosCambioEstado(estado, cambian.length, vocabulario);

  async function confirmar() {
    if (!responsable.listo || cambian.length === 0) return;
    const ids = cambian.map((p) => p.productoId);
    setGuardando(true);
    const supabase = createClient();
    let { error } = await firmar(supabase.rpc("cambiar_estado_productos", { p_producto_ids: ids, p_estado: estado }), responsable.firma());
    // Web publicada antes que la migración (20260928235000): el camino de antes, sin la revisión de marca al reactivar.
    if (esFuncionAusente(error)) {
      ({ error } = await firmar(supabase.from("productos").update({ estado }).in("id", ids), responsable.firma()));
    }
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, textos.accionError));
      return;
    }
    avisar.exito(textos.exito);
    onHecho();
    router.refresh();
  }

  return (
    <Modal variante="hoja" ancho="max-w-lg" bloqueado={guardando} titulo={textos.titulo} subtitulo={textos.subtitulo} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <ul className="max-h-60 divide-y divide-sand overflow-y-auto border-y border-sand">
            {productos.map((p) => {
              const queda = reactivar ? p.estado === "activo" : p.estado !== "activo";
              return (
                <li key={p.productoId} className="flex items-baseline justify-between gap-3 py-2.5 text-[13.5px]">
                  <span className={`min-w-0 truncate ${queda ? "text-tinta/50" : "text-tinta"}`}>{p.referencia}</span>
                  <span className="shrink-0 text-[12px] text-tinta/55">
                    {queda ? textos.yaEsta : `${p.stockTotal.toLocaleString("es-PE")} en stock`}
                  </span>
                </li>
              );
            })}
          </ul>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <p className="nota-cayla">{textos.nota}</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} disabled={guardando} className={botonCancelar}>
              Volver
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={guardando || !responsable.listo || cambian.length === 0}
              title={responsable.motivo ?? undefined}
              className={botonPrimario}
            >
              {guardando ? "Guardando…" : textos.boton}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
