/**
 * Las reglas de la hoja «Configurar el piso» (Gestión ▸ Plan del piso, ADR-0329): lo que una persona teclea para actualizar la
 * capacidad del piso de su tienda contra la realidad, antes de mandarlo a `fijar_capacidad_piso`.
 *
 * PROMETE: leer lo tecleado como la base lo va a leer, o decir en el campo qué está mal, con las MISMAS reglas que la función
 * (m² de 0 a 2000, prendas por m² de 0 a 150, que quepa al menos 1 prenda, fecha de 2026 en adelante y no futura). Y calcular la
 * capacidad resultante igual que la base (`floor(m² × densidad)`), sin los errores de redondeo de la coma flotante.
 * ASUME: la base sigue siendo la autoridad. Esto no reemplaza sus candados: solo evita el viaje para un error que ya se ve.
 * Una prueba cruza estos topes contra la migración, para que no se desfasen (`capacidad-piso-config.test.ts`).
 * NO HACE: dar por cuadrado el piso. La capacidad es cuánto cabe; «cuadrar» es contar lo que cuelga (cuadres_piso).
 */

import { esFechaQueExiste } from "./fechas-lima";
import { sinBlancosDeMiles } from "./numero-escrito";
import type { CapacidadPiso } from "./capacidad-piso";
import type { CampoDeGuia } from "./guia-campos";

/** Los topes de `fijar_capacidad_piso` y de los candados de `capacidad_piso` (migración 20261005103000). */
export const M2_MAXIMO = 2000;
export const DENSIDAD_MAXIMA = 150;
/** Antes de esta fecha un «conteo» no puede ser real: el sistema no existía. */
export const CONTEO_DESDE = "2026-01-01";

export type CampoDelPiso = "m2" | "densidad" | "contadaEl";

/** Lo que está en las cajas, tal cual lo tecleó la persona. `contadaEl` solo cuenta si `sinContar` es falso. */
export type BorradorDelPiso = { m2: string; densidad: string; contadaEl: string; sinContar: boolean };

export type LecturaDelPiso =
  | { ok: true; m2: number; densidad: number; capacidad: number; contadaEl: string | null }
  | { ok: false; problemas: Partial<Record<CampoDelPiso, string>> };

/**
 * Un decimal de a lo sumo 2 cifras, con coma o con punto («12,5», «12.50»). Más de 2 decimales se rechaza en vez de redondearse: la
 * base redondea a 2 y lo escrito en silencio distinto a lo que se ve es un dato malo que nadie nota. Un pegado de varias celdas
 * («20 30») tampoco entra (`sinBlancosDeMiles`).
 */
