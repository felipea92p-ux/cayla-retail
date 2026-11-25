"use client";

import { createClient } from "@/lib/supabase/client";
import type { EstadoPedida } from "@/components/impresion/usePedidaALaCaja";

/**
 * Las boletas que ESTE equipo pidió a la cola de la caja (`retail.pedir_impresion`, migración 20261116204000) y cómo va cada una. Vive en
 * memoria, fuera de cualquier pantalla (2026-11-25): el aviso al cobrar se cierra con «Nueva venta» antes de que la caja la tome, y la
 * tuerca de Vender tiene que seguir sabiendo que hay una esperando («1 en cola»). Pedir dos veces la misma venta no la imprime dos veces: la
 * base devuelve la misma pedida, y aquí tampoco se vuelve a pedir mientras no haya fallado.
 *
 * Pregunta cada 3 s durante los primeros 3 minutos y después cada 20 s hasta 3 horas: el 2026-11-24 tres boletas de Trujillo esperaron
 * entre 40 y 53 minutos a que la Mac de la caja despertara. Todo va con `x-espera: no`: no tapa la pantalla con el loader (ADR-0149).
 * Al recargar la página se pierde la lista (no la boleta: esa sigue en la cola de la base y la caja la imprime igual).
 */

const RAPIDO_MS = 3000;
const LENTO_MS = 20_000;
const RAPIDO_HASTA_MS = 3 * 60 * 1000;
const HASTA_MS = 3 * 60 * 60 * 1000;

type Pedida = { estado: EstadoPedida; inicio: number; reloj?: number; vuelta: number };

const pedidas = new Map<string, Pedida>();
const oyentes = new Set<() => void>();
const PIDIENDO: EstadoPedida = { fase: "pidiendo" };

function avisarCambio() {
  for (const o of oyentes) o();
}

function fijar(ventaId: string, estado: EstadoPedida) {
  const p = pedidas.get(ventaId);
  if (!p) return;
  p.estado = estado;
  avisarCambio();
}

function arrancar(ventaId: string) {
  const anterior = pedidas.get(ventaId);
  if (anterior) window.clearTimeout(anterior.reloj);
  const p: Pedida = { estado: PIDIENDO, inicio: Date.now(), vuelta: (anterior?.vuelta ?? 0) + 1 };
  pedidas.set(ventaId, p);
  avisarCambio();
  const vuelta = p.vuelta;
  // Una respuesta que llega después de un «Reintentar» no pisa la pedida nueva.
  const vigente = () => pedidas.get(ventaId)?.vuelta === vuelta;
  const supabase = createClient();

  const preguntar = async (id: string) => {
    if (!vigente()) return;
    const { data } = await supabase.rpc("fn_impresion_estado" as never, { p_impresion_id: id } as never).setHeader("x-espera", "no");
    if (!vigente()) return;
    if (data === "impresa") {
      fijar(ventaId, { fase: "impresa", id });
      return;
    }
    const pasado = Date.now() - p.inicio;
    if (pasado < HASTA_MS) p.reloj = window.setTimeout(() => void preguntar(id), pasado < RAPIDO_HASTA_MS ? RAPIDO_MS : LENTO_MS);
  };

  void (async () => {
    const { data, error } = await supabase.rpc("pedir_impresion" as never, { p_venta_id: ventaId } as never).setHeader("x-espera", "no");
    if (!vigente()) return;
    if (error || typeof data !== "string") {
      fijar(ventaId, { fase: "error" });
      return;
    }
    fijar(ventaId, { fase: "en-cola", id: data });
    p.reloj = window.setTimeout(() => void preguntar(data), RAPIDO_MS);
  })();
}

/** Pide la boleta de esta venta a la caja, una sola vez (si ya se pidió y no falló, no hace nada). */
export function pedirALaCaja(ventaId: string): void {
  const p = pedidas.get(ventaId);
  if (p && p.estado.fase !== "error") return;
  arrancar(ventaId);
}

/** Vuelve a pedirla (después de un error, o porque quien mira lo pidió). */
export function reintentarALaCaja(ventaId: string): void {
  arrancar(ventaId);
}

export function estadoEnLaCaja(ventaId: string): EstadoPedida {
  return pedidas.get(ventaId)?.estado ?? PIDIENDO;
}

/** Cuántas boletas de este equipo esperan todavía a la caja (pedidas o en la cola, sin salir ni fallar). */
export function boletasEsperandoALaCaja(): number {
  let n = 0;
  for (const p of pedidas.values()) if (p.estado.fase === "pidiendo" || p.estado.fase === "en-cola") n++;
  return n;
}

export function suscribirALaCola(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => oyentes.delete(alCambiar);
}
