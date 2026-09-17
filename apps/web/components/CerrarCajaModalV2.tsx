"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
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
 *
 * `cola` (ADR-0080): las ventas offline de esta sede que aún no subieron al
 * servidor. `cerrar_caja` calcula el "esperado" leyendo solo `venta_pagos` ya
 * persistidas — nunca ve esta cola — así que efectivo ya cobrado en el mostrador
 * pero todavía encolado infla el conteo físico sin que el esperado lo sepa, y se
 * lee como un sobrante que no es error de nadie. Prop obligatoria a propósito:
 * si mañana un tercer lugar monta este modal, TypeScript exige decidir de dónde
 * sale `cola` en vez de dejarlo caer en `[]` en silencio y resucitar el bug.
 */
export function CerrarCajaModalV2({
  cajaId,
  cola,
  onClose,
}: {
  cajaId: string;
  cola: VentaEncolada[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [montoReal, setMontoReal] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    sistema: number;
    contado: number;
    diferencia: number;
    efectivoEncoladoAlCerrar: number;
  } | null>(null);

  const efectivoEncolado = totalEfectivoEncolado(cola);
  // `navigator.onLine` solo promete "hay una interfaz de red arriba", no "el
  // servidor responde" — por eso el bloqueo de abajo es temporal (le da tiempo al
  // latido de 30 s de `PuntoDeVenta.tsx` para subir la venta sola) y nunca
  // definitivo: si el navegador se equivoca y en realidad no hay conexión real,
  // la rama offline igual deja cerrar, con el aviso puesto.
  const enLinea = typeof navigator !== "undefined" && navigator.onLine;
  // Bloquea SOLO con red Y plata encolada: si hay conexión, más vale esperar los
  // ~30s del reintento automático que forzar un cierre con un sobrante fantasma.
  // Sin red, esperar no sirve de nada (nada va a subir hasta que vuelva) — se
  // deja cerrar con el aviso bien visible, y el resultado repite el monto para
  // que la diferencia se explique sola.
  const bloqueaCierre = efectivoEncolado > 0 && enLinea;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Refuerza el `disabled` del botón: un Enter con foco en el campo puede
    // disparar el submit del <form> en algunos navegadores aunque el botón esté
    // deshabilitado (envío implícito, fuera del control de React).
    if (bloqueaCierre) {
      avisar.error("Hay ventas offline subiendo al sistema todavía — espera unos segundos y vuelve a intentar.");
      return;
    }
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
      efectivoEncoladoAlCerrar: efectivoEncolado,
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
            {resultado.efectivoEncoladoAlCerrar > 0 && (
              <div className="flex justify-between text-ambar-profundo">
                <dt>Ventas offline sin subir</dt>
                <dd className="tabular-nums">{money(resultado.efectivoEncoladoAlCerrar)}</dd>
              </div>
            )}
          </dl>
          {/* No afirma que esto explica TODA la diferencia (podría haber, además, un
              faltante real) — solo pone el dato al lado para que quien lee no salte
              directo a "falta plata" o "alguien se equivocó" sin saber que había ventas
              offline en camino (ver Don Norman, tarea original del ADR-0080). */}
          {resultado.efectivoEncoladoAlCerrar > 0 && (
            <p className="mx-auto max-w-[18rem] text-xs text-ambar-profundo">
              De esta diferencia, {money(resultado.efectivoEncoladoAlCerrar)} son ventas que ya cobraste sin
              conexión — el sistema todavía no las sumó. No es un error tuyo: suben solas apenas vuelva el
              internet.
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
        {/* Antes del campo de conteo a propósito — no dentro del "esperado" del
            servidor (eso rompería el conteo ciego, ver el comentario de arriba): esto
            es contexto para la persona, no un número que entra al cálculo. */}
        {efectivoEncolado > 0 && (
          <div className="anim-revelar space-y-1.5 rounded-lg border border-ambar/30 bg-ambar/10 px-3 py-2.5 text-xs text-ambar-profundo">
            <p className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
              Hay {money(efectivoEncolado)} en ventas offline que todavía no subieron al sistema — no van a
              estar incluidas en el esperado.
            </p>
            {bloqueaCierre && (
              <p className="pl-6 text-tinta/70">
                Tu sede tiene conexión: espera unos segundos a que esas ventas suban solas (reintentan cada
                30&nbsp;s) antes de cerrar caja.
              </p>
            )}
          </div>
        )}
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
          <button type="submit" disabled={loading || bloqueaCierre} className={botonPrimario}>
            {loading ? "Cerrando…" : bloqueaCierre ? "Esperando ventas offline…" : "Cerrar caja"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
