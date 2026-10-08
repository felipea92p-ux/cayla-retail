"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esRespuestaIncierta } from "@/lib/error-escritura";
import { finDePlazo, type AccionDecision } from "@/lib/frescura-decisiones-reglas";
import { avisoDeExito, textoErrorDecision } from "@/lib/frescura-decisiones-pantalla";
import type { FrescuraPrenda } from "@/lib/frescura-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";

// EL camino para anotar lo decidido de una prenda (ADR-0208, paso 4b; act. 2026-10-07): lo usan la hoja («Ya decidí») y el
// botón de la fila («La cambié de lugar», a un toque). Una sola pieza para una sola función (ADR-0358): la marca de reintento,
// el tope de espera, la firma del responsable, el aviso con «Deshacer» (10 s) y el refresco viven aquí y en ningún otro lado.
//
// Lo que guarda es solo el HECHO (`retail.anotar_decision_frescura`, de solo agregar). Un mal toque se corrige sin borrar nada:
// «Deshacer» agrega una anulación. Nada de esto le pide una explicación a quien se equivocó.

/** Sin respuesta en 20 s se corta y se trata como respuesta incierta: nunca queda la pantalla bloqueada (como «Ajustar inventario»). */
export const TOPE_ESPERA_MS = 20_000;
/** El «Deshacer» del aviso dura 10 segundos (Norman: el error es del diseño, no de la persona). */
export const DURACION_DESHACER_MS = 10_000;

export type AnotacionPedida = {
  prenda: FrescuraPrenda;
  /** La última línea de la libreta que vio la pantalla (null si estaba vacía): la base la compara al guardar. */
  anteriorId: string | null;
  accion: AccionDecision;
  plazoDias: number;
  transferenciaId: string | null;
  nota: string | null;
  /** El botón que se tocó («Anotar» en la hoja, «La cambié de lugar» en la fila): el error dice qué volver a tocar. */
  verbo?: string;
};

/** `clave`: la prenda que se estaba anotando, para pintar el error junto a su botón y no en otra parte de la pantalla. */
export type ErrorAnotar = { texto: string; conVer: boolean; clave: string };

export type Anotador = {
  responsable: ControlResponsable;
  /** Qué prenda se está anotando ahora (su `clave`), o null. */
  enviando: string | null;
  error: ErrorAnotar | null;
  limpiarError: () => void;
  /** Anota; true si quedó guardado (el aviso con «Deshacer» ya salió y la pantalla se refrescó). */
  anotar: (pedida: AnotacionPedida) => Promise<boolean>;
};

export const nombreDePrenda = (p: Pick<FrescuraPrenda, "productoNombre" | "colorNombre">) => `${p.productoNombre}${p.colorNombre ? ` ${p.colorNombre}` : ""}`;

export function useAnotarDecision(sede: { id: string; nombre: string }): Anotador {
  const router = useRouter();
  const responsable = useResponsable();
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<ErrorAnotar | null>(null);
  // La marca de cada toque, por prenda: el mismo toque enviado dos veces (un corte de red y un reintento) devuelve lo ya
  // guardado. Se renueva solo cuando la base dijo que NO (nada se guardó); tras una respuesta incierta se conserva.
  const marcas = useRef(new Map<string, string>());
  const enVuelo = useRef(false);

  async function anotar(pedida: AnotacionPedida): Promise<boolean> {
    if (enVuelo.current || !responsable.listo) return false;
    const { prenda } = pedida;
    const marca = marcas.current.get(prenda.clave) ?? crypto.randomUUID();
    marcas.current.set(prenda.clave, marca);
    const firma = responsable.firma();
    enVuelo.current = true;
    setEnviando(prenda.clave);
    setError(null);
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { data, error: errorRpc } = await firmar(
      createClient()
        .rpc("anotar_decision_frescura", {
          p_token: marca,
          p_ubicacion_id: sede.id,
          p_producto_id: prenda.productoId,
          p_color_codigo: prenda.colorCodigo,
          p_anterior_id: pedida.anteriorId,
          p_accion: pedida.accion,
          p_plazo_dias: pedida.plazoDias,
          p_transferencia_id: pedida.transferenciaId,
          p_nota: pedida.nota,
        })
        .abortSignal(control.signal),
      firma,
    );
    window.clearTimeout(tope);
    setEnviando(null);
    enVuelo.current = false;
    responsable.despues(errorRpc);
    if (errorRpc) {
      const t = textoErrorDecision(errorRpc, sede.nombre, pedida.verbo);
      setError({ texto: t.texto, conVer: t.conVer, clave: prenda.clave });
      // La base dijo que no: nada se guardó, la marca queda libre. Si fue una respuesta incierta se conserva.
      if (t.nuevaMarca && !esRespuestaIncierta(errorRpc)) marcas.current.delete(prenda.clave);
      // Con la red caída no se refresca: un refresh sin red borra el mensaje honesto.
      if (!esFalloDeRed(errorRpc) && errorRpc.hint === "version_cambiada") router.refresh();
      return false;
    }
    marcas.current.delete(prenda.clave);
    const r = (data ?? {}) as { id?: string; creado_en?: string };
    const vence = finDePlazo(r.creado_en ?? new Date().toISOString(), pedida.plazoDias);
    const aviso = avisoDeExito(pedida.accion, nombreDePrenda(prenda), vence);
    avisar.exito(aviso.titulo, {
      detalle: aviso.detalle,
      duracion: DURACION_DESHACER_MS,
      accion: r.id ? { texto: "Deshacer", onClick: () => void deshacerDecision(r.id!, firma, sede.nombre, router.refresh) } : undefined,
    });
    router.refresh();
    return true;
  }

  return { responsable, enviando, error, limpiarError: () => setError(null), anotar };
}

/** «Deshacer» del aviso: agrega una anulación sin nota. Después de esto no hay otro deshacer: quitar lo anotado no se quita. */
export async function deshacerDecision(id: string, firma: Firma | null, sede: string, refrescar: () => void) {
  const { error } = await firmar(createClient().rpc("anular_decision_frescura", { p_token: crypto.randomUUID(), p_decision_id: id, p_nota: null }), firma);
  if (error) avisar.error(textoErrorDecision(error, sede).texto);
  else avisar.exito("Quitado: la prenda vuelve a «Por decidir» si sigue quieta");
  refrescar();
}
