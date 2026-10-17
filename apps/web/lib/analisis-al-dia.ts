// Análisis v4 (ADR-0357, «Actualización 2026-10-17 — Cuán fresco y completo es lo que lees», B4): de cuándo son los datos que se están leyendo y
// lo que esa lectura todavía no dice de la tienda (su carga inicial, su piso sin cuadrar, la calidad de registro de OTRA tienda). Lógica pura, sin
// base ni React; probada en `analisis-al-dia.test.ts`.
//
// EL PROBLEMA. Quien compra deja la pantalla abierta toda la mañana y decide con cifras de las 9, sin saberlo; y una tienda que todavía carga su stock
// inicial (AQP hasta el 21-oct, LIM hasta el 31-oct) ve «Nunca salió al piso» llena de prendas que solo se cargaron y nadie «subió» al sistema. Ni
// una ni otra cosa estaba dicha en pantalla.
//
// LAS REGLAS (la decisión es de Felipe en el plan; cada constante se puede cambiar aquí):
//   · Se dice la hora de la lectura (hora de Lima) y, pasados `MINUTOS_PARA_ACTUALIZAR`, aparece «Actualizar».
//   · Mientras la tienda esté en carga inicial o su piso no esté cuadrado, «Nunca salió al piso» se PAUSA (la misma regla de `decidirTalla`, en
//     `piso-plan.ts`: la pausa cubre lo que el cuadre puede cambiar). No se inventa una lista: dice por qué no se puede saber todavía.
//   · La calidad de registro de las otras tiendas se dice SOLO donde una acción las usa («Mándalas» a esa tienda), nunca como anillos por tienda.

import { estadoDe, fechaCorta, type CargaInicialSede } from "./carga-inicial-reglas";
import { horaLima } from "./fechas-lima";
import { META_CON_PRENDA, ventasConPrendaDe100 } from "./analisis-aviso";
import type { PreparacionAnalisis } from "./analisis-tipos";

/** Pasado este tiempo desde la lectura, la pantalla ofrece «Actualizar». */
/** @internal el límite de 30 minutos, que la prueba cruza con `lecturaVieja`. */
export const MINUTOS_PARA_ACTUALIZAR = 30;

/** «Datos de las 09:20» (hora de Lima); null si la lectura no trae una hora que se entienda: no se inventa. */
export function textoDatosDe(leidoEn: string | null | undefined): string | null {
  const hora = horaLima(leidoEn);
  return hora ? `Datos de las ${hora}` : null;
}

/** ¿Pasaron más de `MINUTOS_PARA_ACTUALIZAR` desde la lectura? Sin hora que se entienda, no (no se ofrece un botón por un dato que no se tiene). */
export function lecturaVieja(leidoEn: string | null | undefined, ahora: number): boolean {
  const t = leidoEn ? Date.parse(leidoEn) : Number.NaN;
  return Number.isFinite(t) && ahora - t > MINUTOS_PARA_ACTUALIZAR * 60_000;
}

/** El aviso de la carga inicial: la tienda todavía carga su stock y las cifras de «lo que nunca salió» son de carga, no de venta. */
export const TITULO_CARGA_INICIAL = "Tu stock sigue en carga";

/**
 * La frase de la franja de carga inicial: «Tu stock sigue en carga hasta el 21-oct: no pidas por esta lista.» Null si la sede no está en carga (la
 * fecha ya pasó) o no se sabe (sin dato, no se inventa un aviso). La fecha es el ÚLTIMO día abierto (`estadoCargaInicial`).
 */
export function avisoFranjaCarga(c: CargaInicialSede | null): string | null {
  const e = estadoDe(c);
  if (!e || e.tipo === "cerrada") return null;
  if (e.tipo === "sin_fecha") return "Tu stock sigue en carga, todavía sin fecha de cierre: lo que ves en «Nunca salió al piso» todavía no es de ventas.";
  return `Tu stock sigue en carga hasta el ${fechaCorta(e.hasta)}: lo que ves en «Nunca salió al piso» todavía no es de ventas.`;
}

/** Por qué «Nunca salió al piso» espera: la carga inicial de la tienda sigue abierta, o su piso todavía no se cuadró. Null: se puede saber. */
export type PausaPiso = "carga" | "sin_cuadre";

/**
 * ¿«Nunca salió al piso» se pausa? Con la carga abierta, todo lo guardado nació de la carga y no de una venta; con el piso sin cuadrar, no se sabe qué
 * cuelga de verdad (la regla de `decidirTalla`, `piso-plan.ts`). `pisoCuadrado`: lo que dice la condición «Piso cuadrado» del motor; `null` = no se
 * sabe y NO se pausa por eso (el aviso de «Datos incompletos» ya lo dice). La carga manda sobre el cuadre: es la que tiene fecha.
 */
export function pausaDelPiso(carga: CargaInicialSede | null, pisoCuadrado: boolean | null): PausaPiso | null {
  if (avisoFranjaCarga(carga) !== null) return "carga";
  return pisoCuadrado === false ? "sin_cuadre" : null;
}

/** La condición «Piso cuadrado» de mi tienda según el motor; null si el motor no la trajo. */
export const pisoCuadradoDe = (p: Pick<PreparacionAnalisis, "condiciones"> | undefined): boolean | null =>
  p?.condiciones.find((c) => c.clave === "piso_cuadrado")?.cumple ?? null;

export const TEXTO_PAUSA_PISO: Record<PausaPiso, { titulo: string; linea: string; corto: string }> = {
  carga: { titulo: "Todavía no se puede saber", corto: "Todavía no se puede saber: tu stock sigue en carga.", linea: "Tu stock sigue en carga: lo guardado viene de la carga, no de una venta. Cuando cierre la carga, aquí verás lo que nunca salió al piso." },
  sin_cuadre: { titulo: "Todavía no se puede saber", corto: "Todavía no se puede saber: tu piso aún no se cuadró.", linea: "Tu piso aún no se cuadró: no se sabe qué cuelga de verdad. Cuádralo y esta lista se arma sola." },
};

/**
 * La calidad de registro de OTRA tienda, dicha solo donde una acción la usa («Mándalas» a esa tienda): si registra menos del 90 % de sus ventas con
 * su prenda, lo que «vendió» allá puede ser menos fiable. Null si registra bien o no se sabe (sin dato no se acusa a nadie). `ciudad`: cómo se
 * llama la tienda en pantalla.
 */
export function avisoCalidadDeDestino(p: PreparacionAnalisis | undefined, ciudad: string): string | null {
  const de100 = ventasConPrendaDe100(p);
  if (de100 === null || de100 >= META_CON_PRENDA) return null;
  return `${ciudad} registra pocas ventas con su prenda (${de100} de cada 100): cuenta con eso.`;
}

/** La pausa de «Nunca salió al piso» de la tienda de estos datos: UNA sola cuenta para la pestaña, Hoy, «No se vende», la ficha y el número. */
export const pausaDelPisoDe = (d: { cargaInicial: CargaInicialSede | null; preparacion: readonly PreparacionAnalisis[]; sede: { id: string } }): PausaPiso | null =>
  pausaDelPiso(d.cargaInicial, pisoCuadradoDe(d.preparacion.find((p) => p.ubicacionId === d.sede.id)));
