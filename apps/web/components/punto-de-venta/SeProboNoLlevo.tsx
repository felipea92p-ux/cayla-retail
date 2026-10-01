"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { traducirError } from "@/lib/error-escritura";
import { registrarPedidoNoAtendido } from "@/lib/pedidos-no-atendidos-acciones";
import {
  OPCIONES_RAZON,
  PREGUNTA_SE_PROBO,
  avisoAnotado,
  datosSeProbo,
  textoPrendaQuitada,
  type PrendaQuitada,
  type RazonSeProbo,
} from "@/lib/se-probo-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * «¿Se la probó y no la llevó?» (ADR-0288 D-6, CL-7; spike del club 2026-09-30, `quitadaHTML`): al quitar una prenda del
 * ticket, justo bajo la clienta, una pregunta opcional. Tocar una de las cuatro razones la anota en `pedidos_no_atendidos`
 * con `motivo = 'se_probo_no_llevo'` (con o sin clienta: sin ella sigue siendo demanda para Compras) y la pregunta se va;
 * «No anotar» la cierra sin guardar nada. Nunca frena la venta.
 *
 * Firma el responsable del combo, como «Anotar que no había» (`fn_actor_persona_id(true)`): sin él, las razones se apagan y
 * el combo sale aquí mismo (lo elegido vale también para la venta). Solo ante un rechazo se llama a `responsable.despues`:
 * con éxito vaciaría el combo y soltaría a quien atiende la venta en curso.
 */
export function SeProboNoLlevo({
  prenda,
  ubicacionId,
  clientaId,
  responsable,
  onCerrar,
}: {
  prenda: PrendaQuitada;
  ubicacionId: string;
  clientaId: string | null;
  responsable: ControlResponsable;
  onCerrar: () => void;
}) {
  const [guardando, setGuardando] = useState<RazonSeProbo | null>(null);

  async function anotar(razon: RazonSeProbo) {
    if (!responsable.listo || guardando) return;
    setGuardando(razon);
    const { error } = await registrarPedidoNoAtendido(datosSeProbo(prenda, razon, ubicacionId, clientaId), responsable.firma());
    if (error) {
      responsable.despues(error);
      setGuardando(null);
      return void avisar.error(traducirError(error, "anotar que se la probó"));
    }
    const aviso = avisoAnotado("se_probo_no_llevo", prenda.referencia, prenda.talla);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onCerrar();
  }

  return (
    <div className="anim-revelar px-5 pt-3">
      <div role="group" aria-label={PREGUNTA_SE_PROBO} className="rounded-xl bg-hueso px-3 py-2.5 text-xs text-tinta/75">
        <div className="flex items-start gap-2.5">
          <Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-tinta">{PREGUNTA_SE_PROBO}</b> {textoPrendaQuitada(prenda)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {OPCIONES_RAZON.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => anotar(o.valor)}
              disabled={!responsable.listo || guardando !== null}
              className="h-8 rounded-md border border-sand bg-crema px-2 text-xs font-semibold text-tinta transition-colors hover:border-taupe disabled:opacity-45"
            >
              {guardando === o.valor ? "Anotando…" : o.texto}
            </button>
          ))}
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando !== null}
            className="label-cayla ml-1 text-[10.5px] text-tinta/70 underline underline-offset-2 hover:text-rojo disabled:opacity-45"
          >
            No anotar
          </button>
        </div>
        {!responsable.listo && <ComboResponsable control={responsable} className="mt-2" />}
      </div>
    </div>
  );
}
