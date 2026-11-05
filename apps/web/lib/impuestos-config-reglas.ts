// Configuración ▸ Impuestos (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): primero lo que falta confirmar con el contador, después el límite del año
// con lo vendido, las tasas y, plegado, lo de arranque. Lógica pura.
//
// Contrato — PROMETE: decir qué sigue provisional, escribir cada valor como se lee y ubicar lo vendido contra el límite. ASUME: las filas y las cifras vienen de la base
// (`getParametrosTributarios`, `getPanelImpuestos`). NO decide qué es válido: eso sigue en `parsearParametro`, y lo que manda sobre el límite sigue en `avisoUmbral`.

import { fechaCorta, solesRedondo, textoMes } from "./gastos-reglas";
import {
  TEXTO_REGIMEN,
  vigenteEnAnio,
  type NombreEscalaRenta,
  type NombreParametro,
  type NombreRentaPrevia,
  type PanelImpuestos,
  type ParametroFila,
  type Regimen,
} from "./impuestos-reglas";

// Lo de antes del sistema para la renta del año (ADR-0598). El contador anota solo lo que tiene comprobante: su utilidad ya es la base de la renta.
export const RENTA_PREVIA: readonly { nombre: NombreRentaPrevia; nombreVisible: string; ayuda: string }[] = [
  { nombre: "renta_utilidad_previa", nombreVisible: "Utilidad del contador", ayuda: "Antes de impuestos; con signo menos si fue pérdida" },
  { nombre: "renta_sin_papel_previo", nombreVisible: "Compras sin factura", ayuda: "Nota de venta o nada; aproximado sirve" },
  { nombre: "renta_pagada_previa", nombreVisible: "Renta pagada a cuenta", ayuda: "La suma de tus PDT 621" },
];

const ES_RENTA_PREVIA = new Map<string, string>(RENTA_PREVIA.map((r) => [r.nombre, r.nombreVisible]));
const anioDe = (p: Pick<ParametroFila, "vigenteDesde">) => p.vigenteDesde.slice(0, 4);

/** Cómo se lee cada valor en un aviso o en la lista de lo que falta confirmar. */
export function valorLegible(nombre: Exclude<NombreParametro, "regimen" | NombreEscalaRenta>, valor: number): string {
  if (nombre === "igv" || nombre === "renta_pago_cuenta") return `${Number((valor * 100).toFixed(2))} %`;
  if (nombre === "uit") return solesRedondo(valor);
  if (nombre === "tope_planilla_movilidad") return `S/ ${valor.toFixed(2)} por persona y día`;
  if (nombre === "saldo_favor_igv") return `S/ ${valor.toFixed(2)} a favor`;
  if (nombre === "ventas_previas_erp") return `S/ ${valor.toFixed(2)} de ajuste`;
  if (ES_RENTA_PREVIA.has(nombre)) return `S/ ${valor.toFixed(2)}`;
  return `${valor} UIT`;
}

// El orden en que se le pregunta al contador: lo que define el año primero. Fuera de la lista quedan la escala de la renta (es la ley: no la confirma el contador) y el
// ajuste de ventas, que es opcional y nace en cero: un cero «por confirmar» no es algo que preguntar.
const ORDEN: readonly NombreParametro[] = [
  "regimen",
  "umbral_uit",
  "aviso_umbral_uit",
  "renta_pago_cuenta",
  "igv",
  "uit",
  "tope_planilla_movilidad",
  "saldo_favor_igv",
  "renta_utilidad_previa",
  "renta_sin_papel_previo",
  "renta_pagada_previa",
];

