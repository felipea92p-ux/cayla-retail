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

/** Las formas de una oferta (ADR-0655): «un % menos», las de «Llevar varias y pagar menos» (actividad 6): el 3x2 («lleva N, paga M»),
 *  «N por S/ X» y «la N.ª al X %»; y «Gastar un monto y ahorrar» (actividad 8), con hasta 3 escalones. */
export type TipoOferta = "pct" | "nxm" | "n_por_monto" | "nesima_pct" | "monto";
export const TIPOS_DE_GRUPO: readonly TipoOferta[] = ["nxm", "n_por_monto", "nesima_pct"];
export const esDeGrupo = (tipo: TipoOferta) => TIPOS_DE_GRUPO.includes(tipo);

/** Un escalón de un monto: desde cuánto suma la compra y cuánto ahorra (soles o %). */
export type EscalonDeMonto = { desde: number; ahorra: number };
/** Cuántos escalones puede tener un monto (la base exige lo mismo: `fn_escalones_validos`). */
export const MAX_ESCALONES = 3;

/** La forma de una oferta: el % (de «un % menos» o de la N.ª), cuántas lleva el grupo, cuántas paga, cuánto cuesta y con qué se arma. */
export type FormaDeOferta = {
  tipo: TipoOferta;
  /** De «un % menos» o de «la N.ª al X %»; 0 en las demás. */
  porcentaje: number;
  lleva: number;
  paga: number;
  monto: number;
  /** El grupo se arma con cualquier prenda de la oferta o solo con prendas del mismo modelo. */
  agrupa: "campana" | "modelo";
  /** En un monto (actividad 8): sus escalones, de menor a mayor; si ahorra en soles o en %; qué cuenta para llegar (toda la compra o solo
   *  las prendas de la oferta); y si las prendas con otra oferta no cuentan («que no cuenten», la salida del choque de Felipe). */
  escalones?: EscalonDeMonto[];
  ahorroEn?: "soles" | "pct";
  cuenta?: "campana" | "compra";
  cedeAOtras?: boolean;
};

/** Una oferta tal como la ve la pantalla. */
export type ReglaCampana = FormaDeOferta & {
  id: string;
  etiquetaId: string;
  nombre: string;
  desde: string;
  hasta: string;
  /** Días de la semana en que rige, ordenados: 1 = lunes … 7 = domingo. */
  dias: number[];
  incluyeClaure: boolean;
  estado: EstadoRegla;
  /** «Solo estas categorías» (vacío = todas las de la campaña) y «dejar fuera». */
  categoriasSolo: string[];
  categoriasFuera: string[];
  /** Los modelos (productos) elegidos uno por uno (ADR-0655): se suman a «solo estas categorías». Vacío = ninguno. */
  productosSolo: string[];
  /** Las insignias elegidas (ADR-0655, por insignia): alcanza las prendas que llevan una, marcadas a mano o por una categoría de la insignia.
   *  Se suman a las categorías y a los modelos. Vacío = ninguna. */
  insigniasSolo: string[];
  /** Las tiendas donde rige, dentro de las de su campaña. Vacío = en todas las de la campaña. */
  sedeIds: string[];
  creadaEn: string;
  activadaEn: string | null;
  /** Cuántas veces cambió y cómo estaba antes del último cambio (para decir «antes: …»). */
  cambios: number;
  ultimoCambio: Record<string, unknown> | null;
  /** Las ofertas que le CEDEN a esta (ADR-0655): donde las dos valdrían —misma prenda, tienda y día— vale esta. */
  ceden: string[];
};

/** La fila cruda de `campana_reglas()`. */
export type FilaRegla = {
  id: string;
  etiqueta_id: string;
  nombre: string;
  tipo: string;
  porcentaje: number | string | null;
  desde: string;
  hasta: string;
  dias_semana: number[];
  incluye_claure: boolean;
  estado: string;
  categorias_solo: string[] | null;
  categorias_fuera: string[] | null;
  sedes?: string[] | null;
  /** Desde 20261113210000; sin esa migración la base no lo manda. */
  productos_solo?: string[] | null;
  /** Desde 20261113223000; sin esa migración la base no lo manda. */
  ceden?: string[] | null;
  /** Desde 20261114003000 (la forma de una oferta de grupo); sin esa migración la base no los manda. */
  lleva?: number | null;
  paga?: number | null;
  monto?: number | string | null;
  agrupa?: string | null;
  /** Desde 20261114044000 (el monto); sin esa migración la base no los manda. */
  escalones?: unknown;
  ahorro_en?: string | null;
  cuenta?: string | null;
  cede_a_otras?: boolean | null;
  /** Desde 20261114060000 (por insignia); sin esa migración la base no lo manda. */
  insignias?: string[] | null;
  creada_en: string;
  activada_en: string | null;
  cambios: number | null;
  ultimo_cambio: Record<string, unknown> | null;
};

const ESTADOS: readonly EstadoRegla[] = ["borrador", "activa", "desactivada"];

const TIPOS: readonly TipoOferta[] = ["pct", ...TIPOS_DE_GRUPO, "monto"];

