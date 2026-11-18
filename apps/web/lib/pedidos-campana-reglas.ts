// Compras ▸ Órdenes de compra ▸ «Pendientes de campaña» (ADR-0530, spike ⑦): los pedidos que el Plan de campaña mandó a Compras. Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: leer lo que manda `fn_pedidos_campana` y `fn_pedido_campana_lineas` sin confiar en su forma (lo que no se entiende se descarta o devuelve null, nunca revienta la pantalla); decir de un pedido
//            pendiente si la fecha en que se piensa pedir llegaría tarde para la campaña, o si el plazo ya pasó; contar cuántos esperan confirmación por campaña; y armar los argumentos de las tres acciones
//            (confirmar, cambiar la fecha, y rectificar —que es del Plan—).
//   ASUME: las fechas son `aaaa-mm-dd` en hora de Lima. «Hoy» lo trae la pantalla.
//   NO HACE: no valida lo que la base valida (quién puede, si el proveedor sigue activo, si la orden se puede crear): la base vuelve a comprobar todo y dice por qué no.

import { sumarDias } from "./fechas-lima";
import { DIAS_PARA_LLEGAR_DE_FABRICA } from "./plan-compra-plazo";
import type { Cuando, Elegido, EstadoDelPedido } from "./plan-compra-envio";

export const RPC_PEDIDOS_CAMPANA = "fn_pedidos_campana";
export const RPC_LINEAS_PEDIDO = "fn_pedido_campana_lineas";
export const RPC_CONFIRMAR_PEDIDO = "confirmar_pedido_campana";
export const RPC_CAMBIAR_FECHA_PEDIDO = "cambiar_fecha_pedido_campana";

export type PedidoDeCampana = {
  id: string;
  estado: EstadoDelPedido;
  cuando: Cuando;
  fechaPrevista: string | null;
  plan: { id: string; nombre: string; desde: string; hasta: string; diasParaLlegar: number | null };
  categoria: { id: string; nombre: string };
  proveedor: { id: string; nombre: string };
  unidades: number;
  modelos: number;
  /** Lo que cuesta cada prenda en el plan, tal como se envió. */
  costoUnitario: number;
  version: number;
  /** El paso 2 se guardó otra vez después de enviar este pedido. */
  desactualizado: boolean;
  /** Un modelo del pedido ya es de otro proveedor: confirmar se rechazaría. */
  cambioElProveedor: boolean;
  enviadoPor: string | null;
  enviadoEn: string | null;
  orden: { id: string; numero: number; texto: string | null; por: string | null; en: string | null } | null;
  rectificado: { por: string | null; en: string | null; motivo: string | null } | null;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const ESTADOS: readonly EstadoDelPedido[] = ["pendiente", "pedido", "rectificado"];

/** Lo que devuelve `fn_pedidos_campana`. null si no se entiende o la base no trae la marca `soportado` (la web se publicó antes que la migración). Un pedido que no se entiende se descarta. */
export function leerPedidosDeCampana(v: unknown): PedidoDeCampana[] | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  return lista(v.pedidos).flatMap((p): PedidoDeCampana[] => {
    const id = texto(p.id);
    const estado = ESTADOS.find((e) => e === p.estado);
    const cuando: Cuando | null = p.cuando === "ya" ? "ya" : p.cuando === "fecha" ? "fecha" : null;
    const plan = esObjeto(p.plan) ? p.plan : null;
    const categoria = esObjeto(p.categoria) ? p.categoria : null;
    const proveedor = esObjeto(p.proveedor) ? p.proveedor : null;
    const costo = numero(p.costo_unitario);
    if (!id || !estado || !cuando || !plan || !categoria || !proveedor || costo === null || !Number.isInteger(p.paso_2_version)) return [];
    const planId = texto(plan.id);
    const desde = texto(plan.desde);
    const hasta = texto(plan.hasta);
    const categoriaId = texto(categoria.id);
    const proveedorId = texto(proveedor.id);
    if (!planId || !desde || !hasta || !categoriaId || !proveedorId) return [];
    const o = esObjeto(p.orden) ? p.orden : null;
    const ordenId = o ? texto(o.id) : null;
    const r = esObjeto(p.rectificado) ? p.rectificado : null;
    return [
      {
        id,
        estado,
        cuando,
        fechaPrevista: texto(p.fecha_prevista),
        plan: { id: planId, nombre: texto(plan.nombre) ?? "Campaña", desde, hasta, diasParaLlegar: plan.dias_para_llegar == null ? null : entero(plan.dias_para_llegar) || null },
        categoria: { id: categoriaId, nombre: texto(categoria.nombre) ?? "Categoría" },
        proveedor: { id: proveedorId, nombre: texto(proveedor.nombre) ?? "Proveedor" },
        unidades: entero(p.unidades),
        modelos: entero(p.modelos),
        costoUnitario: costo,
        version: p.paso_2_version as number,
        desactualizado: p.desactualizado === true,
        cambioElProveedor: p.cambio_el_proveedor === true,
        enviadoPor: texto(p.enviado_por),
        enviadoEn: texto(p.enviado_en),
        orden: o && ordenId && Number.isInteger(o.numero) ? { id: ordenId, numero: o.numero as number, texto: texto(o.texto), por: texto(o.por), en: texto(o.en) } : null,
        rectificado: r ? { por: texto(r.por), en: texto(r.en), motivo: texto(r.motivo) } : null,
      },
    ];
  });
}

