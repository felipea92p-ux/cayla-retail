// Las OFERTAS de una campaña («Tres preguntas», Felipe 2026-10-23): un % menos con sus propias fechas, sus días de la semana y, si se
// quiere, solo algunas categorías de la campaña. Lógica pura, sin React ni Supabase: la usan la hoja, la ruta de la API y las pruebas.
//
// PROMETE: leer una fila de `campana_reglas()` a su forma de pantalla; decir los días de la semana en palabras de tienda («los martes
//   y jueves»); contar en cuántos días de sus fechas rige una oferta; decir si está en borrador, programada, vigente o terminada; armar
//   su nombre automático y su frase; validar lo que la base valida (mismos mensajes en lo que importa) ANTES de ir a ella; y leer el
//   cuerpo que manda la hoja a la API.
// ASUME: fechas «AAAA-MM-DD» de Lima; días de la semana como ISO (1 = lunes … 7 = domingo), igual que la base (`isodow`).
// NO HACE: no habla con la base ni decide permisos (eso es de la base: `fn_puede_campanas`; desde ADR-0534 ya no pide líder).
// La regla de verdad vive en `supabase/migrations/20261023232000_campana_reglas_de_precio.sql`; una prueba la ata (`campana-reglas.test.ts`).

import { fechaCorta } from "./etiqueta-vigencia";
import { sumarDias } from "./fechas-lima";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export type EstadoRegla = "borrador" | "activa" | "desactivada";

/** Una oferta tal como la ve la pantalla. */
export type ReglaCampana = {
  id: string;
  etiquetaId: string;
  nombre: string;
  /** Hoy solo «un % menos». */
  tipo: "pct";
  porcentaje: number;
  desde: string;
  hasta: string;
  /** Días de la semana en que rige, ordenados: 1 = lunes … 7 = domingo. */
  dias: number[];
  incluyeClaure: boolean;
  estado: EstadoRegla;
  /** «Solo estas categorías» (vacío = todas las de la campaña) y «dejar fuera». */
  categoriasSolo: string[];
  categoriasFuera: string[];
  /** Las tiendas donde rige, dentro de las de su campaña. Vacío = en todas las de la campaña. */
  sedeIds: string[];
  creadaEn: string;
  activadaEn: string | null;
  /** Cuántas veces cambió y cómo estaba antes del último cambio (para decir «antes: …»). */
  cambios: number;
  ultimoCambio: Record<string, unknown> | null;
};

/** La fila cruda de `campana_reglas()`. */
export type FilaRegla = {
  id: string;
  etiqueta_id: string;
  nombre: string;
  tipo: string;
  porcentaje: number | string;
  desde: string;
  hasta: string;
  dias_semana: number[];
  incluye_claure: boolean;
  estado: string;
  categorias_solo: string[] | null;
  categorias_fuera: string[] | null;
  sedes?: string[] | null;
  creada_en: string;
  activada_en: string | null;
  cambios: number | null;
  ultimo_cambio: Record<string, unknown> | null;
};

const ESTADOS: readonly EstadoRegla[] = ["borrador", "activa", "desactivada"];

export function reglaDeFila(f: FilaRegla): ReglaCampana {
  return {
    id: f.id,
    etiquetaId: f.etiqueta_id,
    nombre: f.nombre,
    tipo: "pct",
    porcentaje: Number(f.porcentaje),
    desde: f.desde,
    hasta: f.hasta,
    dias: [...(f.dias_semana ?? DIAS_SEMANA)].sort((a, b) => a - b),
    incluyeClaure: f.incluye_claure,
    estado: ESTADOS.includes(f.estado as EstadoRegla) ? (f.estado as EstadoRegla) : "borrador",
    categoriasSolo: f.categorias_solo ?? [],
    categoriasFuera: f.categorias_fuera ?? [],
    sedeIds: f.sedes ?? [],
    creadaEn: f.creada_en,
    activadaEn: f.activada_en,
    cambios: f.cambios ?? 0,
    ultimoCambio: f.ultimo_cambio,
  };
}

