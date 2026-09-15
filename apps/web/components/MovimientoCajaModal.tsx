"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

// "Retiro de efectivo" del roadmap es un egreso con motivo predefinido —
// mismo caso que registrar_movimiento_caja() en SQL: un tipo, no una tabla.
const MOTIVOS_EGRESO_RAPIDO = ["Retiro de efectivo", "Compra de insumos", "Otro"];

export function MovimientoCajaModal({ cajaId, onClose }: { cajaId: string; onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [monto, setMonto] = useState("");
  const [motivoRapido, setMotivoRapido] = useState(MOTIVOS_EGRESO_RAPIDO[0]);
  const [motivoLibre, setMotivoLibre] = useState("");
  const [loading, setLoading] = useState(false);

  const mostrarSelect = tipo === "egreso";
  const mostrarLibre = tipo === "ingreso" || motivoRapido === "Otro";
  // Mismo criterio que decide qué campo se muestra (abajo): un ingreso siempre
  // se explica a mano, un egreso usa el atajo salvo que sea "Otro". Antes esta
  // condición solo miraba `motivoRapido === "Otro"`, así que un ingreso se
  // guardaba con el motivo del <select> de egresos ("Retiro de efectivo") aunque
  // la colaboradora hubiera escrito otra cosa en el campo libre que sí veía.
  const motivo = mostrarLibre ? motivoLibre : motivoRapido;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      avisar.error("Escribe el motivo.", { enfocar: "mov-motivo-libre" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_movimiento_caja", {
      p_caja_id: cajaId,
      p_tipo: tipo,
      p_monto: Number(monto) || 0,
      p_motivo: motivo,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el movimiento de caja"));
      return;
    }
    avisar.exito(`${tipo === "ingreso" ? "Ingreso" : "Egreso"} de caja registrado`, { detalle: `S/ ${(Number(monto) || 0).toFixed(2)} · ${motivo}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ingreso o egreso de caja" onClose={onClose}>
      {(cerrar) => (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Tipo</span>
          <div className="flex gap-2">
            {(["ingreso", "egreso"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                  tipo === t ? "border-rojo bg-rojo/8 text-rojo" : "border-tinta/20 text-tinta/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-monto">
            Monto
          </label>
          <input
            id="mov-monto"
            type="number"
            min={0.01}
            step="0.01"
            required
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={campoTexto}
          />
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-motivo-rapido">
            Motivo
          </label>
          {/* Truco de `grid-template-rows` (0fr↔1fr, igual que el motivo del botón en
              PuntoDeVentaTicket.tsx): tanto el select como el campo libre quedan siempre
              montados, y es la altura de su propia fila la que anima — antes el salto
              entre "egreso" (1 campo), "egreso · Otro" (2) e "ingreso" (1, distinto) era
              de golpe en las tres direcciones. El `0fr` de la fila no basta para llegar a
              0px real: el padding/borde del campo (`card-cayla`, `border-b`) le pone un
              piso de ~17px. Se fuerzan a 0 con `!` SOLO mientras está oculto — puesto fijo,
              `min-h-0` deflacionaba también el alto NATURAL del estado abierto (el propio
              alto automático del contenedor ya salía chico, y `1fr` solo repartía el 100%
              de ESE espacio ya achicado — nunca llegaba al alto real con interlineado). */}
          <div className={`grid overflow-hidden transition-[grid-template-rows] ${mostrarSelect ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <select
              id="mov-motivo-rapido"
              value={motivoRapido}
              onChange={(e) => setMotivoRapido(e.target.value)}
              disabled={!mostrarSelect}
              className={
                mostrarSelect
                  ? `overflow-hidden ${campoSelect}`
                  // `<select>` nativo (`appearance: auto`) trae un mínimo propio del
                  // cromado del sistema operativo que ni `padding:0`/`border:0` mueven
                  // — `appearance-none` lo saca, solo mientras está oculto.
                  : `min-h-0 overflow-hidden appearance-none !border-0 !py-0 !text-[0px] !leading-none ${campoSelect}`
              }
            >
              {MOTIVOS_EGRESO_RAPIDO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className={`grid overflow-hidden transition-[grid-template-rows] ${mostrarLibre ? "mt-1.5 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <input
              id="mov-motivo-libre"
              placeholder="Describe el motivo"
              value={motivoLibre}
              onChange={(e) => setMotivoLibre(e.target.value)}
              disabled={!mostrarLibre}
              className={mostrarLibre ? `min-w-0 overflow-hidden ${campoTexto}` : `min-h-0 min-w-0 overflow-hidden !border-0 !py-0 ${campoTexto}`}
            />
          </div>
        </div>


        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
