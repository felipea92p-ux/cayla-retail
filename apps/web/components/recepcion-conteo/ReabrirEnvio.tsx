"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { mensajeDeLaRecepcion, type DetalleEnvio } from "@/lib/recepcion-envio-reglas";
import { TOPES_CONTEO } from "@/lib/recepcion-conteo-reglas";
import { reabrirEnvio } from "@/lib/recepcion-conteo-acciones";

// Reabrir (ADR-0393, decisión 5): «encontramos las 2 que faltaban». El envío vuelve a contarse; lo que faltó o sobró deja de valer hasta el
// próximo cierre (sale de «Nos debe»), lo pendiente vuelve al borrador de su línea y lo que entró al stock no se toca. Se dice por qué: queda
// en el rastro del envío. Si Compras ya resolvió lo que faltó, la base lo frena y la pantalla lo dice.

export function ReabrirEnvio({
  detalle,
  responsable,
  onReabierto,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  responsable: ControlResponsable;
  onReabierto: () => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guia = useGuiaCampos([
    { id: "reabrir-motivo", nombre: "Por qué", requerido: true, hecho: motivo.trim().length >= 3, pendiente: "Escribe por qué lo reabres." },
    { id: "reabrir-quien", nombre: "Quién lo reabre", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo reabre." },
  ]);
  const listo = guia.puedeConfirmar;

  async function reabrir() {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    const { error: e } = await reabrirEnvio({ p_despacho_id: detalle.id, p_version: detalle.version, p_motivo: motivo.trim(), p_token: token }, responsable.firma());
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      setError(mensajeDeLaRecepcion(e) ?? e.message ?? "No se pudo reabrir. Vuelve a intentar.");
      return;
    }
    avisar.exito(`${detalle.numero} reabierto`, { detalle: "Corrige lo que haga falta y vuelve a cerrarlo." });
    onReabierto();
  }

  return (
    <Modal titulo={`Reabrir ${detalle.numero}`} subtitulo="Lo que ya entró al stock no se toca. Lo que faltó o sobró se vuelve a anotar al cerrar." ancho="max-w-md" bloqueado={guardando} conCerrar onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
         
          onSubmit={(e) => {
            e.preventDefault();
            void reabrir();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="reabrir-motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("reabrir-motivo", "¿Por qué lo reabres?")}
              value={motivo}
              maxLength={TOPES_CONTEO.motivo}
              onChange={(e) => setMotivo(e.target.value)}
              // sugerir-fijo: el motivo de reabrir es libre y no depende de nada elegido antes
              placeholder="Ej. Encontramos las 2 que faltaban"
              autoFocus
            />
          </CampoGuiado>
          <CampoGuiado id="reabrir-quien" guia={guia}>
            <p className="mb-1.5 text-[13px] font-semibold text-tinta">{guia.etiqueta("reabrir-quien", "Quién lo reabre")}</p>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          {error && <Aviso tono="error" titulo="No se pudo reabrir">{error}</Aviso>}
          <PieGuia guia={guia} listo="Todo listo para reabrir." />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!listo} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Reabriendo…" : "Reabrir el conteo"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