function leerDecimal(texto: string): number | null {
  const t = sinBlancosDeMiles(texto);
  if (t === null || !/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

/** `floor(m² × densidad)` como lo calcula la base (numeric exacto): en centésimas enteras, sin 0,1 × 3 = 0,30000000000000004. */
export function capacidadDe(m2: number, densidad: number): number {
  return Math.floor((Math.round(m2 * 100) * Math.round(densidad * 100)) / 10000);
}

/**
 * Lo tecleado, leído. Cada campo que está mal trae su propio mensaje (va bajo ese campo, no en un aviso de esquina). Una fecha vacía
 * con «Aún no lo conté» apagado es un problema del campo fecha; con «Aún no lo conté» prendido, la fecha no se pide (queda sin contar
 * y la capacidad provisional).
 */
export function leerDelPiso(b: BorradorDelPiso, hoy: string): LecturaDelPiso {
  const problemas: Partial<Record<CampoDelPiso, string>> = {};

  const m2 = leerDecimal(b.m2);
  if (b.m2.trim() === "") problemas.m2 = "Escribe los m² de la sala.";
  else if (m2 === null) problemas.m2 = "Escribe un número, con hasta 2 decimales (12,5).";
  else if (m2 <= 0 || m2 > M2_MAXIMO) problemas.m2 = `Tienen que ser más de 0 y hasta ${M2_MAXIMO}.`;

  const densidad = leerDecimal(b.densidad);
  if (b.densidad.trim() === "") problemas.densidad = "Escribe cuántas prendas caben por m².";
  else if (densidad === null) problemas.densidad = "Escribe un número, con hasta 2 decimales (30).";
  else if (densidad <= 0 || densidad > DENSIDAD_MAXIMA) problemas.densidad = `Tienen que ser más de 0 y hasta ${DENSIDAD_MAXIMA}.`;

  if (m2 !== null && densidad !== null && !problemas.m2 && !problemas.densidad && capacidadDe(m2, densidad) < 1) {
    problemas.densidad = "Con esos números no cabe ni una prenda.";
  }

  let contadaEl: string | null = null;
  if (!b.sinContar) {
    const f = b.contadaEl.trim();
    if (f === "") problemas.contadaEl = "Elige el día del conteo, o marca «Aún no lo conté».";
    else if (!esFechaQueExiste(f)) problemas.contadaEl = "Esa fecha no existe.";
    else if (f > hoy) problemas.contadaEl = "El conteo no puede ser de un día que no llegó.";
    else if (f < CONTEO_DESDE) problemas.contadaEl = "Tiene que ser de 2026 en adelante.";
    else contadaEl = f;
  }

  if (Object.keys(problemas).length > 0 || m2 === null || densidad === null) return { ok: false, problemas };
  return { ok: true, m2, densidad, capacidad: capacidadDe(m2, densidad), contadaEl };
}

/**
 * Cuántas prendas caben con lo que hay en las dos primeras cajas, o null si alguna no se lee. NO mira el día del conteo: la capacidad no
 * depende de él, y la hoja la muestra apenas están los m² y las prendas por m², sin esperar a que se elija la fecha.
 */
export function capacidadDelBorrador(b: BorradorDelPiso): number | null {
  const l = leerDelPiso({ ...b, sinContar: true }, "");
  return l.ok ? l.capacidad : null;
}

/** Lo que ya está guardado, puesto en las cajas. Sin capacidad todavía: cajas vacías y «Aún no lo conté» apagado (se pide el día). */
export function borradorDeLaCapacidad(c: CapacidadPiso | null): BorradorDelPiso {
  if (!c) return { m2: "", densidad: "", contadaEl: "", sinContar: false };
  return { m2: aTexto(c.m2Sala), densidad: aTexto(c.densidad), contadaEl: c.contadaEl ?? "", sinContar: c.contadaEl === null };
}

function aTexto(n: number): string {
  return String(n).replace(".", ",");
}

/** ¿Lo leído es exactamente lo que ya está guardado? Entonces guardar no hace nada (la base lo contesta «sin cambios»): el botón lo dice. */
export function esLoMismo(c: CapacidadPiso | null, l: Extract<LecturaDelPiso, { ok: true }>): boolean {
  return c !== null && c.m2Sala === l.m2 && c.densidad === l.densidad && c.contadaEl === l.contadaEl;
}

/** La diferencia de capacidad que provoca el cambio: «+24», «−96», o null si no hay capacidad previa o no cambió. */
export function diferenciaDeCapacidad(c: CapacidadPiso | null, nueva: number): number | null {
  if (!c || c.capacidad === nueva) return null;
  return nueva - c.capacidad;
}

/**
 * Lo que la guía de foco de la hoja cuenta como «falta» (CLAUDE.md «Guía de foco», ADR-0284): los m², las prendas por m², el día del conteo
 * (salvo «Aún no lo conté») y quién hace el cambio. No agrega reglas: sale de `leerDelPiso`, la misma lectura que decide si se guarda.
 */
export function camposDelPiso(l: LecturaDelPiso, b: BorradorDelPiso, responsable: { listo: boolean }): CampoDeGuia[] {
  const p: Partial<Record<CampoDelPiso, string>> = l.ok ? {} : l.problemas;
  return [
    { id: "m2", nombre: "Metros cuadrados", requerido: true, hecho: !p.m2, pendiente: p.m2 ?? "Escribe los m² de la sala." },
    { id: "densidad", nombre: "Prendas por m²", requerido: true, hecho: !p.densidad, pendiente: p.densidad ?? "Escribe cuántas prendas caben por m²." },
    {
      id: "contadaEl",
      nombre: "Día del conteo",
      requerido: !b.sinContar,
      hecho: b.sinContar || !p.contadaEl,
      pendiente: p.contadaEl ?? "Elige el día del conteo, o marca «Aún no lo conté».",
    },
    { id: "responsable", nombre: "Quién hace el cambio", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace esta operación." },
  ];
}
