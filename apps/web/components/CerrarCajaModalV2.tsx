"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { claveLocal, leer } from "@/lib/almacen-local";
import { totalEfectivoEncolado, type VentaEncolada } from "@/lib/ventas-offline";

function money(n: number) {
  return "S/" + n.toFixed(2);
}

/**
 * Conteo ciego: quien cuenta el cajón NO ve cuánto espera el sistema hasta
 * después de haber escrito su número. Si lo ve antes, el conteo deja de ser una
 * medición y pasa a ser una confirmación — y una diferencia real nunca aparece.
 * El esperado sale de la respuesta de `cerrar_caja`, no de una prop: el servidor
 * lo calcula en el instante del cierre, así que incluye las ventas que hayan
 * entrado mientras la pantalla estaba abierta.
 */
export function CerrarCajaModalV2({
  cajaId,
  ubicacionId,
  onClose,
}: {
  cajaId: string;
  ubicacionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [montoReal, setMontoReal] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    sistema: number;
    contado: number;
    diferencia: number;
    /** Efectivo de ventas offline todavía sin subir al servidor (BACKLOG) — no
     *  entra en `sistema` porque `cerrar_caja` solo ve lo que ya está en la
     *  base. Se lee al cerrar, no antes: mostrarlo junto al monto a contar
     *  sería revelar parte del esperado (ADR-0042, conteo ciego). */
    efectivoEnCamino: number;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("cerrar_caja", { p_caja_id: cajaId, p_monto_real: Number(montoReal) || 0 })
      .single();
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la caja"));
      return;
    }
    const diferencia = Number(data.diferencia);
    avisar.exito("Caja cerrada", {
      detalle: diferencia === 0 ? "Cuadró exacto." : `${diferencia > 0 ? "Sobran" : "Faltan"} S/ ${Math.abs(diferencia).toFixed(2)} contra el sistema.`,
    });
    setResultado({
      sistema: Number(data.monto_sistema),
      contado: Number(data.monto_real),
      diferencia,
      efectivoEnCamino: totalEfectivoEncolado(leer<VentaEncolada[]>(claveLocal(ubicacionId, "cola"), [])),
    });
  }

  /**
   * El refresco va acá y no en `onSubmit` a propósito: al refrescar, el servidor
   * responde que la ubicación ya no tiene caja abierta, el panel que monta este
   * modal deja de renderizarse y el resultado se desmonta antes de que nadie
   * alcance a leerlo. La diferencia de caja es el número por el que se pregunta
   * al día siguiente — tiene que poder leerse.
   */
  function cerrarYRefrescar() {
    router.refresh();
    onClose();
  }

  if (resultado) {
    const cuadra = Math.abs(resultado.diferencia) < 0.01;
    return (
      <Modal titulo="Caja cerrada" onClose={cerrarYRefrescar}>
        {(cerrar) => (
        <div className="space-y-4 text-center">
          <p className={`label-cayla text-[11px] ${cuadra ? "text-verde-profundo" : "text-rojo"}`}>
            {cuadra ? "Cuadró" : "No cuadró"}
          </p>
          <p className={`font-display text-3xl ${cuadra ? "text-tinta" : "text-rojo"}`}>
            {resultado.diferencia >= 0 ? "+" : ""}
            {money(resultado.diferencia)}
          </p>
          <p className="text-sm text-tinta/70">
            {cuadra
              ? "El efectivo contado coincide con lo esperado."
              : resultado.diferencia > 0
                ? "Hay más efectivo del que el sistema esperaba."
                : "Falta efectivo respecto a lo que el sistema esperaba."}
          </p>
          <dl className="mx-auto flex max-w-[15rem] flex-col gap-1 border-t border-tinta/10 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta/60">El sistema esperaba</dt>
              <dd className="tabular-nums">{money(resultado.sistema)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta/60">Contaste</dt>
              <dd className="tabular-nums">{money(resultado.contado)}</dd>
            </div>
          </dl>
          {resultado.efectivoEnCamino > 0 && (
            <p className="mx-auto max-w-[18rem] rounded-md bg-ambar/10 px-3 py-2 text-xs text-ambar-profundo">
              {`Ojo: ${money(resultado.efectivoEnCamino)} de ventas hechas sin internet todavía no subieron al sistema — ese efectivo ya está en el cajón, pero "el sistema esperaba" no lo cuenta todavía.`}
            </p>
          )}
          <button type="button" autoFocus onClick={cerrar} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Cerrar caja"
      subtitulo="Cuenta el efectivo del cajón. Al cerrar te decimos si cuadra."
      onClose={onClose}
    >
      {(cerrar) => (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="cierre-monto">
            Cuenta el efectivo físico y escribe el total
          </label>
          <input
            id="cierre-monto"
            type="number"
            min={0}
            step="0.10"
            required
            autoFocus
            value={montoReal}
            onChange={(e) => setMontoReal(e.target.value)}
            className={campoTexto}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Cerrando…" : "Cerrar caja"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