// ---- El %: el tope y los pasos (la base los exige: 1 a 70 %) ----------------------------------------------------------------

export const PORCENTAJE_MIN = 5;
export const PORCENTAJE_MAX = 70;
export const PORCENTAJE_PASO = 5;
/** Los de siempre, a un toque. */
export const PORCENTAJES_RAPIDOS = [10, 15, 20, 30, 40, 50] as const;
export const PORCENTAJE_DE_FABRICA = 20;

// ---- Los días de la semana --------------------------------------------------------------------------------------------------

export const DIAS_SEMANA: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
const NOMBRE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const PLURAL_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const CORTO_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const nombreDia = (d: number) => NOMBRE_DIA[d - 1] ?? "";
export const diaCorto = (d: number) => CORTO_DIA[d - 1] ?? "";

/** «A, B y C». */
export const lista = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

/** Qué día de la semana (1 = lunes … 7 = domingo) cae una fecha «AAAA-MM-DD». */
export function diaDeSemanaIso(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return ((new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** El día siguiente (para recorrer un rango sin depender de la hora local). */
function sumarUnDia(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Qué día de la semana cae cada fecha del rango (con tope: una oferta no pasa de un año). */
function diasPorFecha(desde: string, hasta: string): number[] {
  const out: number[] = [];
  if (!desde || !hasta || hasta < desde) return out;
  let f = desde;
  for (let i = 0; i <= 400 && f <= hasta; i++) {
    out.push(diaDeSemanaIso(f));
    f = sumarUnDia(f);
  }
  return out;
}

/** Los días de la semana que caen al menos una vez entre dos fechas: lo que una oferta puede elegir de verdad. */
export function diasQueCaen(desde: string, hasta: string): number[] {
  return [...new Set(diasPorFecha(desde, hasta))].sort((a, b) => a - b);
}

/** En cuántos de los días de sus fechas rige una oferta con esos días de la semana. */
export function cuentaDias(desde: string, hasta: string, dias: readonly number[]): { rige: number; total: number } {
  const porFecha = diasPorFecha(desde, hasta);
  return { rige: porFecha.filter((d) => dias.includes(d)).length, total: porFecha.length };
}

/** ¿Alguno de los días elegidos cae entre las fechas? Si no, la oferta no regiría nunca. */
export const algunDiaCae = (desde: string, hasta: string, dias: readonly number[]): boolean => cuentaDias(desde, hasta, dias).rige > 0;

const ordenados = (dias: readonly number[]) => [...new Set(dias)].sort((a, b) => a - b);
const contiguos = (s: readonly number[]) => s.length >= 3 && s.every((x, i) => i === 0 || x === s[i - 1] + 1);

/** «los martes y jueves» · «de lunes a viernes» · «los sábados y domingos»; vacío si rige todos los días. */
export function textoDias(dias: readonly number[]): string {
  const s = ordenados(dias);
  if (s.length === 7) return "";
  if (s.length === 0) return "ningún día";
  if (s.join() === "6,7") return "los sábados y domingos";
  if (contiguos(s)) return `de ${nombreDia(s[0])} a ${nombreDia(s[s.length - 1])}`;
  return `los ${lista(s.map((d) => PLURAL_DIA[d - 1]))}`;
}

/** «mar y jue» · «lun a vie» · «fin de semana»: para el nombre y la lista; vacío si rige todos los días. */
export function textoDiasCorto(dias: readonly number[]): string {
  const s = ordenados(dias);
  if (s.length === 7) return "";
  if (s.length === 0) return "sin días";
  if (s.join() === "6,7") return "fin de semana";
  if (contiguos(s)) return `${diaCorto(s[0])} a ${diaCorto(s[s.length - 1])}`.toLowerCase();
  return lista(s.map((d) => diaCorto(d).toLowerCase()));
}

// ---- En qué punto está una oferta -------------------------------------------------------------------------------------------

export type VigenciaRegla = "borrador" | "programada" | "vigente" | "terminada" | "retirada";

/** Borrador (guardada sin activar), programada (empieza después), vigente (hoy cae en sus fechas), terminada o retirada. */
export function vigenciaDeRegla(r: Pick<ReglaCampana, "estado" | "desde" | "hasta">, hoy: string): VigenciaRegla {
  if (r.estado === "desactivada") return "retirada";
  if (r.estado === "borrador") return r.hasta < hoy ? "terminada" : "borrador";
  if (r.hasta < hoy) return "terminada";
  if (r.desde > hoy) return "programada";
  return "vigente";
}

/** Las que cuentan para el pase: ni retiradas ni ya terminadas. */
export const reglasVivas = (reglas: readonly ReglaCampana[], hoy: string) => reglas.filter((r) => !["retirada", "terminada"].includes(vigenciaDeRegla(r, hoy)));

export const reglasDeCampana = (reglas: readonly ReglaCampana[], etiquetaId: string) => reglas.filter((r) => r.etiquetaId === etiquetaId);

/** Primero lo que rige o va a regir, después los borradores, y al final lo que ya pasó. */
export function ordenarReglas(reglas: readonly ReglaCampana[], hoy: string): ReglaCampana[] {
  const rango: Record<VigenciaRegla, number> = { vigente: 0, programada: 1, borrador: 2, terminada: 3, retirada: 4 };
  return [...reglas].sort((a, b) => rango[vigenciaDeRegla(a, hoy)] - rango[vigenciaDeRegla(b, hoy)] || a.desde.localeCompare(b.desde) || a.nombre.localeCompare(b.nombre, "es"));
}

// ---- Lo que escribe la persona --------------------------------------------------------------------------------------------

/** Lo que la hoja arma mientras se contestan las tres preguntas. */
export type OfertaEnEdicion = {
  /** `null` mientras es nueva. */
  id: string | null;
  porcentaje: number;
  desde: string;
  hasta: string;
  dias: number[];
  categoriasSolo: string[];
  categoriasFuera: string[];
  /** Tiendas donde rige, dentro de las de su campaña; vacío = todas las de la campaña. */
  sedeIds: string[];
  incluyeClaure: boolean;
  /** El nombre que la persona escribió; vacío = el automático. */
  nombre: string;
};

export const ofertaNueva = (desde: string, hasta: string): OfertaEnEdicion => ({
  id: null,
  porcentaje: PORCENTAJE_DE_FABRICA,
  desde,
  hasta,
  dias: [...DIAS_SEMANA],
  categoriasSolo: [],
  categoriasFuera: [],
  sedeIds: [],
  incluyeClaure: false,
  nombre: "",
});

export const ofertaDesdeRegla = (r: ReglaCampana, nombreAutomatico: boolean): OfertaEnEdicion => ({
  id: r.id,
  porcentaje: r.porcentaje,
  desde: r.desde,
  hasta: r.hasta,
  dias: [...r.dias],
  categoriasSolo: [...r.categoriasSolo],
  categoriasFuera: [...r.categoriasFuera],
  sedeIds: [...r.sedeIds],
  incluyeClaure: r.incluyeClaure,
  nombre: nombreAutomatico ? "" : r.nombre,
});

const MAX_NOMBRE = 80;

/** Los nombres de unas categorías, en orden alfabético: la misma selección dice lo mismo (y se llama igual) sin importar en qué orden se tocó
 *  ni en qué orden la devuelve la base. */
export const nombresOrdenados = (ids: readonly string[], nombreCategoria: (id: string) => string) => ids.map(nombreCategoria).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));

/** Los nombres de unas tiendas, sin «Tienda » delante («Trujillo»), en orden alfabético. */
export const nombresDeTiendas = (ids: readonly string[], nombreSede: (id: string) => string): string[] =>
  ids.map((id) => nombreSede(id).replace(/^tienda\s+/i, "")).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));

