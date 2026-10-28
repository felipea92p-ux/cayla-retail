// La carga inicial por sede (ADR-0328, actividad 4). Lógica pura: la usan Configuración, Nuevo producto, Ajustar, la ficha
// del producto y sus pruebas. Las MISMAS reglas las cierra la base (migraciones 20261004210000-20261004210200):
//
//   · `fn_carga_inicial_abierta`: abierta = sin fecha, o hoy (Lima) ≤ la fecha. La fecha es el ÚLTIMO día abierto.
//   · `fn_texto_carga_inicial_cerrada`: la frase de la sede cerrada («… se cerró el 15-oct. Lo que encuentres entra por
//     «Encontré prendas».»). `textoCargaCerrada` de aquí dice EXACTAMENTE lo mismo (una prueba lo compara).
//   · `fijar_cierre_carga_inicial`: apretar (poner fecha, adelantarla) es del líder; aflojar (reabrir, quitar la fecha, correr
//     el cierre más adelante) solo del Admin; nunca una fecha pasada.
//
// Contrato — PROMETE: decir antes, con las palabras de la base, lo que la base va a aceptar o rechazar. ASUME: `hoy` es el
// «hoy» que devolvió la base (`fn_carga_inicial_sedes().hoy`), no el reloj del navegador: así pantalla y candado no
// discrepan cerca de la medianoche. NO decide nada: si esto y la base no coinciden, manda la base.

/** Una sede tal como la devuelve `fn_carga_inicial_sedes()`. `hasta`: `aaaa-mm-dd` o null (abierta sin fecha). */
export type SedeCargaInicial = { ubicacionId: string; nombre: string; tipo: string; hasta: string | null; abierta: boolean };

export type LecturaCargaInicial = { hoy: string; sedes: SedeCargaInicial[] };

/** Lo que una pantalla necesita saber de UNA sede para avisar: su nombre, su fecha y el «hoy» de la base. */
export type CargaInicialSede = { sede: string; hasta: string | null; hoy: string };

export type EstadoCargaInicial =
  | { tipo: "sin_fecha" }
  | { tipo: "abierta"; hasta: string; dias: number }
  | { tipo: "cerrada"; hasta: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Lo que vuelve de la base, leído sin confiar en su forma: `null` si no es lo esperado (la pantalla sigue, sin avisos). */
export function leerCargaInicial(data: unknown): LecturaCargaInicial | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { hoy?: unknown; sedes?: unknown };
  if (typeof d.hoy !== "string" || !FECHA.test(d.hoy) || !Array.isArray(d.sedes)) return null;
  const sedes: SedeCargaInicial[] = [];
  for (const s of d.sedes) {
    if (!s || typeof s !== "object") continue;
    const x = s as Record<string, unknown>;
    if (typeof x.ubicacion_id !== "string" || typeof x.nombre !== "string") continue;
    const hasta = typeof x.hasta === "string" && FECHA.test(x.hasta) ? x.hasta : null;
    sedes.push({
      ubicacionId: x.ubicacion_id,
      nombre: x.nombre,
      tipo: typeof x.tipo === "string" ? x.tipo : "tienda",
      hasta,
      abierta: typeof x.abierta === "boolean" ? x.abierta : estadoCargaInicial(hasta, d.hoy).tipo !== "cerrada",
    });
  }
  return { hoy: d.hoy, sedes };
}

/** La sede de la lectura que necesita una pantalla, lista para avisar. `null` si la lectura no está o no la trae. */
export function cargaInicialDe(lectura: LecturaCargaInicial | null, ubicacionId: string | null | undefined): CargaInicialSede | null {
  if (!lectura || !ubicacionId) return null;
  const s = lectura.sedes.find((x) => x.ubicacionId === ubicacionId);
  return s ? { sede: s.nombre, hasta: s.hasta, hoy: lectura.hoy } : null;
}

/** Días de calendario de `desde` a `hasta` (`aaaa-mm-dd`), sin zonas horarias. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** La regla de la base (`fn_carga_inicial_abierta`): sin fecha, abierta; con fecha, abierta hasta ese día inclusive. */
export function estadoCargaInicial(hasta: string | null, hoy: string): EstadoCargaInicial {
  if (!hasta) return { tipo: "sin_fecha" };
  const dias = diasEntre(hoy, hasta);
  return dias >= 0 ? { tipo: "abierta", hasta, dias } : { tipo: "cerrada", hasta };
}

/** El estado de una sede leída, o null si no se sabe (la base todavía no tiene la función: no se avisa nada). */
export function estadoDe(c: CargaInicialSede | null): EstadoCargaInicial | null {
  return c ? estadoCargaInicial(c.hasta, c.hoy) : null;
}

