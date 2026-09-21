"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { esMotivoDeAjuste, motivosDeMovimiento, referenciaObligatoria } from "@/lib/caja-panel-reglas";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

// «Retiro de efectivo» y «Depósito bancario» son un egreso con motivo predefinido — mismo caso que
// registrar_movimiento_caja() en SQL: un tipo, no una tabla. «Ajuste de caja» además marca es_ajuste=true, que
// la RPC exige de líder (ADR-0056). Las listas y las reglas viven en lib/caja-panel-reglas.ts.

export function MovimientoCajaModal({ cajaId, esLider, onClose }: { cajaId: string; esLider: boolean; onClose: () => void }) {
  const router = useRouter();
  // Nada viene elegido de antemano (auditoría de /caja, #6): un movimiento de plata se decide, no se acepta por defecto.
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | null>(null);
  const [monto, setMonto] = useState("");
  const [motivoRapido, setMotivoRapido] = useState("");
  const [motivoLibre, setMotivoLibre] = useState("");
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  const motivosRapidos = tipo ? motivosDeMovimiento(tipo, esLider) : [];
  const mostrarLibre = motivoRapido === "Otro";
  const motivo = mostrarLibre ? motivoLibre : motivoRapido;
  const esAjuste = esMotivoDeAjuste(motivoRapido);
  const pideReferencia = referenciaObligatoria(motivoRapido);

  function cambiarTipo(t: "ingreso" | "egreso") {
    setTipo(t);
    // La lista cambia con el tipo; sin este reseteo el select quedaría con el motivo del tipo anterior.
    setMotivoRapido("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) {
      avisar.error("Elige si es un ingreso o un egreso.");
      return;
    }
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
      p_nota: nota.trim() || undefined,
      p_es_ajuste: esAjuste,
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
                onClick={() => cambiarTipo(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                  tipo !== t
                    ? "border-tinta/20 text-tinta/70"
                    : t === "ingreso"
                      ? "border-verde bg-verde/10 text-verde"
                      : "border-rojo bg-rojo/8 text-rojo"
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
          <select
            id="mov-motivo-rapido"
            value={motivoRapido}
            onChange={(e) => setMotivoRapido(e.target.value)}
            className={campoSelect}
          >
            {motivosRapidos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {/* Truco de `grid-template-rows` (0fr↔1fr, igual que el motivo del botón en
              PuntoDeVentaTicket.tsx): el campo libre queda siempre montado, y es la
              altura de su propia fila la que anima — antes el salto al elegir "Otro"
              era de golpe. El `0fr` de la fila no basta para llegar a 0px real: el
              padding/borde del campo (`card-cayla`, `border-b`) le pone un piso de
              ~17px. Se fuerzan a 0 con `!` SOLO mientras está oculto — puesto fijo,
              `min-h-0` deflacionaba también el alto NATURAL del estado abierto (el
              propio alto automático del contenedor ya salía chico, y `1fr` solo
              repartía el 100% de ESE espacio ya achicado — nunca llegaba al alto real
              con interlineado). */}
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

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-nota">
            Referencia{pideReferencia ? "" : " (opcional)"}
          </label>
          <input
            id="mov-nota"
            placeholder="N° de operación, voucher, u otra nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className={campoTexto}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || !tipo || !motivoRapido} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
