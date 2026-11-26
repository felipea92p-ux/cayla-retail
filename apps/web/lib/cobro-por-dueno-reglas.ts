// Qué número darle a quien paga con Yape o Plin en una sede con más de una empresa. Lógica pura; decisión de Felipe, 2026-11-09, y para
// cualquier empresa aliada desde el 2026-11-21 (ADR-0683).
//
// LA REGLA. Lo de una aliada se paga al número de su dueña (lo de CLAURE, al de Claudia): esa plata es de ella y no pasa por CAYLA. Lo de CAYLA va por el QR de la máquina o,
// si no, al número de CAYLA. Un ticket con prendas de las dos marcas se paga en dos partes, cada una a su número.
//
// POR QUÉ LO DICE LA PANTALLA. De 13 cobros de CAYLA anotados como «Yape» en Lima, 11 habían entrado por el QR, y uno se le pagó al número de
// Claudia. La colaboradora no tenía dónde ver a qué número mandar a la clienta.
//
// EL TOPE DE ESTA PIEZA. Dice qué número dar y propone a qué cuenta va cada pago (abajo); quien sella la cuenta es la base, que solo acepta
// una cuenta de una aliada de esa tienda. Sin reparto (una sede con una sola
// empresa, o la base no respondió) no dice nada, y la hoja de cobro queda igual que siempre.

import type { MetodoPagoVenta } from "@cayla-retail/shared";
import type { UnidadesDeDueno } from "./dueno-reglas";
import { quienDe } from "./empresas-aliadas-reglas";

/** La clave de la casa en `retail.empresas`: lo que no es de ella es de una empresa aliada (ADR-0683). */
const CLAVE_CASA = "cayla";

const soles = (n: number) => `S/${n.toFixed(2)}`;

type LineaConValor = { cantidad: number; precioFinalUnitario: number };

/** Lo que la hoja de cobro le dice a la colaboradora. */
export type NumeroQueDar = { titulo: string; detalle: string };

/** De qué empresa aliada es una prenda del ticket (`null` = de CAYLA). `empresaId` nulo: se sabe por su insignia, no por el reparto. */
export type AliadaDeLinea = { empresaId: string | null; clave: string; nombre: string } | null;

/**
 * ¿De qué empresa aliada es esta prenda del ticket? (ADR-0683: cualquiera, no solo CLAURE.) En este orden: la empresa que la colaboradora eligió para
 * esa prenda; la única con unidades disponibles en la sede; y, si el reparto no sabe, la insignia de la prenda (`empresa`, que solo tienen las de otra marca).
 */
export function aliadaDeLaLinea(
  varianteId: string,
  insignia: string | null | undefined,
  duenosPorVariante: Readonly<Record<string, readonly UnidadesDeDueno[]>>,
  elegido: Readonly<Record<string, string>>,
): AliadaDeLinea {
  const duenos = duenosPorVariante[varianteId] ?? [];
  const deUno = (d: UnidadesDeDueno): AliadaDeLinea => (d.clave === CLAVE_CASA ? null : { empresaId: d.empresaId, clave: d.clave, nombre: d.nombre });
  const porEleccion = duenos.find((d) => d.empresaId === elegido[varianteId]);
  if (porEleccion) return deUno(porEleccion);
  const conUnidades = duenos.filter((d) => d.cantidad - d.cantidadApartada > 0);
  if (conUnidades.length === 1) return deUno(conUnidades[0]!);
  return insignia != null ? { empresaId: null, clave: "", nombre: insignia } : null;
}

