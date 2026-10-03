"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  LARGO_DETALLE_META,
  leerSoles,
  MOTIVOS_META,
  validarCambioMeta,
  type MotivoMeta,
  type PersonaMeta,
} from "@/lib/rendimiento-meta-reglas";

/* ====================================================================
   Cambiar la meta de una persona (ADR-0325, D-146 a D-148)

   Se cambia la meta DEL MES; la del día se recalcula sola en la misma proporción. Quién puede lo decide la base
   (`fijar_meta_persona`: la tienda tiene que ser de las que Rendimiento le muestra a la cuenta, nadie cambia la
   suya salvo un Admin, no se tocan meses pasados); acá solo se dice antes de enviar lo que la base rechazaría.

   TRES COSAS QUE NO SON OBVIAS
   1. El motivo es obligatorio y queda en un historial que nadie edita ni borra: es lo que hace que un cambio de meta
      se pueda explicar meses después.
   2. Se manda con la meta que se VIÓ al abrir (`p_meta_esperada`): si otra persona la cambió mientras esta ventana
      estaba abierta, la base lo dice en vez de pisarla.
   3. «Volver a la automática» no pide motivo ni cifra: la meta vuelve a lo que salía de las horas programadas.
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

export function EditarMetaModal({
  persona,
  ubicacionId,
  ubicacionNombre,
  mes,
  mesEtiqueta,
  metaSedeMes,
  onClose,
}: {
  persona: PersonaMeta;
  ubicacionId: string;
  ubicacionNombre: string;
  /** Primer día del mes (`aaaa-mm-01`). */
  mes: string;
  /** «setiembre». */
  mesEtiqueta: string;
  metaSedeMes: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionNombre });
  const ajustada = persona.metaAjustadaMes !== null;
  const [metaTexto, setMetaTexto] = useState(persona.metaMes !== null ? String(Math.round(persona.metaMes)) : "");
  const [motivo, setMotivo] = useState<MotivoMeta | "">("");
  const [detalle, setDetalle] = useState("");
  const [volver, setVolver] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  // Guía de foco (CLAUDE.md «Guía de foco»): el camino sale de las reglas que ya validan abajo (`validarCambioMeta`), no de reglas
  // nuevas. Volver a la automática no pide cifra ni motivo: solo quién lo hace.
  const metaLeida = leerSoles(metaTexto);
  const guia = useGuiaCampos([
    ...(volver
      ? []
      : [
          {
            id: "meta",
            nombre: "La meta del mes",
            requerido: true,
            hecho: Number.isFinite(metaLeida) && metaLeida > 0 && (metaSedeMes === null || metaLeida <= metaSedeMes),
            pendiente: "Escribe la meta del mes.",
          },
          { id: "motivo", nombre: "El motivo", requerido: true, hecho: motivo !== "", pendiente: "Elige el motivo del cambio." },
          ...(motivo === "otro"
            ? [{ id: "detalle", nombre: "El motivo en una línea", requerido: true, hecho: detalle.trim() !== "", pendiente: "Cuenta el motivo en una línea." }]
            : []),
        ]),
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace esta operación." },
  ]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    const v = validarCambioMeta({ metaTexto, volverAutomatica: volver, motivo, detalle, metaSedeMes });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const { error: errorRpc } = await firmar(
      createClient().rpc("fijar_meta_persona", {
        p_persona_id: persona.personaId,
        p_ubicacion_id: ubicacionId,
        p_mes: mes,
        // Volver a la automática es una meta nula: la función lo entiende así y anota «automática» como motivo.
        p_meta: v.meta as number,
        p_motivo: v.motivo ?? "automatica",
        p_detalle: v.detalle ?? undefined,
        p_meta_esperada: persona.metaMes ?? undefined,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      // Las reglas de esta función vienen en castellano de CAYLA con un `hint` que empieza por «meta_».
      setError(errorRpc.hint?.startsWith("meta_") ? errorRpc.message : traducirError(errorRpc, "cambiar la meta"));
      // Si cambió mientras se editaba, se recarga para ver la vigente.
      if (errorRpc.hint === "meta_cambio_mientras_editabas") router.refresh();
      return;
    }
    avisar.exito(volver ? "Volvió a la meta automática" : "Meta cambiada", { detalle: `${persona.nombre} · ${mesEtiqueta}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={`Meta de ${persona.nombre}`} subtitulo={`${mesEtiqueta} · ${ubicacionNombre}`} onClose={onClose} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <form onSubmit={guardar} className="mt-2 space-y-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-taupe">Automática, por sus horas</dt>
              <dd className="tabular-nums text-tinta">{persona.metaAutoMes !== null ? SOLES.format(persona.metaAutoMes) : "—"}</dd>
            </div>
            {ajustada && (
              <div className="flex justify-between gap-3">
                <dt className="text-taupe">Ajustada ahora</dt>
                <dd className="tabular-nums text-tinta">{SOLES.format(persona.metaAjustadaMes ?? 0)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-taupe">Meta de la tienda en el mes (el tope)</dt>
              <dd className="tabular-nums text-tinta">{metaSedeMes !== null ? SOLES.format(metaSedeMes) : "—"}</dd>
            </div>
          </dl>

          {volver ? (
            <p className="rounded-md bg-hueso p-3 text-sm text-tinta">
              Vuelve a <b>{persona.metaAutoMes !== null ? SOLES.format(persona.metaAutoMes) : "la automática"}</b>, la que sale de sus horas programadas. Queda anotado en el
              historial.
            </p>
          ) : (
            <>
              <CampoGuiado id="meta" guia={guia}>
                <CampoMonto
                  etiqueta={guia.etiqueta("meta", `Meta de ${mesEtiqueta}`)}
                  inputMode="decimal"
                  autoComplete="off"
                  value={metaTexto}
                  onChange={(e) => {
                    setMetaTexto(e.target.value);
                    setError(null);
                  }}
                  disabled={enviando}
                  pie="La meta de cada día se recalcula sola, en la misma proporción."
                />
              </CampoGuiado>
              <CampoGuiado id="motivo" guia={guia}>
                <CampoSelect<MotivoMeta>
                  etiqueta={guia.etiqueta("motivo", "Motivo del cambio")}
                  marcador="Elige un motivo…"
                  valor={(motivo || "") as MotivoMeta}
                  onValor={(v) => {
                    setMotivo(v);
                    setError(null);
                  }}
                  opciones={MOTIVOS_META.map((m) => ({ valor: m.valor, texto: m.etiqueta }))}
                  deshabilitado={enviando}
                />
              </CampoGuiado>
              {motivo === "otro" && (
                <CampoGuiado id="detalle" guia={guia}>
                  <CampoTexto
                    etiqueta={guia.etiqueta("detalle", "¿Cuál?")}
                    value={detalle}
                    onChange={(e) => {
                      setDetalle(e.target.value);
                      setError(null);
                    }}
                    maxLength={LARGO_DETALLE_META}
                    placeholder="En una línea" // sugerir-fijo: pide el formato del detalle (una línea), no un ejemplo que dependa del motivo elegido
                    disabled={enviando}
                  />
                </CampoGuiado>
              )}
            </>
          )}

          {ajustada && (
            <button
              type="button"
              onClick={() => {
                setVolver((v) => !v);
                setError(null);
              }}
              className="label-cayla text-[11px] text-tinta underline underline-offset-2 hover:no-underline"
              disabled={enviando}
            >
              {volver ? "Prefiero poner una cifra" : "Volver a la meta automática"}
            </button>
          )}

          <div className="min-h-[1rem] text-xs text-rojo" role="alert">
            {error}
          </div>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />

          <div className="flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} className="flex-1" disabled={enviando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={enviando} disabled={!responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined} className={`flex-1 ${guia.claseConfirmar}`}>
              Guardar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
