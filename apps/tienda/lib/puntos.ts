import { z } from "zod";
import { fechaDicha, montoDicho } from "./club";
import { soles, type Dia } from "./cuentas";

// Los puntos del Club en la tienda online (programa de puntos, actividad 6): lo que «Mi perfil» dice de los puntos de ESA persona —cuántos
// tiene y cuánto valen, cómo los gana, sus cupones vivos y su historial— y el canje de puntos por un cupón. Lógica pura, sin red: la
// usan la página, el botón de canjear y sus pruebas.
//
// Quien decide de verdad es la base (`retail.tienda_mis_puntos` para leer, `tienda_canjear_puntos` para canjear): el saldo, lo que vale
// cada 100 puntos y el mínimo de canje salen de la configuración vigente que también cobra la caja. Aquí solo se ponen en palabras, y
// lo que se ofrece (de a 100, desde el mínimo, hasta el saldo) es lo que la base aceptaría: la base vuelve a comprobarlo al canjear.

/* ------------------------------------------------------------------ Lo que devuelve tienda_mis_puntos */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const numero = z.coerce.number().finite();

const esquemaConfig = z.object({
  puntos_por_sol: numero.positive(),
  soles_por_100: numero.positive(),
  canje_minimo: numero.int().positive(),
  compra_minima_x: numero.positive(),
  vigencia_dias: numero.int().positive(),
  regalo_cumple: numero.int().nonnegative(),
});

const esquemaCupon = z.object({
  codigo: z.string().regex(/^CAY-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
  puntos: numero.int().positive(),
  valor: numero.positive(),
  compra_minima: numero.positive(),
  vence_el: fecha,
});

const esquemaMovimiento = z.object({
  tipo: z.enum(["compra", "cumple", "canje", "devuelve", "revierte", "pierde", "ajuste"]),
  puntos: numero.int(),
  dia: fecha,
  codigo: z.string().nullable(),
});

const esquemaMisPuntos = esquemaConfig.extend({
  miembro: z.boolean(),
  saldo: numero.int().nonnegative().optional(),
  valor_saldo: numero.nonnegative().optional(),
  cumple_dia: z.number().int().nullable().optional(),
  cumple_mes: z.number().int().min(1).max(12).nullable().optional(),
  regalo_disponible: z.boolean().optional(),
  pierde_el: fecha.nullable().optional(),
  cupones: z.array(z.unknown()).optional(),
  movimientos: z.array(z.unknown()).optional(),
});

export type ConfigPuntos = {
  puntosPorSol: number;
  solesPor100: number;
  canjeMinimo: number;
  compraMinimaX: number;
  vigenciaDias: number;
  regaloCumple: number;
};

export type CuponWeb = { codigo: string; puntos: number; valor: number; compraMinima: number; venceEl: string };
export type MovimientoDePuntos = { tipo: z.infer<typeof esquemaMovimiento>["tipo"]; puntos: number; dia: string; codigo: string | null };

export type MisPuntos = {
  config: ConfigPuntos;
  /** Tiene su ficha activa del Club: sin ella solo se ve la configuración. */
  miembro: boolean;
  saldo: number;
  valorSaldo: number;
  /** Es su mes y todavía no recibió su regalo de cumpleaños de este año. */
  regaloDisponible: boolean;
  /** Su cumpleaños (día y mes), si lo dio. */
  cumple: { dia: number; mes: number } | null;
  /** El último día en que se guardan sus datos y sus puntos (3 años desde su última compra, Términos 5.7), o null si la base no lo dijo. */
  pierdeEl: string | null;
  cupones: CuponWeb[];
  movimientos: MovimientoDePuntos[];
};

/** La configuración vigente que devuelve `tienda_puntos_config` (portada, Términos). null si no tiene la forma: se dice sin cifras. */
export function leerConfigDePuntos(dato: unknown): ConfigPuntos | null {
  const r = esquemaConfig.safeParse(dato);
  if (!r.success) return null;
  const d = r.data;
  return {
    puntosPorSol: d.puntos_por_sol,
    solesPor100: d.soles_por_100,
    canjeMinimo: d.canje_minimo,
    compraMinimaX: d.compra_minima_x,
    vigenciaDias: d.vigencia_dias,
    regaloCumple: d.regalo_cumple,
  };
}

/** La respuesta de `tienda_mis_puntos`. null si no tiene la forma (no se muestra a medias); un cupón o un movimiento raro se deja fuera solo. */
export function leerMisPuntos(dato: unknown): MisPuntos | null {
  const r = esquemaMisPuntos.safeParse(dato);
  if (!r.success) return null;
  const d = r.data;
  return {
    config: {
      puntosPorSol: d.puntos_por_sol,
      solesPor100: d.soles_por_100,
      canjeMinimo: d.canje_minimo,
      compraMinimaX: d.compra_minima_x,
      vigenciaDias: d.vigencia_dias,
      regaloCumple: d.regalo_cumple,
    },
    miembro: d.miembro,
    saldo: d.saldo ?? 0,
    valorSaldo: d.valor_saldo ?? 0,
    regaloDisponible: d.regalo_disponible === true,
    cumple: d.cumple_dia && d.cumple_mes ? { dia: d.cumple_dia, mes: d.cumple_mes } : null,
    pierdeEl: d.pierde_el ? d.pierde_el.slice(0, 10) : null,
    cupones: (d.cupones ?? []).flatMap((c) => {
      const x = esquemaCupon.safeParse(c);
      return x.success ? [{ codigo: x.data.codigo, puntos: x.data.puntos, valor: x.data.valor, compraMinima: x.data.compra_minima, venceEl: x.data.vence_el }] : [];
    }),
    movimientos: (d.movimientos ?? []).flatMap((m) => {
      const x = esquemaMovimiento.safeParse(m);
      return x.success ? [x.data] : [];
    }),
  };
}

/* ------------------------------------------------------------------ Cómo se dicen */

/** «1,240 puntos», «1 punto». */
export const puntosDichos = (n: number) => `${Math.abs(n).toLocaleString("es-PE")} ${Math.abs(n) === 1 ? "punto" : "puntos"}`;

/** Cuánto valen estos puntos: solo cuentan los cientos completos (100 puntos = `solesPor100`), igual que la base. */
export const valorDePuntos = (puntos: number, cfg: Pick<ConfigPuntos, "solesPor100">) => Math.round(Math.floor(puntos / 100) * cfg.solesPor100 * 100) / 100;

/** «Ganas 1 punto por cada S/ 1 que pagas · 100 puntos valen S/ 5» (la regla, con los números de hoy). */
export function reglaDeLosPuntos(cfg: ConfigPuntos): string {
  const por = cfg.puntosPorSol;
  const porSol = Number.isInteger(por) ? String(por) : String(por);
  const cada = `${por === 1 ? "1 punto" : `${porSol} puntos`} por cada S/ 1 que pagas`;
  return `Ganas ${cada}. 100 puntos valen ${soles(cfg.solesPor100)}.`;
}

/**
 * Lo que se dice de la conservación (Términos 5.7): sus puntos y sus datos se guardan mientras compre; con 3 años sin compras se eliminan.
 * Con la fecha que la base calculó (la misma del cron), para que lo que ve sea lo que corre. Sin fecha, la regla sola.
 */
export function conservacionDicha(pierdeEl: string | null, hoy: Dia): string {
  const base = "Tus puntos y tus datos se guardan mientras compres: si pasan 3 años sin compras, se eliminan.";
  return pierdeEl ? `${base} Tu fecha: ${fechaDicha(pierdeEl, hoy)}. Cada compra la corre 3 años más.` : base;
}

/** Hoy y la fecha de un cupón: cuántos días le quedan (0 = vence hoy). */
export function diasQueFaltan(venceEl: string, hoy: Dia): number {
  const [a, m, d] = venceEl.slice(0, 10).split("-").map(Number);
  const dias = (Date.UTC(a, m - 1, d) - Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia)) / 86_400_000;
  return Math.round(dias);
}