/** Cuánto vale lo de CAYLA y lo de cada aliada en el ticket, ya con descuentos y cupón, en céntimos exactos. */
export type RepartoPorDueno = { cayla: number; aliadas: { empresaId: string | null; clave: string; nombre: string; monto: number }[] };
export function repartoPorDueno<L extends LineaConValor>(lineas: readonly L[], aliadaDe: (linea: L) => AliadaDeLinea): RepartoPorDueno {
  let cayla = 0;
  const aliadas = new Map<string, { empresaId: string | null; clave: string; nombre: string; centimos: number }>();
  for (const l of lineas) {
    const valor = Math.max(0, Math.trunc(l.cantidad)) * Math.round(l.precioFinalUnitario * 100);
    const a = aliadaDe(l);
    if (!a) {
      cayla += valor;
      continue;
    }
    const llave = a.empresaId ?? `insignia:${a.nombre}`;
    const previa = aliadas.get(llave) ?? { ...a, centimos: 0 };
    previa.centimos += valor;
    aliadas.set(llave, previa);
  }
  return { cayla: cayla / 100, aliadas: [...aliadas.values()].map(({ centimos, ...a }) => ({ ...a, monto: centimos / 100 })) };
}



const esCelular = (m: MetodoPagoVenta) => m === "yape" || m === "plin";

/** El nombre de la dueña que se le dice a la colaboradora: Claudia para CLAURE; para otra aliada, su nombre (ADR-0683). */
const duenaDe = (a: { clave: string; nombre: string }) => quienDe(a).duena;

/**
 * Lo que se le dice a la colaboradora, o `null` si no hay nada que decir. Un ticket de una sola empresa habla cuando se elige Yape o Plin.
 * Uno de varias habla desde antes de elegir, porque cambia cómo se cobra, y se calla si ya se cobra todo por otro medio.
 */
export function numeroQueDar(reparto: RepartoPorDueno | null, medios: readonly MetodoPagoVenta[]): NumeroQueDar | null {
  if (!reparto) return null;
  const aliadas = reparto.aliadas.filter((a) => a.monto > 0);
  const cayla = reparto.cayla;
  const porCelular = medios.some(esCelular);
  const partes = aliadas.length + (cayla > 0 ? 1 : 0);
  if (partes >= 2) {
    if (medios.length > 0 && !porCelular) return null;
    const deAliadas = aliadas.map((a) => `${a.nombre} ${soles(a.monto)} va al número de ${duenaDe(a)}.`);
    const deCayla = cayla > 0 ? [`CAYLA ${soles(cayla)}, al QR o a su número.`] : [];
    return { titulo: partes === 2 ? "Este ticket es de dos marcas" : `Este ticket es de ${partes} marcas`, detalle: [...deAliadas, ...deCayla].join(" ") };
  }
  if (!porCelular) return null;
  const sola = aliadas[0];
  if (sola) return { titulo: `Dale el número de ${duenaDe(sola)}`, detalle: sola.clave === "claure" ? "La plata le llega a ella." : "La plata no pasa por CAYLA." };
  if (cayla > 0) return { titulo: "Dale el número de CAYLA o el QR", detalle: "Si escaneó el QR de la máquina, marca QR." };
  return null;
}

// ---- A qué número va cada pago (ADR-0683, actividad 4) -------------------------------------------------------------------------------------------------
//
// LA REGLA (Felipe, 2026-11-21: «tener las dos opciones»). La hoja propone el número de la dueña según de quién es lo que se cobra, y la cajera lo cambia si la
// clienta pagó a otro. Lo que se elige viaja con la venta (`x-cuentas-pagos`): la base lo sella si sirve; si no, como siempre. Y lo que entró mal se sigue
// corrigiendo con «Corregir pagos».

/** Un número (o cuenta) de una aliada en esta tienda (`fn_cuentas_de_aliadas_en_sede`). */
export type NumeroDeAliada = { empresaId: string; clave: string; nombre: string; cuentaId: string; medio: "yape" | "plin" | "transferencia"; numero: string | null };

export function leerNumerosDeAliadas(filas: readonly Record<string, unknown>[]): NumeroDeAliada[] {
  return filas.flatMap((f) => {
    const medio = f.medio === "plin" || f.medio === "transferencia" ? f.medio : "yape";
    return typeof f.cuenta_id === "string" && typeof f.empresa_id === "string"
      ? [{ empresaId: f.empresa_id, clave: String(f.clave ?? ""), nombre: String(f.nombre ?? ""), cuentaId: f.cuenta_id, medio, numero: typeof f.numero === "string" ? f.numero : null }]
      : [];
  });
}

