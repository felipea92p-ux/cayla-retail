// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A4): de lo que devuelve
// `retail.fn_analisis_pedido_en_camino` (un arreglo jsonb por tienda, migración 20261017043000) a lo ya pedido (`PartePedido[]`).
// Lógica pura; la prueba es `analisis-pedido-en-camino-lectura.test.ts`.
//
// No confía en la forma (principio 9): una parte con un origen que no se conoce, sin tipo o sin unidades se descarta (nunca se
// promete un pedido que nadie hizo); una fecha que no se entiende queda como «sin fecha»; un número de orden que no es un entero
// positivo se descarta. Dos partes del mismo origen, tipo, marca y fecha se suman en una (la base ya las junta por id; esto las junta
// por nombre, que es lo que la pantalla ve).

import type { OrigenPedido, PartePedido } from "./analisis-tipos";
import { fechaDeCalendario } from "./analisis-por-llegar-lectura";

/** La función de la base que lee lo ya pedido para UNA tienda. */
export const RPC_PEDIDO_EN_CAMINO = "fn_analisis_pedido_en_camino";

/** Los orígenes que se conocen, en el orden en que se muestran. */
const ORIGENES: readonly OrigenPedido[] = ["envio", "orden", "reposicion", "por_repartir", "taller"];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const esOrigen = (v: unknown): v is OrigenPedido => typeof v === "string" && (ORIGENES as readonly string[]).includes(v);

/** Unidades enteras; lo que no es número o no es positivo, 0 (y esa parte no se cuenta). */
function unidades(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Los números de orden: enteros positivos, sin repetir, de menor a mayor. */
function numerosDe(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const limpios = v.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0);
  return [...new Set(limpios)].sort((a, b) => a - b);
}

/** Primero lo que ya salió en un envío, luego las órdenes, y cada una por tipo, marca y fecha (lo que no tiene fecha, al final). */
function ordenPartes(a: PartePedido, b: PartePedido): number {
  const porOrigen = ORIGENES.indexOf(a.de) - ORIGENES.indexOf(b.de);
  if (porOrigen !== 0) return porOrigen;
  const porTipo = a.categoria.localeCompare(b.categoria, "es");
  if (porTipo !== 0) return porTipo;
  const porMarca = (a.marca ?? "").localeCompare(b.marca ?? "", "es");
  if (porMarca !== 0) return porMarca;
  if (a.fecha === b.fecha) return 0;
  if (a.fecha === null) return 1;
  if (b.fecha === null) return -1;
  return a.fecha.localeCompare(b.fecha);
}

/**
 * Lo ya pedido, en orden. null si la respuesta no es un arreglo: la base respondió NULL (la cuenta no puede analizar) o algo que no se
 * entiende. Quien llama lo dice como «no se pudo leer», nunca como «no hay nada pedido».
 */
export function leerPedidoEnCamino(v: unknown): PartePedido[] | null {
  if (!Array.isArray(v)) return null;
  const partes: PartePedido[] = [];
  for (const crudo of v) {
    if (!esObjeto(crudo)) continue;
    const categoria = texto(crudo.categoria);
    const cantidad = unidades(crudo.cantidad);
    if (!esOrigen(crudo.de) || !categoria || cantidad === 0) continue;
    const nueva: PartePedido = {
      de: crudo.de,
      categoria,
      prefijo: texto(crudo.prefijo),
      marca: texto(crudo.marca),
      cantidad,
      fecha: fechaDeCalendario(crudo.fecha),
      numeros: numerosDe(crudo.numeros),
    };
    const igual = partes.find((p) => p.de === nueva.de && p.categoria === nueva.categoria && p.marca === nueva.marca && p.fecha === nueva.fecha);
    if (igual) {
      igual.cantidad += nueva.cantidad;
      igual.numeros = [...new Set([...igual.numeros, ...nueva.numeros])].sort((a, b) => a - b);
    } else partes.push(nueva);
  }
  return partes.sort(ordenPartes);
}
