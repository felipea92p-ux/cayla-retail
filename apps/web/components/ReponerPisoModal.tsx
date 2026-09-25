"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { SENTIDO_PISO, topeMovimientoPiso, type SentidoPiso } from "@/lib/inventario-reglas";
/** Lo que el modal necesita de una prenda: sirve tanto a la fila de Existencias
 *  como a la de Resumen, que no comparten el resto de sus campos. */
export type FilaParaReponer = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  sku: string;
  piso: number | null;
  almacen: number | null;
};

// Llama a `retail.mover_interno` (20260914230000_inventario_piso_almacen.sql):
// mismo motor que un traslado entre sedes, pero dentro de la misma
// ubicación — el total de la tienda no cambia, solo dónde vive físicamente
// la prenda. Los UUID de piso/almacén ya vienen resueltos desde el server
// component (InventarioPage → getSububicaciones): este modal nunca los
// adivina ni los busca por nombre.
//
// Sirve a los dos sentidos (`SENTIDO_PISO` en `lib/inventario-reglas.ts`): bajar
// al piso y retirar del piso son la misma llamada con origen y destino invertidos.
export function ReponerPisoModal({
  sentido,
  fila,
  ubicacionId,
  sububicacionPisoId,
  sububicacionAlmacenId,
  cantidadInicial,
  onClose,
}: {
  /** «bajar» = del almacén al piso; «retirar» = del piso al almacén. */
  sentido: SentidoPiso;
  fila: FilaParaReponer;
  ubicacionId: string;
  sububicacionPisoId: string;
  sububicacionAlmacenId: string;
  /** Prellenado que sugiere Resumen. La persona lo confirma o lo cambia: el modal
   *  nunca mueve nada hasta que aprieta «Confirmar». */
  cantidadInicial?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const regla = SENTIDO_PISO[sentido];
  const disponible = topeMovimientoPiso(sentido, fila);
  const sububicacion = { piso: sububicacionPisoId, almacen: sububicacionAlmacenId };
  const [cantidad, setCantidad] = useState(cantidadInicial && cantidadInicial > 0 ? String(Math.min(cantidadInicial, disponible)) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mover entre piso y almacén mueve stock: pide Responsable como toda acción que guarda en la tienda (ADR-0161).
  const responsable = useResponsable();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n <= 0) {
      setError("La cantidad debe ser un número entero mayor que cero.");
      return;
    }
    if (n > disponible) {
      setError(regla.noAlcanza(n, disponible));
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: errorRpc } = await firmar(supabase.rpc("mover_interno", {
      p_ubicacion_id: ubicacionId,
      p_variante_id: fila.varianteId,
      p_cantidad: n,
      p_sububicacion_origen_id: sububicacion[regla.origen],
      p_sububicacion_destino_id: sububicacion[regla.destino],
    }), responsable.firma());
    setLoading(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      setError(traducirError(errorRpc, regla.accion));
      return;
    }
    avisar.exito(regla.exito(n), {
      detalle: `${fila.referencia} · ${[fila.talla, fila.color].filter(Boolean).join("/")}`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={regla.titulo} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <p className="text-sm text-tinta">
            {fila.referencia} <span className="text-tinta/65">{[fila.talla, fila.color].filter(Boolean).join("/")}</span>{" "}
            <span className="font-mono text-xs text-tinta/65">{fila.sku}</span>
          </p>

          <div className="card-cayla grid grid-cols-2 divide-x divide-tinta/10 text-center">
            <div className="p-3">
              <p className="label-cayla text-[10px] text-tinta/55">{regla.etiquetaPiso}</p>
              <p className="font-display text-xl text-tinta">{fila.piso ?? 0}</p>
            </div>
            <div className="p-3">
              <p className="label-cayla text-[10px] text-tinta/55">{regla.etiquetaAlmacen}</p>
              <p className="font-display text-xl text-tinta">{fila.almacen ?? 0}</p>
            </div>
          </div>

          <CampoTexto
            etiqueta={regla.etiquetaCantidad}
            type="number"
            min={1}
            max={disponible}
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            pie={error ?? regla.recorrido}
            tono={error ? "error" : "neutro"}
            autoFocus
          />

          <ComboResponsable control={responsable} deshabilitado={loading} />

          <div className="flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={disponible === 0 || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className="flex-1"
            >
              Confirmar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