/** Hasta cuántas categorías se nombran en una frase o en el nombre de una oferta; con más, se dice cuántas son («12 categorías»). */
export const MAX_CATEGORIAS_NOMBRADAS = 3;

/** Las categorías de una oferta dichas en una frase: «Blusas y Faldas» o, si son muchas, «12 categorías». */
export function categoriasDichas(ids: readonly string[], nombreCategoria: (id: string) => string): string {
  const nombres = nombresOrdenados(ids, nombreCategoria);
  return nombres.length > MAX_CATEGORIAS_NOMBRADAS ? `${nombres.length} categorías` : lista(nombres);
}

/** «Toda la campaña · −20 % · mar y jue» · «Blusas y Faldas · −20 % · Trujillo». */
export function nombreAutomatico(
  o: Pick<OfertaEnEdicion, "porcentaje" | "dias" | "categoriasSolo"> & { sedeIds?: readonly string[] },
  nombreCategoria: (id: string) => string,
  nombreSede: (id: string) => string = () => "",
): string {
  const donde = o.categoriasSolo.length ? categoriasDichas(o.categoriasSolo, nombreCategoria) : "Toda la campaña";
  const dias = textoDiasCorto(o.dias);
  const tiendas = lista(nombresDeTiendas(o.sedeIds ?? [], nombreSede));
  const t = `${donde} · −${String(o.porcentaje).replace(".", ",")} %${dias ? ` · ${dias}` : ""}${tiendas ? ` · ${tiendas}` : ""}`;
  return t.length > MAX_NOMBRE ? `${t.slice(0, MAX_NOMBRE - 1)}…` : t;
}