/** Los escalones como los guarda la base, de menor a mayor, o `null` si no son los que exige `fn_escalones_validos` (de 1 a 3, cada uno desde
 *  más y ahorrando más que el anterior). */
export function escalonesDeFila(x: unknown): EscalonDeMonto[] | null {
  if (!Array.isArray(x) || x.length < 1 || x.length > MAX_ESCALONES) return null;
  const e = x.map((y) => ({ desde: Number((y as Record<string, unknown>)?.desde), ahorra: Number((y as Record<string, unknown>)?.ahorra) }));
  if (e.some((y) => !Number.isFinite(y.desde) || !Number.isFinite(y.ahorra) || y.desde <= 0 || y.ahorra <= 0)) return null;
  if (e.some((y, i) => i > 0 && (y.desde <= e[i - 1].desde || y.ahorra <= e[i - 1].ahorra))) return null;
  return e;
}

export function reglaDeFila(f: FilaRegla): ReglaCampana {
  return {
    id: f.id,
    etiquetaId: f.etiqueta_id,
    nombre: f.nombre,
    tipo: TIPOS.includes(f.tipo as TipoOferta) ? (f.tipo as TipoOferta) : "pct",
    porcentaje: Number(f.porcentaje ?? 0),
    lleva: Number(f.lleva ?? 3),
    paga: Number(f.paga ?? 2),
    monto: Number(f.monto ?? 0),
    agrupa: f.agrupa === "modelo" ? "modelo" : "campana",
    ...(f.tipo === "monto"
      ? {
          escalones: escalonesDeFila(f.escalones) ?? [],
          ahorroEn: f.ahorro_en === "pct" ? ("pct" as const) : ("soles" as const),
          cuenta: f.cuenta === "campana" ? ("campana" as const) : ("compra" as const),
          cedeAOtras: f.cede_a_otras === true,
        }
      : {}),
    desde: f.desde,
    hasta: f.hasta,
    dias: [...(f.dias_semana ?? DIAS_SEMANA)].sort((a, b) => a - b),
    incluyeClaure: f.incluye_claure,
    estado: ESTADOS.includes(f.estado as EstadoRegla) ? (f.estado as EstadoRegla) : "borrador",
    categoriasSolo: f.categorias_solo ?? [],
    categoriasFuera: f.categorias_fuera ?? [],
    productosSolo: f.productos_solo ?? [],
    insigniasSolo: f.insignias ?? [],
    sedeIds: f.sedes ?? [],
    creadaEn: f.creada_en,
    activadaEn: f.activada_en,
    cambios: f.cambios ?? 0,
    ultimoCambio: f.ultimo_cambio,
    ceden: f.ceden ?? [],
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
export type OfertaEnEdicion = FormaDeOferta & {
  /** `null` mientras es nueva. */
  id: string | null;
  desde: string;
  hasta: string;
  dias: number[];
  categoriasSolo: string[];
  categoriasFuera: string[];
  /** Modelos elegidos uno por uno (ADR-0655); se suman a `categoriasSolo`. Con alguno de los dos, la oferta deja de ser «toda la campaña». */
  productosSolo: string[];
  /** Insignias elegidas (ADR-0655, por insignia); se suman a las categorías y a los modelos, igual que ellos. */
  insigniasSolo: string[];
  /** Tiendas donde rige, dentro de las de su campaña; vacío = todas las de la campaña. */
  sedeIds: string[];
  incluyeClaure: boolean;
  /** El nombre que la persona escribió; vacío = el automático. */
  nombre: string;
  /** Las ofertas que la persona eligió que le cedan a esta («que la otra ceda», ADR-0655). */
  cedeA: string[];
};

/** La forma de fábrica de cada tipo: lo que la hoja propone al elegirlo, lo mismo que dice su botón (3 x 2, «2 por S/ 59.90», «la 2.ª al 50 %»). */
export const FORMA_DE_FABRICA: Record<TipoOferta, Omit<FormaDeOferta, "agrupa">> = {
  pct: { tipo: "pct", porcentaje: PORCENTAJE_DE_FABRICA, lleva: 3, paga: 2, monto: 0 },
  nxm: { tipo: "nxm", porcentaje: 0, lleva: 3, paga: 2, monto: 0 },
  n_por_monto: { tipo: "n_por_monto", porcentaje: 0, lleva: 2, paga: 1, monto: 59.9 },
  nesima_pct: { tipo: "nesima_pct", porcentaje: 50, lleva: 2, paga: 1, monto: 0 },
  // La de la maqueta (Felipe 2026-11-13): S/ 30 menos desde S/ 300, en toda la compra.
  monto: { tipo: "monto", porcentaje: 0, lleva: 3, paga: 2, monto: 0, escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "soles", cuenta: "compra", cedeAOtras: false },
};

export const ofertaNueva = (desde: string, hasta: string): OfertaEnEdicion => ({
  id: null,
  ...FORMA_DE_FABRICA.pct,
  agrupa: "campana",
  desde,
  hasta,
  dias: [...DIAS_SEMANA],
  categoriasSolo: [],
  categoriasFuera: [],
  productosSolo: [],
  insigniasSolo: [],
  sedeIds: [],
  incluyeClaure: false,
  nombre: "",
  cedeA: [],
});

export const ofertaDesdeRegla = (r: ReglaCampana, nombreAutomatico: boolean): OfertaEnEdicion => ({
  id: r.id,
  tipo: r.tipo,
  porcentaje: r.porcentaje,
  lleva: r.lleva,
  paga: r.paga,
  monto: r.monto,
  agrupa: r.agrupa,
  ...(r.tipo === "monto" ? { escalones: (r.escalones ?? []).map((e) => ({ ...e })), ahorroEn: r.ahorroEn ?? "soles", cuenta: r.cuenta ?? "compra", cedeAOtras: r.cedeAOtras ?? false } : {}),
  desde: r.desde,
  hasta: r.hasta,
  dias: [...r.dias],
  categoriasSolo: [...r.categoriasSolo],
  categoriasFuera: [...r.categoriasFuera],
  productosSolo: [...r.productosSolo],
  insigniasSolo: [...r.insigniasSolo],
  sedeIds: [...r.sedeIds],
  incluyeClaure: r.incluyeClaure,
  nombre: nombreAutomatico ? "" : r.nombre,
  cedeA: [...r.ceden],
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

/** Las insignias de una oferta en una frase: «la insignia Rotación», «las insignias Artesanal y Rotación» o «4 insignias». */
export function insigniasDichas(ids: readonly string[], nombreInsignia: (id: string) => string): string | null {
  const nombres = nombresOrdenados(ids, nombreInsignia);
  if (nombres.length === 0) return null;
  if (nombres.length > MAX_CATEGORIAS_NOMBRADAS) return `${nombres.length} insignias`;
  return `${nombres.length === 1 ? "la insignia" : "las insignias"} ${lista(nombres)}`;
}

/** Dónde rige una oferta, en pocas palabras: «Blusas y Faldas», «3 prendas elegidas», «Polos y 2 prendas elegidas», «la insignia Rotación» o
 *  `null` (toda la campaña). `nombreCategoria` nombra también las insignias de `insigniasSolo` (sus ids no se repiten con los de una categoría). */
export function alcanceDicho(
  o: Pick<OfertaEnEdicion, "categoriasSolo"> & { productosSolo?: readonly string[]; insigniasSolo?: readonly string[] },
  nombreCategoria: (id: string) => string,
): string | null {
  const n = o.productosSolo?.length ?? 0;
  const nombres = nombresOrdenados(o.categoriasSolo, nombreCategoria);
  // Una sola lista: «Blusas, Polos y 1 prenda elegida» (no «Blusas y Polos y 1 prenda elegida»).
  const cats = nombres.length > MAX_CATEGORIAS_NOMBRADAS ? [`${nombres.length} categorías`] : nombres;
  const insignias = insigniasDichas(o.insigniasSolo ?? [], nombreCategoria);
  const partes = [...cats, ...(n ? [`${n} ${n === 1 ? "prenda elegida" : "prendas elegidas"}`] : []), ...(insignias ? [insignias] : [])];
  return partes.length ? lista(partes) : null;
}

const soles = (n: number) => `S/\u00a0${n.toFixed(2)}`;

/** Lo que ahorra un escalón de «Gastar un monto y ahorrar» (ADR-0655, actividad 8): «S/ 30 menos» o «10 % menos». */
export function textoDeEscalon(e: { ahorra: number }, ahorroEn: "soles" | "pct"): string {
  return ahorroEn === "pct" ? `${String(e.ahorra).replace(".", ",")} % menos` : `${soles(e.ahorra)} menos`;
}

/** Un escalón entero: «S/ 30 menos desde S/ 300». */
export const titularDeEscalon = (e: { desde: number; ahorra: number }, ahorroEn: "soles" | "pct"): string =>
  `${textoDeEscalon(e, ahorroEn)} desde ${soles(e.desde)}`;

/** Un monto por su primer escalón (el que abre la oferta): «S/ 30 menos desde S/ 300». */
export const titularDeMonto = (escalones: readonly { desde: number; ahorra: number }[], ahorroEn: "soles" | "pct"): string =>
  escalones.length > 0 ? titularDeEscalon(escalones[0], ahorroEn) : "Por monto";

/** Lo que da la oferta, en grande y en pocas letras: «−20 %», «3 x 2», «3 por S/ 100.00», «La 2.ª al 50 %», «S/ 30 menos desde S/ 300». */
export function titularDeOferta(f: Pick<FormaDeOferta, "tipo" | "porcentaje" | "lleva" | "paga" | "monto"> & Partial<Pick<FormaDeOferta, "escalones" | "ahorroEn">>): string {
  const pctTxt = String(f.porcentaje).replace(".", ",");
  if (f.tipo === "monto") return titularDeMonto(f.escalones ?? [], f.ahorroEn ?? "soles");
  if (f.tipo === "nxm") return `${f.lleva} x ${f.paga}`;
  if (f.tipo === "n_por_monto") return `${f.lleva} por ${soles(f.monto)}`;
  if (f.tipo === "nesima_pct") return `La ${f.lleva}.ª al ${pctTxt} %`;
  return `−${pctTxt} %`;
}

/** «Toda la campaña · −20 % · mar y jue» · «Blusas y Faldas · −20 % · Trujillo» · «Polos · 3 x 2». */
export function nombreAutomatico(
  o: Pick<OfertaEnEdicion, "porcentaje" | "dias" | "categoriasSolo"> &
    Partial<Pick<FormaDeOferta, "tipo" | "lleva" | "paga" | "monto" | "escalones" | "ahorroEn" | "cuenta">> & {
      sedeIds?: readonly string[];
      productosSolo?: readonly string[];
      insigniasSolo?: readonly string[];
    },
  nombreCategoria: (id: string) => string,
  nombreSede: (id: string) => string = () => "",
): string {
  const alcance = alcanceDicho(o, nombreCategoria);
  // «La insignia Rotación · −20 %»: el nombre empieza en mayúscula aunque el alcance empiece por «la insignia».
  const donde = o.tipo === "monto" && o.cuenta !== "campana" ? "Toda la compra" : alcance ? alcance.charAt(0).toUpperCase() + alcance.slice(1) : "Toda la campaña";
  const dias = textoDiasCorto(o.dias);
  const tiendas = lista(nombresDeTiendas(o.sedeIds ?? [], nombreSede));
  const titular = titularDeOferta({ tipo: o.tipo ?? "pct", porcentaje: o.porcentaje, lleva: o.lleva ?? 3, paga: o.paga ?? 2, monto: o.monto ?? 0, escalones: o.escalones, ahorroEn: o.ahorroEn });
  const t = `${donde} · ${titular}${dias ? ` · ${dias}` : ""}${tiendas ? ` · ${tiendas}` : ""}`;
  return t.length > MAX_NOMBRE ? `${t.slice(0, MAX_NOMBRE - 1)}…` : t;
}

export const nombreDeOferta = (o: OfertaEnEdicion, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): string =>
  o.nombre.trim() || nombreAutomatico(o, nombreCategoria, nombreSede);

/** Si el nombre guardado es el que habría salido solo (para no tratar de «a mano» uno automático). */
export const esNombreAutomatico = (r: ReglaCampana, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): boolean =>
  r.nombre ===
  nombreAutomatico(
    { tipo: r.tipo, porcentaje: r.porcentaje, lleva: r.lleva, paga: r.paga, monto: r.monto, escalones: r.escalones, ahorroEn: r.ahorroEn, cuenta: r.cuenta, dias: r.dias, categoriasSolo: r.categoriasSolo, productosSolo: r.productosSolo, insigniasSolo: r.insigniasSolo, sedeIds: r.sedeIds },
    nombreCategoria,
    nombreSede,
  );

/** «del 26 oct al 31 oct» · «el 26 oct». */
export const textoFechas = (desde: string, hasta: string): string => {
  const f = (x: string) => fechaCorta(x).replace(/\.$/, ""); // «26 oct.» → «26 oct»: la frase cierra con su propio punto
  return desde === hasta ? `el ${f(desde)}` : `del ${f(desde)} al ${f(hasta)}`;
};

/** «20 % menos en todas las prendas de la campaña, los martes y jueves, del 26 oct al 31 oct.» */
export function fraseDeOferta(o: OfertaEnEdicion, nombreCategoria: (id: string) => string, nombreSede: (id: string) => string = () => ""): string {
  const alcance = alcanceDicho(o, nombreCategoria);
  const donde = alcance ? `solo en ${alcance}` : "en todas las prendas de la campaña";
  const fuera = o.categoriasFuera.length ? ` (menos ${lista(nombresOrdenados(o.categoriasFuera, nombreCategoria).map((n) => n.toLowerCase()))})` : "";
  const dias = textoDias(o.dias);
  const tiendas = lista(nombresDeTiendas(o.sedeIds, nombreSede));
  if (o.tipo === "monto") {
    // «S/ 30 menos desde S/ 300, S/ 60 menos desde S/ 500 en toda la compra, sin contar las prendas que ya tienen otra oferta, …» (la maqueta).
    const escalones = (o.escalones ?? []).map((e) => titularDeEscalon(e, o.ahorroEn ?? "soles")).join(", ");
    const que = o.cuenta === "campana" ? `comprando ${alcance ? alcance : "prendas de la campaña"}${fuera}` : `en toda la compra${fuera}`;
    const sinOtras = o.cedeAOtras ? ", sin contar las prendas que ya tienen otra oferta" : "";
    return `${escalones} ${que}${sinOtras}${o.incluyeClaure ? ", con las prendas de Claurè" : ""}${tiendas ? `, solo en ${tiendas}` : ""}${dias ? `, ${dias}` : ""}, ${textoFechas(o.desde, o.hasta)}.`;
  }
  if (esDeGrupo(o.tipo)) {
    // «Quien lleva 3 prendas de Polos (se pueden mezclar) paga 2: la más barata va gratis, …» (la frase de la maqueta).
    const de = `${alcance ? ` de ${alcance}` : " de la campaña"}${fuera}${o.agrupa === "modelo" ? " del mismo modelo" : " (se pueden mezclar)"}`;
    const que =
      o.tipo === "nxm"
        ? `Quien lleva ${o.lleva} prendas${de} paga ${o.paga}: ${o.lleva - o.paga === 1 ? "la más barata va" : `las ${o.lleva - o.paga} más baratas van`} gratis`
        : o.tipo === "n_por_monto"
          ? `${o.lleva} prendas${de} cuestan ${soles(o.monto)}`
          : `Cada ${o.lleva} prendas${de}, la más barata tiene ${String(o.porcentaje).replace(".", ",")} % menos`;
    return `${que}${o.incluyeClaure ? ", con las prendas de Claurè" : ""}${tiendas ? `, solo en ${tiendas}` : ""}${dias ? `, ${dias}` : ""}, ${textoFechas(o.desde, o.hasta)}.`;
  }
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
  p.push(...problemasDeForma(o));
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

/** Lo que impide guardar la forma de la oferta (los mismos límites que `guardar_oferta_completa` y el candado `campana_reglas_forma`). */
export function problemasDeForma(f: Pick<FormaDeOferta, "tipo" | "porcentaje" | "lleva" | "paga" | "monto"> & Partial<Pick<FormaDeOferta, "escalones" | "ahorroEn" | "cuenta">>): string[] {
  const entero = (n: number) => Number.isInteger(n);
  if (f.tipo === "monto") return problemasDeMonto(f.escalones ?? [], f.ahorroEn ?? "soles");
  if (f.tipo === "pct") {
    return !Number.isFinite(f.porcentaje) || f.porcentaje <= 0 || f.porcentaje > PORCENTAJE_MAX ? [`El descuento tiene que ir de 1 a ${PORCENTAJE_MAX} %.`] : [];
  }
  if (!entero(f.lleva) || f.lleva < LLEVA_MIN || f.lleva > LLEVA_MAX) return [`Un grupo se arma con ${LLEVA_MIN} a ${LLEVA_MAX} prendas.`];
  if (f.tipo === "nxm" && (!entero(f.paga) || f.paga < 1 || f.paga >= f.lleva)) return [`Si lleva ${f.lleva}, paga de 1 a ${f.lleva - 1}.`];
  if (f.tipo === "n_por_monto" && (!Number.isFinite(f.monto) || f.monto <= 0)) return ["Pon cuánto cuesta el grupo."];
  if (f.tipo === "nesima_pct" && (!Number.isFinite(f.porcentaje) || f.porcentaje <= 0 || f.porcentaje > 100)) return [`El descuento de la ${f.lleva}.ª va de 1 a 100 %.`];
  return [];
}

/** Lo que impide guardar los escalones de un monto (lo mismo que `fn_escalones_validos`), en el orden en que se llenan. */
export function problemasDeMonto(escalones: readonly EscalonDeMonto[], ahorroEn: "soles" | "pct"): string[] {
  const centimos = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
  if (escalones.length < 1 || escalones.length > MAX_ESCALONES) return [`Un monto lleva de 1 a ${MAX_ESCALONES} escalones.`];
  for (const [i, e] of escalones.entries()) {
    if (!Number.isFinite(e.desde) || e.desde <= 0 || !Number.isFinite(e.ahorra) || e.ahorra <= 0) return ["Pon desde cuánto y cuánto ahorra."];
    if (!centimos(e.desde) || !centimos(e.ahorra)) return ["Los montos van hasta con céntimos, no más."];
    if (ahorroEn === "soles" && e.ahorra >= e.desde) return ["El ahorro tiene que ser menor que el monto."];
    if (ahorroEn === "pct" && e.ahorra > PORCENTAJE_MAX) return [`El ahorro va de 1 a ${PORCENTAJE_MAX} %.`];
    if (i > 0 && (e.desde <= escalones[i - 1].desde || e.ahorra <= escalones[i - 1].ahorra)) return ["Cada escalón va desde más y ahorra más que el anterior."];
  }
  return [];
}

/** Cuántas prendas puede tener un grupo (la base exige lo mismo). */
export const LLEVA_MIN = 2;
export const LLEVA_MAX = 10;

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
  /** La forma (ADR-0655, actividad 6). Sin ella, «un % menos». Con una de grupo, la ruta llama a `guardar_oferta_completa`. */
  forma: Omit<FormaDeOferta, "porcentaje">;
  /** La oferta que se edita era de grupo: aunque vuelva a «un % menos», va por `guardar_oferta_completa` para guardar su forma nueva. */
  eraDeGrupo: boolean;
  desde: string;
  hasta: string;
  dias: number[];
  categoriasSolo: string[];
  categoriasFuera: string[];
  /** Modelos elegidos uno por uno (ADR-0655). Con alguno, la ruta llama a `guardar_oferta`; sin ninguno, a `guardar_campana_regla` de siempre. */
  productosSolo: string[];
  /** La oferta que se edita tenía modelos: aunque ahora no lleve ninguno, se guarda por `guardar_oferta` para quitárselos. */
  teniaModelos: boolean;
  /** Insignias elegidas (ADR-0655, por insignia). Con alguna —o si las tenía— la ruta llama a `guardar_oferta_completa`, que las guarda. */
  insigniasSolo: string[];
  teniaInsignias: boolean;
  /** Las ofertas que le ceden («que la otra ceda», ADR-0655). Con alguna —o si le cedían antes— la ruta llama a `guardar_oferta_y_ceder`. */
  cedeA: string[];
  teniaCesiones: boolean;
  sedeIds: string[];
  incluyeClaure: boolean;
  /** Activarla ya (rige desde su fecha) o dejarla como borrador; lo hace quien tiene la llave de campañas (ADR-0534). */
  activar: boolean;
};

/** El tope de modelos sueltos de una oferta: el mismo que exige `guardar_oferta` (20261113210000). */
export const MAX_PRODUCTOS_SOLO = 500;
/** El tope de insignias de una oferta: el mismo que exige `guardar_oferta_completa` (20261114060000). */
export const MAX_INSIGNIAS_SOLO = 20;

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
  const productos = lista(c.productosSolo);
  if (!productos.every(esTextoUuid)) return { ok: false, error: "Una de las prendas elegidas no es válida." };
  if (productos.length > MAX_PRODUCTOS_SOLO) return { ok: false, error: `Una oferta puede elegir hasta ${MAX_PRODUCTOS_SOLO} modelos sueltos. Para más, elige sus categorías.` };
  const insignias = lista(c.insigniasSolo);
  if (!insignias.every(esTextoUuid)) return { ok: false, error: "Una de las insignias elegidas no es válida." };
  if (new Set(insignias).size > MAX_INSIGNIAS_SOLO) return { ok: false, error: `Una oferta puede elegir hasta ${MAX_INSIGNIAS_SOLO} insignias.` };
  const cede = lista(c.cedeA);
  if (!cede.every(esTextoUuid)) return { ok: false, error: "Una de las ofertas que cede no es válida." };
  if (c.id != null && cede.includes(c.id)) return { ok: false, error: "Una oferta no puede cederse a sí misma." };
  const f = (typeof c.forma === "object" && c.forma !== null ? c.forma : {}) as Record<string, unknown>;
  const tipo: TipoOferta = TIPOS.includes(f.tipo as TipoOferta) ? (f.tipo as TipoOferta) : "pct";
  const num = (v: unknown, de: number) => (typeof v === "number" && Number.isFinite(v) ? v : de);
  const forma: Omit<FormaDeOferta, "porcentaje"> = {
    tipo,
    lleva: num(f.lleva, 3),
    paga: num(f.paga, 2),
    monto: num(f.monto, 0),
    agrupa: f.agrupa === "modelo" ? "modelo" : "campana",
    ...(tipo === "monto"
      ? {
          escalones: Array.isArray(f.escalones) ? f.escalones.map((e) => ({ desde: num((e as Record<string, unknown>)?.desde, 0), ahorra: num((e as Record<string, unknown>)?.ahorra, 0) })) : [],
          ahorroEn: f.ahorroEn === "pct" ? ("pct" as const) : ("soles" as const),
          cuenta: f.cuenta === "campana" ? ("campana" as const) : ("compra" as const),
          cedeAOtras: f.cedeAOtras === true,
        }
      : {}),
  };
  const problemaForma = problemasDeForma({ ...forma, porcentaje: c.porcentaje })[0];
  if (problemaForma) return { ok: false, error: problemaForma };
  return {
    ok: true,
    valor: {
      id: (c.id as string | null | undefined) ?? null,
      etiquetaId: c.etiquetaId,
      nombre: c.nombre.trim(),
      porcentaje: c.porcentaje,
      forma,
      eraDeGrupo: c.eraDeGrupo === true,
      desde: c.desde,
      hasta: c.hasta,
      dias: ordenados(c.dias as number[]),
      categoriasSolo: solo as string[],
      categoriasFuera: fuera as string[],
      productosSolo: [...new Set(productos as string[])],
      teniaModelos: c.teniaModelos === true,
      insigniasSolo: [...new Set(insignias as string[])],
      teniaInsignias: c.teniaInsignias === true,
      cedeA: [...new Set(cede as string[])],
      teniaCesiones: c.teniaCesiones === true,
      sedeIds: sedes as string[],
      incluyeClaure: c.incluyeClaure === true,
      activar: c.activar === true,
    },
  };
}

// ---- Ayudas de la hoja: atajos de fechas y «antes: …» -------------------------------------------------------------------

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

// ---- Una prenda, una oferta por tienda y por día (ADR-0655) -------------------------------------------------------------------------
// Con qué choca la oferta de la hoja lo dice la base (`fn_choques_de_oferta`, 20261113223000): alcanzar prendas, tiendas y días es la misma regla
// de la caja y no se repite aquí. Lo de abajo solo decide qué falta resolver y cómo decirlo.

/** Una fila cruda de `fn_choques_de_oferta`: la otra oferta (o un descuento de siempre) y una tienda donde las dos regirían algún mismo día. */
export type FilaChoque = {
  otra_tipo: string;
  otra_id: string;
  otra_nombre: string;
  campana_nombre: string;
  ubicacion_id: string;
  ubicacion_nombre: string;
  prendas: number;
  /** Ya hay una cesión entre las dos (en cualquier sentido). */
  cedida: boolean;
  /** Con la forma de un monto (la de 13 datos, 20261114044000): si la otra es otro monto y cuántas prendas alcanza esta oferta. */
  otra_es_monto?: boolean | null;
  mias?: number | null;
};

/** Un choque, juntando las tiendas: «choca con X en Lima y Trujillo, en N prendas». */
export type Choque = {
  tipo: "oferta" | "descuento";
  id: string;
  nombre: string;
  /** El nombre de su campaña o insignia, si no es el mismo de la oferta. */
  deCampana: string | null;
  tiendas: string[];
  /** Las prendas en común: el mayor de sus tiendas (las mismas en todas, salvo la tienda). */
  prendas: number;
  /** Ya resuelto en la base porque ESTA le cede a la otra (la otra gana). */
  estaCede: boolean;
  /** Ya había una cesión guardada a favor de esta. */
  cedidaGuardada: boolean;
  /** La otra es otro monto: con un monto no se resuelve con «que no cuenten» (dos montos nunca se reparten una prenda). */
  esMonto: boolean;
  /** La otra tiene TODAS las prendas que alcanza esta, en alguna de sus tiendas: ahí un monto que cede no le llega a nadie. */
  todaLaTienda: boolean;
};

/** Junta las filas por la otra oferta, con sus tiendas en orden. `cedenAntes`: quiénes le cedían a esta al abrirla (para saber en qué sentido
 *  va una cesión que la base ya tiene). */
export function choquesDeFilas(filas: readonly FilaChoque[], cedenAntes: readonly string[]): Choque[] {
  const por = new Map<string, Choque>();
  for (const f of filas) {
    const tipo = f.otra_tipo === "descuento" ? "descuento" : "oferta";
    const clave = `${tipo}|${f.otra_id}`;
    const ya = por.get(clave);
    const tienda = f.ubicacion_nombre.replace(/^Tienda\s+/i, "");
    const toda = f.mias != null && Number(f.mias) > 0 && (Number(f.prendas) || 0) >= Number(f.mias);
    if (ya) {
      if (!ya.tiendas.includes(tienda)) ya.tiendas.push(tienda);
      ya.prendas = Math.max(ya.prendas, Number(f.prendas) || 0);
      ya.todaLaTienda = ya.todaLaTienda || toda;
      continue;
    }
    const cedida = tipo === "oferta" && f.cedida === true;
    por.set(clave, {
      tipo,
      id: f.otra_id,
      nombre: f.otra_nombre,
      deCampana: tipo === "oferta" && f.campana_nombre && f.campana_nombre !== f.otra_nombre ? f.campana_nombre : null,
      tiendas: [tienda],
      prendas: Number(f.prendas) || 0,
      estaCede: cedida && !cedenAntes.includes(f.otra_id),
      cedidaGuardada: cedida && cedenAntes.includes(f.otra_id),
      esMonto: f.otra_es_monto === true,
      todaLaTienda: toda,
    });
  }
  return [...por.values()]
    .map((c) => ({ ...c, tiendas: [...c.tiendas].sort((a, b) => a.localeCompare(b, "es")) }))
    .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, "es") : a.tipo === "descuento" ? -1 : 1));
}