/** Una prenda de un pedido (modelo × color × talla × cuántas), tal como se envió. */
export type LineaDePedido = { modelo: string; marca: string | null; color: string; colorNombre: string; talla: string | null; n: number };

/** Lo que devuelve `fn_pedido_campana_lineas`. null si no se entiende, la base no trae `soportado` o el pedido no existe. */
export function leerLineasDePedido(v: unknown): LineaDePedido[] | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  return lista(v.lineas).flatMap((l): LineaDePedido[] => {
    const modelo = texto(l.modelo);
    const color = texto(l.color);
    const n = entero(l.n);
    return modelo && color && n > 0 ? [{ modelo, marca: texto(l.marca), color, colorNombre: texto(l.color_nombre) ?? color, talla: texto(l.talla), n }] : [];
  });
}

/** Las líneas agrupadas por modelo y, dentro de cada uno, por color con sus tallas y su total. El orden es el de la base (modelo, color, talla). */
export type ModeloDePedido = { modelo: string; marca: string | null; total: number; colores: { color: string; colorNombre: string; total: number; tallas: { talla: string | null; n: number }[] }[] };
export function agruparLineas(lineas: readonly LineaDePedido[]): ModeloDePedido[] {
  const modelos: ModeloDePedido[] = [];
  for (const l of lineas) {
    let m = modelos.find((x) => x.modelo === l.modelo);
    if (!m) modelos.push((m = { modelo: l.modelo, marca: l.marca, total: 0, colores: [] }));
    let c = m.colores.find((x) => x.color === l.color);
    if (!c) m.colores.push((c = { color: l.color, colorNombre: l.colorNombre, total: 0, tallas: [] }));
    c.tallas.push({ talla: l.talla, n: l.n });
    c.total += l.n;
    m.total += l.n;
  }
  return modelos;
}

/** El último día para pedir y que llegue al inicio de la campaña: el inicio menos los días que tarda un pedido (el fijado de la campaña o, sin él, el supuesto de fábrica). */
export function limiteParaPedir(p: Pick<PedidoDeCampana, "plan">): string {
  return sumarDias(p.plan.desde, -(p.plan.diasParaLlegar ?? DIAS_PARA_LLEGAR_DE_FABRICA));
}

export type AvisoDePlazo = { tipo: "fecha-tarde" | "plazo-vencido"; texto: string };

/**
 * Lo que avisa un pedido PENDIENTE sobre el plazo, o null si nada:
 *   · la fecha en que se piensa pedir pasa del límite → «Llega tarde» (la mercadería llegaría con la campaña empezada);
 *   · el límite ya pasó (hoy es posterior) y la campaña no terminó → lo que se pida hoy llega después del inicio.
 * Un pedido que ya es orden o está rectificado no avisa: ya no hay nada que decidir.
 */
export function avisoDePlazo(p: PedidoDeCampana, hoy: string, fechaCorta: (iso: string) => string): AvisoDePlazo | null {
  if (p.estado !== "pendiente" || hoy > p.plan.hasta) return null;
  const limite = limiteParaPedir(p);
  if (p.cuando === "fecha" && p.fechaPrevista !== null && p.fechaPrevista > limite) {
    return { tipo: "fecha-tarde", texto: `Llega tarde: después del ${fechaCorta(limite)}` };
  }
  if (hoy > limite && hoy < p.plan.desde) {
    return { tipo: "plazo-vencido", texto: `El plazo para pedir era el ${fechaCorta(limite)}: lo que pidas hoy llega después del inicio` };
  }
  return null;
}

export type CuentaDePendientes = { total: number; porCampana: { planId: string; nombre: string; desde: string; n: number; limite: string }[] };

/** Cuántos pedidos esperan confirmación, en total y por campaña (la más próxima primero), con el último día para pedir de cada una. */
export function pendientesPorCampana(pedidos: readonly PedidoDeCampana[]): CuentaDePendientes {
  const grupos = new Map<string, CuentaDePendientes["porCampana"][number]>();
  for (const p of pedidos) {
    if (p.estado !== "pendiente") continue;
    const g = grupos.get(p.plan.id);
    if (g) g.n++;
    else grupos.set(p.plan.id, { planId: p.plan.id, nombre: p.plan.nombre, desde: p.plan.desde, n: 1, limite: limiteParaPedir(p) });
  }
  const porCampana = [...grupos.values()].sort((a, b) => a.desde.localeCompare(b.desde));
  return { total: porCampana.reduce((s, g) => s + g.n, 0), porCampana };
}

/** Lo que cuesta un pedido al costo del plan. */
export const alCostoDelPedido = (p: Pick<PedidoDeCampana, "unidades" | "costoUnitario">): number => Math.round(p.unidades * p.costoUnitario * 100) / 100;

export const argsConfirmar = (pedidoId: string) => ({ p_pedido_id: pedidoId });
export const argsCambiarFecha = (pedidoId: string, e: Elegido) => ({ p_pedido_id: pedidoId, p_cuando: e.cuando, p_fecha: e.cuando === "fecha" ? e.fecha : null });