export const nombreDeOferta = (o: OfertaEnEdicion, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): string =>
  o.nombre.trim() || nombreAutomatico(o, nombreCategoria, nombreSede);

/** Si el nombre guardado es el que habría salido solo (para no tratar de «a mano» uno automático). */
export const esNombreAutomatico = (r: ReglaCampana, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): boolean =>
  r.nombre === nombreAutomatico({ porcentaje: r.porcentaje, dias: r.dias, categoriasSolo: r.categoriasSolo, sedeIds: r.sedeIds }, nombreCategoria, nombreSede);

/** «del 26 oct al 31 oct» · «el 26 oct». */
export const textoFechas = (desde: string, hasta: string): string => {
  const f = (x: string) => fechaCorta(x).replace(/\.$/, ""); // «26 oct.» → «26 oct»: la frase cierra con su propio punto
  return desde === hasta ? `el ${f(desde)}` : `del ${f(desde)} al ${f(hasta)}`;
};

/** «20 % menos en todas las prendas de la campaña, los martes y jueves, del 26 oct al 31 oct.» */
export function fraseDeOferta(o: OfertaEnEdicion, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): string {
  const donde = o.categoriasSolo.length ? `solo en ${categoriasDichas(o.categoriasSolo, nombreCategoria)}` : "en todas las prendas de la campaña";
  const fuera = o.categoriasFuera.length ? ` (menos ${lista(nombresOrdenados(o.categoriasFuera, nombreCategoria).map((n) => n.toLowerCase()))})` : "";
  const dias = textoDias(o.dias);
  const tiendas = lista(nombresDeTiendas(o.sedeIds, nombreSede));
  return `${String(o.porcentaje).replace(".", ",")} % menos ${donde}${fuera}${o.incluyeClaure ? ", con las prendas de Claurè" : ""}${tiendas ? `, solo en ${tiendas}` : ""}${dias ? `, ${dias}` : ""}, ${textoFechas(o.desde, o.hasta)}.`;
}

// ---- Validar ANTES de ir a la base (la base vuelve a validar todo) ------------------------------------------------------------

export type ContextoOferta = {
  /** Las fechas de la campaña; `null` si no tiene. */
  campanaDesde: string | null;
  campanaHasta: string | null;
  hoy: string;
  /** Las fechas con que ya estaba guardada (al editar); si no las mueve, no se le pide empezar hoy o después. */
  original?: { desde: string; hasta: string } | null;
};