/** ¿Este choque ya no impide activar? Si esta le cede a la otra (guardado), o si la persona eligió que la otra ceda. Un descuento de siempre no
 *  cede: se resuelve retirándolo o cambiando la oferta. Y un monto que eligió «que las prendas con otra oferta no cuenten» (`cedeAOtras`) ya no
 *  choca con lo que no es otro monto (decisión 3 de Felipe). */
export const choqueResuelto = (c: Choque, cedeA: readonly string[], cedeAOtras = false): boolean =>
  (cedeAOtras && !c.esMonto) || (c.tipo === "oferta" && (c.estaCede || cedeA.includes(c.id)));

/** Lo que todavía impide activar (o guardar una que ya rige). */
export const choquesSinResolver = (choques: readonly Choque[], cedeA: readonly string[], cedeAOtras = false): Choque[] =>
  choques.filter((c) => !choqueResuelto(c, cedeA, cedeAOtras));

/** Al guardar solo viajan las cesiones que siguen haciendo falta: una que ya no choca se suelta sola. */
export const cesionesQueQuedan = (choques: readonly Choque[], cedeA: readonly string[]): string[] =>
  cedeA.filter((id) => choques.some((c) => c.tipo === "oferta" && c.id === id && !c.estaCede));

/** El título de un choque, en una línea: «Choca con «Polos 3x2» en Lima y Trujillo». */
export const tituloDeChoque = (c: Choque): string => `Choca con «${c.nombre}»${c.deCampana ? ` (de ${c.deCampana})` : ""} en ${lista(c.tiendas)}`;

