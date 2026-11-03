"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { type DetalleEnvio } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO, mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { cancelarRecepcion } from "@/lib/recepcion-conteo-acciones";

// Cancelar la recepción (ADR-0605, Felipe 2026-11-03): un envío que llegó SIN AVISO y se abrió por error, o llegó a otra sede. Queda anulado con quién, cuándo y por qué;
// lo contado queda como historia y nada entra al stock. No se ofrece en uno de Compras, uno ya cerrado ni uno que alguna vez metió stock (ahí se cuadra y se cierra, o se reabre).
// Es la única hoja que pregunta antes de quitar algo, porque un envío anulado no se recupera.

const MOTIVOS = ["Se abrió por error", "Llegó a otra sede", "Lo mandaron mal"] as const;

export function CancelarRecepcion({
  detalle,
  contadas,
  responsable,
  onCancelado,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  /** Lo que ya se contó en el envío (para decirlo: «se descartan 3 prendas»). */
  contadas: number;
  responsable: ControlResponsable;
  onCancelado: () => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guia = useGuiaCampos([
    { id: "cancelar-motivo", nombre: "Por qué", requerido: true, hecho: motivo.trim().length >= 3, pendiente: "Escribe por qué se cancela." },
    { id: "cancelar-quien", nombre: "Quién lo cancela", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo cancela." },
  ]);
  const listo = guia.puedeConfirmar;

  async function cancelar() {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    const { error: e } = await cancelarRecepcion({ p_despacho_id: detalle.id, p_version: detalle.version, p_motivo: motivo.trim() }, responsable.firma());
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      setError(mensajeAlGuardar(e, "cancelar la recepción"));
      return;
    }
    avisar.exito(`${detalle.numero} se canceló`, { detalle: "Quedó anulado, con tu nombre y el motivo." });
    onCancelado();
  }

  return (
    <Modal titulo={`Cancelar la recepción de ${detalle.numero}`} subtitulo="Llegó sin aviso y se abrió. Si ya no hay nada que recibir, se anula." bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void cancelar();
          }}
          className="space-y-4"
        >
          <Aviso tono="atencion" titulo="Qué pasa al cancelar">
            El envío queda <b>anulado</b> y sale de la lista.{" "}
            {contadas > 0 ? <>Lo que contaste ({contadas === 1 ? "1 prenda" : `${contadas} prendas`}) se descarta y no entra al stock.</> : "No hay nada contado: no entra nada al stock."} Si ya se recibió algo de él, no se cancela:
            se cuadra y se cierra.
          </Aviso>
          <CampoGuiado id="cancelar-motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("cancelar-motivo", "¿Por qué lo cancelas?")}
              value={motivo}
              maxLength={TOPES_CONTEO.motivo}
              onChange={(e) => setMotivo(e.target.value)}
              // sugerir-fijo: el motivo de cancelar es libre y no depende de nada elegido antes
              placeholder="Ej. Se abrió por error"
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS.map((m) => (
                <button key={m} type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => setMotivo(m)}>
                  {m}
                </button>
              ))}
            </div>
          </CampoGuiado>
          <CampoGuiado id="cancelar-quien" guia={guia}>
            <p className="mb-1.5 text-sm font-semibold text-tinta">{guia.etiqueta("cancelar-quien", "Quién lo cancela")}</p>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          {error && <Aviso tono="error" titulo="No se pudo cancelar">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo para cancelar." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Seguir recibiendo
            </Boton>
            <Boton type="submit" peso="peligro" cargando={guardando} textoCargando="Cancelando…" disabled={!listo} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Cancelar la recepción
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