/** «Vence hoy», «Vence mañana», «Vence el 26 de octubre · te quedan 4 días». */
export function venceDicho(venceEl: string, hoy: Dia): string {
  const faltan = diasQueFaltan(venceEl, hoy);
  if (faltan <= 0) return "Vence hoy";
  if (faltan === 1) return "Vence mañana";
  return `Vence el ${fechaDicha(venceEl, hoy)} · te quedan ${faltan} días`;
}

/** El cupón en una línea: «S/ 10 · compra desde S/ 30». */
export const cuponDicho = (c: Pick<CuponWeb, "valor" | "compraMinima">) => `${montoDicho(c.valor)} · para una compra desde ${montoDicho(c.compraMinima)}`;

const ETIQUETA: Record<MovimientoDePuntos["tipo"], string> = {
  compra: "Compra",
  cumple: "Regalo de cumpleaños",
  canje: "Canje por cupón",
  devuelve: "Cupón sin usar: tus puntos volvieron",
  revierte: "Compra anulada o devuelta",
  pierde: "Puntos retirados por inactividad",
  ajuste: "Ajuste del Club",
};

/** La línea de un movimiento: «Compra · 12 de octubre», «Canje por cupón CAY-4K7P-9H2M · 3 de octubre». */
export function movimientoDicho(m: MovimientoDePuntos, hoy: Dia): { titulo: string; dia: string; puntos: string; sube: boolean } {
  const titulo = m.codigo && (m.tipo === "canje" || m.tipo === "devuelve") ? `${ETIQUETA[m.tipo]} ${m.codigo}` : ETIQUETA[m.tipo];
  return { titulo, dia: fechaDicha(m.dia, hoy), puntos: `${m.puntos > 0 ? "+" : "−"}${Math.abs(m.puntos).toLocaleString("es-PE")}`, sube: m.puntos > 0 };
}