/** Lo que impide guardar, dicho en una frase cada cosa. Vacío = se puede guardar. */
export function problemasDeOferta(o: OfertaEnEdicion, c: ContextoOferta): string[] {
  const p: string[] = [];
  if (!Number.isFinite(o.porcentaje) || o.porcentaje <= 0 || o.porcentaje > PORCENTAJE_MAX) p.push(`El descuento tiene que ir de 1 a ${PORCENTAJE_MAX} %.`);
  if (!o.desde || !o.hasta) {
    p.push("Pon cuándo empieza y cuándo termina.");
    return p;
  }
  if (o.desde > o.hasta) p.push("El inicio no puede ser posterior al fin.");
  else {
    const mueve = !c.original || c.original.desde !== o.desde || c.original.hasta !== o.hasta;
    if (mueve && o.desde < c.hoy) p.push("La oferta no puede empezar antes de hoy.");
    if ((c.campanaDesde && o.desde < c.campanaDesde) || (c.campanaHasta && o.hasta > c.campanaHasta)) {
      p.push(`Las fechas tienen que caber dentro de las de la campaña${c.campanaDesde && c.campanaHasta ? ` (${fechaCorta(c.campanaDesde)} – ${fechaCorta(c.campanaHasta)})` : ""}.`);
    }
    if (diasEntreFechas(o.desde, o.hasta) > 400) p.push("Una oferta no puede durar más de un año.");
  }
  const dias = ordenados(o.dias);
  if (dias.length === 0) p.push("Elige al menos un día de la semana.");
  else if (dias.some((d) => d < 1 || d > 7)) p.push("Los días de la semana van del lunes al domingo.");
  else if (o.desde <= o.hasta && dias.length < 7 && !algunDiaCae(o.desde, o.hasta, dias)) {
    p.push(`Entre el ${fechaCorta(o.desde)} y el ${fechaCorta(o.hasta)} no cae ningún ${lista(dias.map(nombreDia))}: la oferta no regiría nunca.`);
  }
  if (o.categoriasSolo.some((id) => o.categoriasFuera.includes(id))) p.push("Una categoría no puede estar a la vez en «solo estas» y en «dejar fuera».");
  return p;
}

