"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import type { OrdenProduccion } from "@/lib/produccion";
import { cantidadTexto } from "@/lib/insumos-reglas";
import type { ConsumoDeOrden } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Anular y revertir una orden (ADR-0133, F2: se conservan tal cual estaban en `OrdenesProduccionV2.tsx`; solo
// cambió de archivo). Cada una es una RPC; ninguna escribe en las tablas directo. Si la base dice que no, el aviso
// lo dice con las palabras de la RPC (`traducirError` deja pasar los P0001 tal cual).

export function AnularOrdenModal({ orden, consumos = [], onClose }: { orden: OrdenProduccion; consumos?: ConsumoDeOrden[]; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): anular firma con quien se elige en el combo, no con la cuenta abierta.
  const responsable = useResponsable();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(
      createClient().rpc("anular_produccion", { p_produccion_id: orden.id, p_motivo: motivo.trim() || undefined }),
      responsable.firma(),
    );
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "anular la orden"));
      return;
    }
    avisar.exito(`Orden de ${orden.referencia} anulada`);
    router.refresh();
    onClose();
  }

  // Lo que la base devuelve al anular: el neto (consumo − devolución) de cada insumo.
  const porDevolver = [...consumos.reduce((m, c) => m.set(c.insumoId, { insumo: c.insumo, unidad: c.unidad, neto: (m.get(c.insumoId)?.neto ?? 0) + c.cantidad }), new Map<string, { insumo: string; unidad: ConsumoDeOrden["unidad"]; neto: number }>()).values()].filter((g) => g.neto > 0);

  return (
    <Modal titulo="Anular orden" subtitulo={`${orden.referencia} · ${orden.cantidadPlan} planeadas`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-tinta/75">La orden queda anulada y no toca el stock de prendas. Sigue visible abajo, para que no se pierda el registro.</p>
        {porDevolver.length > 0 && (
          <p className="rounded-lg border border-ambar/40 bg-ambar/[0.07] px-3 py-2.5 text-[13px] text-ambar-profundo">
            <b className="font-semibold">Los insumos descontados vuelven al estante</b> ({porDevolver.map((g) => `${g.insumo} ${cantidadTexto(g.neto, g.unidad)}`).join(", ")}), cada uno a su lote y a su costo. Queda
            registrado como devolución.
          </p>
        )}
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="anular-motivo">
            Motivo (opcional)
          </label>
          <input id="anular-motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se cancela la corrida" className={campoTexto} />
        </div>
        <ComboResponsable control={responsable} deshabilitado={cargando} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Volver
          </button>
          <button type="submit" disabled={cargando || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
            {cargando ? "Anulando…" : "Anular orden"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RevertirOrdenModal({ orden, onClose }: { orden: OrdenProduccion; onClose: () => void }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable();

  async function confirmar() {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(createClient().rpc("revertir_produccion", { p_produccion_id: orden.id }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "revertir el cierre"));
      return;
    }
    avisar.exito(`Orden de ${orden.referencia} vuelve a estar en proceso`);
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Revertir cierre" subtitulo={`${orden.referencia} · ${orden.cantidadBuenas} buenas`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-tinta/75">
          {orden.inventariadoEn
            ? `Las ${orden.cantidadBuenas} prendas salen del stock del Taller (queda un movimiento de reversión, la entrada original no se borra) y la orden vuelve a "en proceso" para corregir buenas o costos.`
            : "La muestra vuelve a \"en proceso\". No había stock que devolver."}
        </p>
        <ComboResponsable control={responsable} deshabilitado={cargando} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Volver
          </button>
          <button type="button" onClick={confirmar} disabled={cargando || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
            {cargando ? "Revirtiendo…" : "Revertir"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