function queEs(p: ParametroFila): string {
  const a = anioDe(p);
  if (p.nombre === "regimen") return `Régimen ${a}`;
  if (p.nombre === "umbral_uit") return `Límite de ventas ${a}`;
  if (p.nombre === "aviso_umbral_uit") return `Aviso de ventas ${a}`;
  if (p.nombre === "renta_pago_cuenta") return `Pago a cuenta ${a}`;
  if (p.nombre === "igv") return `IGV desde el ${fechaCorta(p.vigenteDesde, true)}`;
  if (p.nombre === "uit") return `UIT ${a}`;
  if (p.nombre === "tope_planilla_movilidad") return `Tope de movilidad desde el ${fechaCorta(p.vigenteDesde, true)}`;
  if (p.nombre === "saldo_favor_igv") return `Saldo a favor al empezar ${textoMes(p.vigenteDesde.slice(0, 7))}`;
  return `${ES_RENTA_PREVIA.get(p.nombre) ?? p.nombre} ${a}`;
}

export type PendienteContador = { clave: string; que: string; parametro: ParametroFila };

/** El valor de una fila como se lee: el régimen por su nombre y lo demás con su unidad. */
export function valorDeFila(p: ParametroFila): string {
  if (p.nombre === "regimen") return TEXTO_REGIMEN[p.texto as Regimen] ?? p.texto ?? "";
  return valorLegible(p.nombre as Exclude<NombreParametro, "regimen" | NombreEscalaRenta>, p.valor ?? 0);
}

export const clavePendiente = (p: Pick<ParametroFila, "nombre" | "vigenteDesde">) => `${p.nombre}|${p.vigenteDesde}`;

/** Lo que sigue provisional: lo más nuevo y lo que define el año, primero. */
export function pendientesDelContador(parametros: readonly ParametroFila[]): PendienteContador[] {
  return parametros
    .filter((p) => p.provisional && ORDEN.includes(p.nombre))
    .sort((a, b) => anioDe(b).localeCompare(anioDe(a)) || ORDEN.indexOf(a.nombre) - ORDEN.indexOf(b.nombre))
    .map((p) => ({ clave: clavePendiente(p), que: queEs(p), parametro: p }));
}

export type LimiteDibujado = {
  vendido: number;
  quedan: number;
  umbralSoles: number;
  /** Lo vendido contra el límite, de 0 a 100 y más. */
  pct: number;
  /** Dónde cae la rayita del aviso, de 0 a 100; `null` sin aviso. */
  avisoPct: number | null;
  tono: "tinta" | "ambar" | "rojo";
};

/** Lo vendido contra el límite de ESE año. Solo el año que la base está midiendo: de otro año no hay cifra que dibujar. Sin límite o sin ventas, `null`: no se dibuja nada. */
export function limiteParaDibujar(u: PanelImpuestos["umbral"] | null | undefined, anio: number): LimiteDibujado | null {
  if (!u || u.anio !== anio || u.ventasAnio === null || u.umbralSoles === null || u.umbralSoles <= 0) return null;
  return {
    vendido: u.ventasAnio,
    quedan: Math.max(0, Math.round((u.umbralSoles - u.ventasAnio) * 100) / 100),
    umbralSoles: u.umbralSoles,
    pct: (u.ventasAnio / u.umbralSoles) * 100,
    avisoPct: u.avisoSoles === null ? null : Math.min(100, (u.avisoSoles / u.umbralSoles) * 100),
    tono: u.cruzado ? "rojo" : u.avisoAlcanzado ? "ambar" : "tinta",
  };
}

/** «Escala de 2026: 10 % hasta 15 UIT y 29.5 % sobre el resto; las boletas restan hasta 6 %.» — de los parámetros de la ley; null si falta alguno. */
export function escalaDeRenta(parametros: readonly ParametroFila[], anio: number): string | null {
  const v = (n: NombreEscalaRenta) => vigenteEnAnio(parametros, n, anio)?.valor ?? null;
  const [tramo, tasaTramo, tasaResto, boletas] = [v("renta_tramo_uit"), v("renta_tasa_tramo"), v("renta_tasa_resto"), v("boletas_tope_pct")];
  if (tramo === null || tasaTramo === null || tasaResto === null || boletas === null) return null;
  const pct = (x: number) => `${Number((x * 100).toFixed(2))} %`;
  return `Escala de ${anio}: ${pct(tasaTramo)} hasta ${tramo} UIT y ${pct(tasaResto)} sobre el resto; las boletas restan hasta ${pct(boletas)}.`;
}