/* ------------------------------------------------------------------ Canjear */

export type OpcionesDeCanje =
  | { tipo: "posible"; min: number; max: number; paso: number }
  /** No le alcanza: faltan `faltan` puntos para el cupón más chico. */
  | { tipo: "saldo_corto"; faltan: number };

/** De cuánto a cuánto se puede canjear: de a 100, desde el mínimo de la configuración, hasta lo que alcance su saldo. */
export function opcionesDeCanje(saldo: number, cfg: Pick<ConfigPuntos, "canjeMinimo">): OpcionesDeCanje {
  const paso = 100;
  const min = Math.max(paso, Math.ceil(cfg.canjeMinimo / paso) * paso);
  if (saldo < min) return { tipo: "saldo_corto", faltan: min - saldo };
  return { tipo: "posible", min, max: Math.floor(saldo / paso) * paso, paso };
}

export type CuponCanjeado = { codigo: string; puntos: number; valor: number; compraMinima: number; venceEl: string; saldo: number };

export type EstadoCanje =
  | { estado: "ok"; cupon: CuponCanjeado; repetido: boolean }
  | { estado: "saldo" | "minimo" | "multiplo" | "sin_sesion" | "sin_cuenta" | "reusado" | "sin_respuesta" };

const esquemaCanje = z.object({
  codigo: z.string().regex(/^CAY-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
  puntos: numero.int().positive(),
  valor: numero.positive(),
  compra_minima: numero.positive(),
  vence_el: fecha,
  repetido: z.boolean().optional(),
  saldo: numero.int().nonnegative(),
});

/** La respuesta de `tienda_canjear_puntos`: el cupón creado, o `sin_respuesta` si no tiene la forma (no se muestra un cupón a medias). */
export function leerRespuestaCanje(dato: unknown): EstadoCanje {
  const r = esquemaCanje.safeParse(dato);
  if (!r.success) return { estado: "sin_respuesta" };
  const d = r.data;
  return { estado: "ok", repetido: d.repetido === true, cupon: { codigo: d.codigo, puntos: d.puntos, valor: d.valor, compraMinima: d.compra_minima, venceEl: d.vence_el, saldo: d.saldo } };
}

/** El `hint` que lanza la base al rechazar el canje → el estado que la pantalla entiende. */
export function estadoDeRechazo(hint: string | null | undefined): Exclude<EstadoCanje["estado"], "ok"> {
  switch (hint) {
    case "puntos_insuficientes":
      return "saldo";
    case "canje_menor_al_minimo":
      return "minimo";
    case "canje_no_multiplo":
      return "multiplo";
    case "sin_cuenta":
      return "sin_cuenta";
    case "token_reusado":
      return "reusado";
    default:
      return "sin_respuesta";
  }
}

export const MENSAJES_PUNTOS: Record<Exclude<EstadoCanje["estado"], "ok">, string> = {
  saldo: "Ya no te alcanzan los puntos para ese cupón. Revisa tu saldo e inténtalo de nuevo.",
  minimo: "Todavía no llegas al mínimo para canjear.",
  multiplo: "Los puntos se canjean de 100 en 100.",
  sin_sesion: "Entra de nuevo a tu cuenta para canjear tus puntos.",
  sin_cuenta: "No encontramos tu cuenta. Entra de nuevo e inténtalo.",
  reusado: "Ese canje ya estaba en curso con otra cantidad. Recarga la página y revisa tus cupones.",
  sin_respuesta: "No pudimos canjear tus puntos ahora. Revisa tus cupones por si se alcanzó a crear, y vuelve a intentarlo en unos minutos.",
};

/* ------------------------------------------------------------------ Lo que dicen los cuadros de arriba de «Mi perfil» */

export type TonoPuntos = "verde" | "ambar" | "neutro";

/** «Mi Club» en una línea: sus puntos y, si tiene un cupón vivo o el regalo de su mes, eso primero. `null`: la base no contestó. */
export function resumenDePuntos(p: MisPuntos | null, esDelClub: boolean): { texto: string; tono: TonoPuntos } {
  if (!esDelClub) return { texto: "Únete: completa tus datos", tono: "ambar" };
  if (p === null) return { texto: "No se pudo cargar", tono: "neutro" };
  if (!p.miembro) return { texto: "Tu ficha no está activa", tono: "ambar" };
  if (p.cupones.length > 0) return { texto: p.cupones.length === 1 ? "1 cupón para usar" : `${p.cupones.length} cupones para usar`, tono: "verde" };
  if (p.regaloDisponible) return { texto: `+${p.config.regaloCumple} puntos de regalo`, tono: "verde" };
  return { texto: puntosDichos(p.saldo), tono: "neutro" };
}
