// Los puntos del Club en la ficha de un cliente (Clientes ▸ ficha ▸ pestaña «Club»): qué dice de sus puntos, de su regalo de
// cumpleaños y de sus cupones vivos. Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: decir lo mismo que la caja con las cifras de la configuración vigente que trae `resumen_puntos_caja` (cuánto gana por
//            sol, cuánto valen 100 puntos, desde cuántos se canjea, el regalo de cumpleaños). Ningún número va escrito aquí: sale
//            del resumen, o de `opcionesDeCanje` (la misma regla del canje que usa la caja).
//   ASUME:   el resumen es de una ficha que la base reconoce como miembro (`miembro`); sin eso, nada que decir (`null`).
//   NO HACE: no decide si le toca el regalo (lo decide la base: `regalo_disponible`); solo explica el porqué cuando no le toca.

import { opcionesDeCanje, solesDelCupon, type CuponVivo, type ResumenPuntos } from "./club-puntos-reglas";
import { MESES_DEL_ANIO } from "./club-cumple-reglas";

export type RegaloDeLaFicha = {
  /** «Cumple este mes» en negrita, o null si no es su mes. */
  titulo: string | null;
  texto: string;
  /** Le toca ahora (es su mes y todavía no lo recibió): se marca en verde. */
  leToca: boolean;
};

export type CuponDeLaFicha = { codigo: string; detalle: string; venceProximo: boolean };

export type PuntosDeLaFicha = {
  /** En negrita: «1,240 puntos». */
  destacado: string;
  /** Después del punto medio: «valen S/ 62». */
  resto: string;
  /** La línea chica de abajo: qué puede hacer con ellos. */
  bajada: string;
  /** null si el club no da regalo de cumpleaños (la configuración lo tiene en 0). */
  regalo: RegaloDeLaFicha | null;
  cupones: CuponDeLaFicha[];
  /** Lo que se lee cuando no tiene cupones, o la nota de que el cupón es al portador cuando sí tiene. */
  notaCupones: string;
};

/** Cuando no se pudieron leer: la ficha sigue igual y lo dice (principio 9). */
export const PUNTOS_SIN_LEER = "No se pudieron leer sus puntos ahora. Lo demás de la ficha está bien: ciérrala y ábrela en un rato.";

const numero = (n: number) => n.toLocaleString("es-PE");
const puntos = (n: number) => `${numero(n)} ${n === 1 ? "punto" : "puntos"}`;

/** «12 nov» (día y mes corto) de un `aaaa-mm-dd`. */
function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = MESES_DEL_ANIO[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} ${mes.slice(0, 3).toLowerCase()}` : iso;
}

/** El día siguiente de un `aaaa-mm-dd`. */
function manana(hoy: string): string {
  const d = new Date(`${hoy.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Hasta cuándo vale un cupón, contado desde hoy (en Lima). */
export function venceDelCupon(venceEl: string, hoy: string): { texto: string; proximo: boolean } {
  const dia = venceEl.slice(0, 10);
  if (dia === hoy.slice(0, 10)) return { texto: "vence hoy", proximo: true };
  if (dia === manana(hoy)) return { texto: "vence mañana", proximo: true };
  return { texto: `vale hasta el ${diaCorto(dia)}`, proximo: false };
}

function cuponDeLaFicha(c: CuponVivo, hoy: string): CuponDeLaFicha {
  const vence = venceDelCupon(c.venceEl, hoy);
  const minimo = c.compraMinima > 0 ? ` · en compras desde ${solesDelCupon(c.compraMinima)}` : "";
  return { codigo: c.codigo, detalle: `${solesDelCupon(c.valor)}${minimo} · ${vence.texto}`, venceProximo: vence.proximo };
}

/** Lo que dice del regalo de cumpleaños. `mesActual`: el mes de hoy en Lima (1–12). */
export function regaloDeLaFicha(r: ResumenPuntos, cumpleMes: number | null, mesActual: number): RegaloDeLaFicha | null {
  const n = r.config.regaloCumple;
  if (!(n > 0)) return null;
  const regalo = `${puntos(n)} de regalo`;
  // La base es quien decide que le toca (su mes y sin regalo este año): si lo dice, manda aunque el reloj del aparato difiera.
  if (r.regaloDisponible) return { titulo: "Cumple este mes", texto: `Con su próxima compra de este mes recibe ${regalo}.`, leToca: true };
  if (!cumpleMes) return { titulo: null, texto: `Sin cumpleaños en la ficha no recibe sus ${regalo}: agrégalo con «Editar».`, leToca: false };
  if (cumpleMes === mesActual) return { titulo: "Cumple este mes", texto: `Ya recibió sus ${regalo} de este año.`, leToca: false };
  const mes = MESES_DEL_ANIO[cumpleMes - 1]?.toLowerCase() ?? "su mes";
  return { titulo: null, texto: `En ${mes}, su mes de cumpleaños, recibe ${regalo} con su primera compra.`, leToca: false };
}

/** Qué hacer con lo que tiene: canjear ya, o cuánto le falta. */
function bajadaDelSaldo(r: ResumenPuntos): string {
  const gana = `Gana ${puntos(r.config.puntosPorSol)} por cada S/\u00a01 que paga.`;
  if (r.saldo <= 0) return `Todavía no tiene puntos. ${gana}`;
  // Sin el tope del ticket (no hay compra aquí): solo cuenta su saldo y el mínimo del canje.
  const canje = opcionesDeCanje(r.saldo, Number.POSITIVE_INFINITY, r.config);
  if (canje.tipo === "posible") return `Los puede canjear en caja por un cupón, de a ${numero(canje.paso)} puntos. ${gana}`;
  if (canje.tipo === "saldo_corto") return `Le faltan ${puntos(canje.faltan)} para poder canjear. ${gana}`;
  return gana;
}

/**
 * La parte de puntos de la ficha. `null` si la base no la reconoce como miembro (o el resumen no llegó): entonces no se dibuja
 * nada de puntos. `hoy`: `aaaa-mm-dd` de Lima (`hoyLima()`).
 */
export function puntosDeLaFicha(r: ResumenPuntos | null, ficha: { cumpleMes: number | null }, hoy: string): PuntosDeLaFicha | null {
  if (!r || !r.miembro) return null;
  const cupones = r.cupones.map((c) => cuponDeLaFicha(c, hoy));
  return {
    destacado: puntos(r.saldo),
    resto: `valen ${solesDelCupon(r.valorSaldo)}`,
    bajada: bajadaDelSaldo(r),
    regalo: regaloDeLaFicha(r, ficha.cumpleMes, Number(hoy.slice(5, 7))),
    cupones,
    notaCupones:
      cupones.length === 0
        ? "No tiene cupones por usar."
        : "Cada cupón vale una sola vez y lo puede usar quien tenga el código. Si no lo usa a tiempo, los puntos vuelven a su saldo.",
  };
}