/** Lo que pasa y lo que se puede hacer, en una frase. */
export function fraseDeChoque(c: Choque): string {
  const prendas = `${c.prendas} ${c.prendas === 1 ? "prenda tendría" : "prendas tendrían"} dos ofertas el mismo día`;
  if (c.tipo === "descuento") return `${prendas}: es el descuento de siempre de «${c.nombre}». Retíralo, o cambia las tiendas, las fechas o las prendas.`;
  if (c.estaCede) return `${prendas}, pero esta oferta le cede: donde las dos valdrían, vale «${c.nombre}».`;
  return `${prendas}. Una prenda tiene una sola oferta por tienda y por día.`;
}

/** Cómo estaba una oferta antes de su último cambio, en una frase corta: «−15 % · 24 oct – 31 oct · mar y jue». Vacío si no se sabe. */
export function resumenAntes(antes: Record<string, unknown> | null, actual?: Pick<FormaDeOferta, "tipo" | "lleva">): string {
  if (!antes) return "";
  // `null` es «sin %» (un 3x2, N por S/ o un monto), no «0 %»: `Number(null)` daba «antes: −0 %».
  const pct = antes.porcentaje == null ? NaN : Number(antes.porcentaje);
  // La fila que guarda `guardar_campana_regla` no dice su forma: es la de la oferta. Con «la N.ª al X %», ese % es el de la N.ª, no un «% menos».
  const tipo = typeof antes.tipo === "string" && TIPOS.includes(antes.tipo as TipoOferta) ? (antes.tipo as TipoOferta) : (actual?.tipo ?? "pct");
  const desde = typeof antes.desde === "string" ? antes.desde : "";
  const hasta = typeof antes.hasta === "string" ? antes.hasta : "";
  const dias = Array.isArray(antes.dias_semana) ? (antes.dias_semana as unknown[]).filter((d): d is number => typeof d === "number") : [];
  const partes = [
    tipo !== "pct" && antes.tipo === undefined
      ? tipo === "nesima_pct" && Number.isFinite(pct)
        ? titularDeOferta({ tipo, porcentaje: pct, lleva: actual?.lleva ?? 2, paga: 1, monto: 0 })
        : ""
      : tipo !== "pct"
      ? titularDeOferta({
          tipo, porcentaje: pct, lleva: Number(antes.lleva ?? 0), paga: Number(antes.paga ?? 0), monto: Number(antes.monto ?? 0),
          escalones: escalonesDeFila(antes.escalones) ?? [], ahorroEn: antes.ahorro_en === "pct" ? "pct" : "soles",
        })
      : Number.isFinite(pct) ? `−${String(pct).replace(".", ",")} %` : "",
    desde && hasta ? `${fechaCorta(desde).replace(/\.$/, "")} – ${fechaCorta(hasta).replace(/\.$/, "")}` : "",
    dias.length && dias.length < 7 ? textoDiasCorto(dias) : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

// ---- Cuántas prendas alcanza una oferta (lo que dicen los conteos de la hoja) -------------------------------------------------------

/** Una insignia que una oferta puede elegir (ADR-0655, por insignia). `activa` = activa y aprobada: solo esas se ofrecen. */
export type InsigniaDeOferta = { id: string; nombre: string; activa: boolean; categoriaIds: string[] };

export type PrendaDeCampana = {
  id: string;
  categoriaId: string | null;
  deClaure?: boolean;
  modelo?: string;
  productoId?: string;
  /** Las insignias que lleva (marcada a mano o por una categoría de la insignia): las que una oferta «por insignia» alcanza. */
  insignias?: readonly string[];
};

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
  o: Pick<OfertaEnEdicion, "categoriasSolo" | "categoriasFuera" | "incluyeClaure"> & { productosSolo?: readonly string[]; insigniasSolo?: readonly string[] } & Partial<
      Pick<FormaDeOferta, "tipo" | "cuenta">
    >,
): P[] {
  // Un monto de toda la compra (actividad 8) cuenta todo el catálogo, salvo Claurè si no la incluye y lo que deja fuera.
  if (o.tipo === "monto" && o.cuenta !== "campana") return prendasDelCatalogo.filter((p) => (o.incluyeClaure || !p.deClaure) && !(p.categoriaId && o.categoriasFuera.includes(p.categoriaId)));
  // Con categorías «solo», modelos o insignias elegidos (ADR-0655), la oferta rige en ESAS categorías, ESOS modelos y las prendas de ESAS
  // insignias, estén o no en la campaña (`fn_oferta_alcanza_variante_con_insignias`).
  const productos = o.productosSolo ?? [];
  const insignias = o.insigniasSolo ?? [];
  const elegida = o.categoriasSolo.length > 0 || productos.length > 0 || insignias.length > 0;
  return (elegida ? prendasDelCatalogo : prendasDeLaCampana).filter((p) => {
    if (!o.incluyeClaure && p.deClaure) return false;
    const c = p.categoriaId;
    const porInsignia = insignias.length > 0 && (p.insignias ?? []).some((i) => insignias.includes(i));
    if (elegida && !((c && o.categoriasSolo.includes(c)) || (p.productoId && productos.includes(p.productoId)) || porInsignia)) return false;
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