/** ¿La base rechazó el guardado porque la carga de la sede ya se cerró (`fn_exigir_carga_inicial_abierta`, o un ajuste sobre
 *  una prenda que nunca estuvo en ella)? La pantalla vuelve a leer el cierre: lo que tenía en memoria ya no vale. */
export function esRechazoPorCargaCerrada(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === "carga_inicial_cerrada";
}

/** ¿Se puede cargar stock inicial? Sin dato, sí: la pantalla no se inventa un cierre (la base igual lo exige). */
export function cargaAbierta(c: CargaInicialSede | null): boolean {
  return estadoDe(c)?.tipo !== "cerrada";
}

/** «15-oct», como la base (`to_char(…, 'FMDD')` + el mes corto): sin cero delante y sin año. */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}-${MESES_CORTOS[Number(m) - 1] ?? m}`;
}

/** La frase de la sede cerrada: la MISMA que la base (`fn_texto_carga_inicial_cerrada(…, 'carga')`). */
export function textoCargaCerrada(sede: string, hasta: string): string {
  return `La carga inicial de ${sede} se cerró el ${fechaCorta(hasta)}. Lo que encuentres entra por «Encontré prendas».`;
}

/** El aviso ANTES del cierre (o el de cerrada). `null` = sin fecha: no hay nada que avisar. */
export function avisoCargaInicial(c: CargaInicialSede | null): string | null {
  const e = estadoDe(c);
  if (!c || !e || e.tipo === "sin_fecha") return null;
  if (e.tipo === "cerrada") return textoCargaCerrada(c.sede, e.hasta);
  const cuando = fechaCorta(e.hasta);
  if (e.dias === 0) return `La carga inicial de ${c.sede} se cierra hoy, ${cuando}: es el último día para cargar lo que ya tienes.`;
  return `La carga inicial de ${c.sede} se cierra el ${cuando} (${e.dias === 1 ? "falta 1 día" : `faltan ${e.dias} días`}).`;
}

/** El estado en una palabra o dos, para la insignia de Configuración. */
export function chipCargaInicial(e: EstadoCargaInicial): { texto: string; tono: "verde" | "ambar" | "apagado" | "neutro" } {
  if (e.tipo === "sin_fecha") return { texto: "Abierta, sin fecha", tono: "neutro" };
  if (e.tipo === "cerrada") return { texto: `Cerrada desde el ${fechaCorta(siguienteDia(e.hasta))}`, tono: "apagado" };
  if (e.dias === 0) return { texto: "Hoy es el último día", tono: "ambar" };
  return { texto: e.dias === 1 ? "Abierta · falta 1 día" : `Abierta · faltan ${e.dias} días`, tono: e.dias <= 7 ? "ambar" : "verde" };
}

function siguienteDia(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** ¿Este cambio AFLOJA el cierre? (reabrir una sede cerrada, quitarle la fecha o correrla más adelante). Es del Admin. */
export function aflojaElCierre(actual: string | null, nueva: string | null, hoy: string): boolean {
  if (nueva === actual) return false;
  if (actual !== null && actual < hoy) return true;
  if (nueva === null) return true;
  return actual !== null && nueva > actual;
}

/** Lo que la base va a responder a `fijar_cierre_carga_inicial`, dicho antes de enviar. Mismas reglas y mismo orden. */
export function validarCierre(o: { actual: string | null; nueva: string | null; hoy: string; esLider: boolean; esAdmin: boolean }): { ok: true; cambia: boolean } | { ok: false; error: string } {
  if (!o.esLider) return { ok: false, error: "La fecha de cierre de la carga inicial la fija un líder." };
  if (o.nueva !== null && !FECHA.test(o.nueva)) return { ok: false, error: "Elige una fecha." };
  if (o.nueva !== null && o.nueva < o.hoy) return { ok: false, error: "La fecha de cierre no puede ser un día que ya pasó: elige hoy o un día que viene." };
  if (o.nueva === o.actual) return { ok: true, cambia: false };
  if (aflojaElCierre(o.actual, o.nueva, o.hoy) && !o.esAdmin) {
    return { ok: false, error: "Reabrir la carga inicial, quitarle la fecha o correr el cierre más adelante lo hace un Admin. Puedes adelantarlo." };
  }
  return { ok: true, cambia: true };
}

/** Qué pasa al guardar, en una línea (la hoja lo dice antes de confirmar). */
export function consecuenciaDelCierre(sede: string, nueva: string | null, hoy: string): string {
  if (nueva === null) return `${sede} queda abierta sin fecha: la carga inicial sigue entrando hasta que alguien le ponga una.`;
  const dias = diasEntre(hoy, nueva);
  const ultimo = dias === 0 ? "hoy" : `el ${fechaCorta(nueva)}`;
  return `${sede} carga hasta ${ultimo}. Desde el ${fechaCorta(siguienteDia(nueva))}, lo que aparezca entra por «Encontré prendas», con su nota.`;
}