function diasEntreFechas(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

// ---- Lo que viaja a la API ----------------------------------------------------------------------------------------------------

export type CuerpoGuardarOferta = {
  /** `null` = nueva. */
  id: string | null;
  etiquetaId: string;
  nombre: string;
  porcentaje: number;
  desde: string;
  hasta: string;
  dias: number[];
  categoriasSolo: string[];
  categoriasFuera: string[];
  sedeIds: string[];
  incluyeClaure: boolean;
  /** Activarla ya (rige desde su fecha) o dejarla como borrador; lo hace quien tiene la llave de campañas (ADR-0534). */
  activar: boolean;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esTextoUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const esFechaReal = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** El cuerpo de la hoja a la ruta: lo leído a mano, sin fiarse de lo que llegue (la base valida el fondo). */
export function leerCuerpoOferta(cuerpo: unknown): Resultado<CuerpoGuardarOferta> {
  if (typeof cuerpo !== "object" || cuerpo === null) return { ok: false, error: "Falta el cuerpo de la oferta." };
  const c = cuerpo as Record<string, unknown>;
  if (!esTextoUuid(c.etiquetaId)) return { ok: false, error: "Falta la campaña de la oferta." };
  if (c.id != null && !esTextoUuid(c.id)) return { ok: false, error: "La oferta que quieres cambiar no es válida." };
  if (typeof c.nombre !== "string" || !c.nombre.trim()) return { ok: false, error: "La oferta necesita un nombre." };
  if (typeof c.porcentaje !== "number" || !Number.isFinite(c.porcentaje)) return { ok: false, error: "El descuento no es un número." };
  if (!esFechaReal(c.desde) || !esFechaReal(c.hasta)) return { ok: false, error: "Las fechas de la oferta no son válidas." };
  if (!Array.isArray(c.dias) || !c.dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return { ok: false, error: "Los días de la semana no son válidos." };
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  const solo = lista(c.categoriasSolo);
  const fuera = lista(c.categoriasFuera);
  if (![...solo, ...fuera].every(esTextoUuid)) return { ok: false, error: "Una de las categorías no es válida." };
  const sedes = lista(c.sedeIds);
  if (!sedes.every(esTextoUuid)) return { ok: false, error: "Una de las tiendas no es válida." };
  return {
    ok: true,
    valor: {
      id: (c.id as string | null | undefined) ?? null,
      etiquetaId: c.etiquetaId,
      nombre: c.nombre.trim(),
      porcentaje: c.porcentaje,
      desde: c.desde,
      hasta: c.hasta,
      dias: ordenados(c.dias as number[]),
      categoriasSolo: solo as string[],
      categoriasFuera: fuera as string[],
      sedeIds: sedes as string[],
      incluyeClaure: c.incluyeClaure === true,
      activar: c.activar === true,
    },
  };
}

// ---- Ayudas de la hoja: atajos de fechas, cruces y «antes: …» -------------------------------------------------------------------

export type AtajoFechas = { texto: string; desde: string; hasta: string };

/** Los atajos de «¿Cuándo?»: toda la campaña, el fin de semana que viene, 7 días y hasta fin de mes; solo los que caben en la
 *  campaña y no son del pasado. `inicio` es el primer día posible (hoy o el inicio de la campaña, el que sea después). */
export function atajosDeFechas(inicio: string, hastaCampana: string | null, hoy: string): AtajoFechas[] {
  const dow = diaDeSemanaIso(inicio);
  const sabado = dow === 7 ? sumarDias(inicio, -1) : sumarDias(inicio, 6 - dow);
  const finDeMes = (() => {
    const [a, m] = inicio.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  })();
  const todos: AtajoFechas[] = [
    // Una campaña sin fecha de fin no tiene «toda»: sus atajos son solo los de abajo.
    ...(hastaCampana ? [{ texto: "Toda la campaña", desde: inicio, hasta: hastaCampana }] : []),
    { texto: "Fin de semana", desde: dow >= 6 ? inicio : sabado, hasta: sumarDias(dow >= 6 ? inicio : sabado, dow === 7 ? 0 : dow === 6 ? 1 : 1) },
    { texto: "7 días", desde: inicio, hasta: sumarDias(inicio, 6) },
    { texto: "Hasta fin de mes", desde: inicio, hasta: finDeMes },
  ];
  // Un atajo repetido (dos que caen en las mismas fechas) se dice una sola vez.
  const visto = new Set<string>();
  return todos.filter((a) => {
    const clave = `${a.desde}|${a.hasta}`;
    if (visto.has(clave)) return false;
    visto.add(clave);
    return a.desde >= inicio && a.hasta >= a.desde && a.hasta >= hoy && (hastaCampana === null || a.hasta <= hastaCampana);
  });
}

/** Las ofertas de la misma campaña con las que esta se cruza: ni retiradas ni terminadas, con fechas que se pisan, algún día de la
 *  semana en común y prendas en común («toda la campaña» se cruza con todo). En cada prenda gana la de mayor descuento; no se suman. */
export function reglasQueSeCruzan(o: Pick<OfertaEnEdicion, "id" | "desde" | "hasta" | "dias" | "categoriasSolo" | "sedeIds">, otras: readonly ReglaCampana[], hoy: string): ReglaCampana[] {
  return otras.filter((r) => {
    if (r.id === o.id) return false;
    if (["retirada", "terminada"].includes(vigenciaDeRegla(r, hoy))) return false;
    if (r.desde > o.hasta || o.desde > r.hasta) return false;
    if (!r.dias.some((d) => o.dias.includes(d))) return false;
    // Dos ofertas de tiendas distintas no se cruzan (una oferta sin tiendas rige en todas las de la campaña).
    if (r.sedeIds.length > 0 && o.sedeIds.length > 0 && !r.sedeIds.some((x) => o.sedeIds.includes(x))) return false;
    if (r.categoriasSolo.length === 0 || o.categoriasSolo.length === 0) return true;
    return r.categoriasSolo.some((c) => o.categoriasSolo.includes(c));
  });
}

/** Cómo estaba una oferta antes de su último cambio, en una frase corta: «−15 % · 24 oct – 31 oct · mar y jue». Vacío si no se sabe. */
export function resumenAntes(antes: Record<string, unknown> | null): string {
  if (!antes) return "";
  const pct = Number(antes.porcentaje);
  const desde = typeof antes.desde === "string" ? antes.desde : "";
  const hasta = typeof antes.hasta === "string" ? antes.hasta : "";
  const dias = Array.isArray(antes.dias_semana) ? (antes.dias_semana as unknown[]).filter((d): d is number => typeof d === "number") : [];
  const partes = [
    Number.isFinite(pct) ? `−${String(pct).replace(".", ",")} %` : "",
    desde && hasta ? `${fechaCorta(desde).replace(/\.$/, "")} – ${fechaCorta(hasta).replace(/\.$/, "")}` : "",
    dias.length && dias.length < 7 ? textoDiasCorto(dias) : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

// ---- Cuántas prendas alcanza una oferta (lo que dicen los conteos de la hoja) -------------------------------------------------------

export type PrendaDeCampana = { id: string; categoriaId: string | null; deClaure?: boolean; modelo?: string };

/** Cuántas prendas son estas. Una prenda es un modelo en su color: sus tallas cuentan una vez, como en el pase de Insignias y en la etiqueta
 *  de la campaña (ADR-0488). Sin `modelo`, cada fila cuenta como una. */
export function contarPrendas(prendas: readonly Pick<PrendaDeCampana, "id" | "modelo">[]): number {
  return new Set(prendas.map((p) => p.modelo ?? p.id)).size;
}

/** Las prendas que la oferta alcanzaría. Con «solo estas categorías», las de esas categorías, estén o no en la campaña (la oferta dice dónde
 *  rige); sin ninguna, las de la campaña. Siempre sin las que dejó fuera y sin las de Claurè (otra empresa) salvo que las incluya a propósito.
 *  Es lo que la base cobra: `fn_campanas_en_sede`. */
export function prendasQueAlcanza<P extends PrendaDeCampana>(
  prendasDeLaCampana: readonly P[],
  prendasDelCatalogo: readonly P[],
  o: Pick<OfertaEnEdicion, "categoriasSolo" | "categoriasFuera" | "incluyeClaure">,
): P[] {
  return (o.categoriasSolo.length > 0 ? prendasDelCatalogo : prendasDeLaCampana).filter((p) => {
    if (!o.incluyeClaure && p.deClaure) return false;
    const c = p.categoriaId;
    if (o.categoriasSolo.length > 0 && !(c && o.categoriasSolo.includes(c))) return false;
    return !(c && o.categoriasFuera.includes(c));
  });
}

/** Cuántas prendas DE LA CAMPAÑA (no de toda la categoría) tiene cada categoría, contadas como `contarPrendas` (un modelo en su color, no sus
 *  tallas); las de Claurè no cuentan salvo que se incluyan. Una categoría cuyas prendas son todas de Claurè sigue en el mapa, con 0. */
export function contarPorCategoria(prendasDeLaCampana: readonly PrendaDeCampana[], incluyeClaure: boolean): Map<string, number> {
  const modelos = new Map<string, Set<string>>();
  for (const p of prendasDeLaCampana) {
    if (!p.categoriaId) continue;
    const set = modelos.get(p.categoriaId) ?? new Set<string>();
    if (incluyeClaure || !p.deClaure) set.add(p.modelo ?? p.id);
    modelos.set(p.categoriaId, set);
  }
  return new Map([...modelos].map(([id, set]) => [id, set.size]));
}