const METODOS_CON_NUMERO = ["yape", "plin", "transferencia"] as const;

/** La cuenta de cada aliada a la que puede ir un pago con este medio: el Plin, a su Plin o, si no tiene, a su Yape (suele ser el mismo celular). */
export function numerosPara(numeros: readonly NumeroDeAliada[], metodo: MetodoPagoVenta): NumeroDeAliada[] {
  if (!(METODOS_CON_NUMERO as readonly string[]).includes(metodo)) return [];
  const porEmpresa = new Map<string, NumeroDeAliada>();
  for (const n of numeros) {
    const sirve = n.medio === metodo || (metodo === "plin" && n.medio === "yape");
    if (!sirve) continue;
    const previa = porEmpresa.get(n.empresaId);
    if (!previa || (previa.medio !== metodo && n.medio === metodo)) porEmpresa.set(n.empresaId, n);
  }
  return [...porEmpresa.values()];
}

/**
 * El número que la hoja propone para un pago (`""` = el de CAYLA): todo de una aliada → el suyo; de CAYLA y de aliadas → el de la aliada cuya parte es justo ese
 * monto; si ninguna calza, el de CAYLA (la cajera lo cambia).
 */
export function numeroSugerido(r: RepartoPorDueno | null, numeros: readonly NumeroDeAliada[], metodo: MetodoPagoVenta, monto: number): string {
  if (!r) return "";
  const opciones = numerosPara(numeros, metodo);
  const conCuenta = r.aliadas.filter((a) => a.monto > 0 && a.empresaId && opciones.some((o) => o.empresaId === a.empresaId));
  if (conCuenta.length === 0) return "";
  if (r.cayla <= 0 && conCuenta.length === 1 && r.aliadas.filter((a) => a.monto > 0).length === 1) return opciones.find((o) => o.empresaId === conCuenta[0]!.empresaId)!.cuentaId;
  const calza = conCuenta.find((a) => Math.abs(a.monto - monto) < 0.01);
  return calza ? opciones.find((o) => o.empresaId === calza.empresaId)!.cuentaId : "";
}

/**
 * La cuenta de un pago: la que eligió la cajera (`""` = CAYLA) si todavía sirve para su medio; si no eligió, o cambió el medio después, la que la hoja propone.
 */
export function cuentaDelPago(p: { metodo: MetodoPagoVenta; monto: number; numeroAliada?: string }, r: RepartoPorDueno | null, numeros: readonly NumeroDeAliada[]): string {
  if (p.numeroAliada !== undefined && (p.numeroAliada === "" || numerosPara(numeros, p.metodo).some((o) => o.cuentaId === p.numeroAliada))) return p.numeroAliada;
  return numeroSugerido(r, numeros, p.metodo, p.monto);
}

/** Lo que viaja en `x-cuentas-pagos`: cada pago de Yape, Plin o transferencia que va al número de una aliada. Vacío = nada que pedir. */
export function pedidoDeCuentas<P extends { metodo: MetodoPagoVenta; monto: number }>(pagos: readonly P[], elegido: (pago: P) => string): { metodo: string; monto: number; cuenta: string }[] {
  return pagos.flatMap((p) => {
    if (!(METODOS_CON_NUMERO as readonly string[]).includes(p.metodo)) return [];
    const cuenta = elegido(p);
    return cuenta ? [{ metodo: p.metodo, monto: p.monto, cuenta }] : [];
  });
}

/** Pone el pedido en la llamada a `registrar_venta`, como el dueño de las líneas. Sin pedido, la llamada sale como antes. */
export const ENCABEZADO_CUENTAS_PAGOS = "x-cuentas-pagos";
export function conCuentasPagos<C extends { setHeader(nombre: string, valor: string): C }>(consulta: C, pedido: readonly { metodo: string; monto: number; cuenta: string }[]): C {
  return pedido.length ? consulta.setHeader(ENCABEZADO_CUENTAS_PAGOS, JSON.stringify(pedido)) : consulta;
}
