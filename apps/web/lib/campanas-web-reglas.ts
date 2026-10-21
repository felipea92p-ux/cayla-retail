// Tienda web ▸ Campañas (maqueta docs/maquetas/campanas-tienda-2026-10): la lista de las campañas de la tienda online con el diseño que
// tiene cada una. Lógica pura: se importa desde el servidor y desde el cliente, y se prueba con `campanas-web-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_campanas_web()` sin caerse ante un dato raro (una campaña a medias no se dibuja; una lectura
//            que no es de la forma pedida es `null` y la pantalla lo dice); las cifras, los filtros, la línea de tiempo y los cruces; y
//            cada campaña en palabras de tienda («Termina en 5 días», «Borrador · Navidad»).
//   ASUME:   que la base decide qué campañas hay (etiquetas de estilo campana, aprobadas, activas y con %) y cuál es su estado con la
//            fecha de Lima; aquí no se vuelve a calcular qué es una campaña, solo cómo se cuenta y se dice.
//   NO HACE: leer la base ni decidir permisos (lo hace `fn_exigir_modulo('campanas_web')`), ni tocar fechas, % o prendas: eso se arma en
//            Catálogo ▸ Etiquetas (una sola fuente de verdad: la tienda nunca dice un precio distinto al de la caja).

import { nombreDeAmbiente } from "@cayla-retail/shared";
import { diasEntreFechas, sumarDias } from "./fechas-lima";

export type EstadoCampana = "vivo" | "prog" | "fin";
export type ModoDiseno = "ambiente" | "imagen";
export type EstadoDiseno = "borrador" | "programado";

export type DisenoDeCampana = {
  modo: ModoDiseno;
  /** La clave del ambiente (solo con `modo = ambiente`). */
  plantilla: string | null;
  estado: EstadoDiseno;
  imagenRuta: string | null;
  version: number;
};

export type CampanaWeb = {
  id: string;
  nombre: string;
  /** El % de la etiqueta; `null` si la etiqueta no lo trae (la base no lo deja, pero no se asume). */
  pct: number | null;
  desde: string | null;
  hasta: string | null;
  estado: EstadoCampana;
  /** Modelos que toca la campaña (no tallas). */
  prendas: number;
  diseno: DisenoDeCampana | null;
};

export type LecturaCampanasWeb = { hoy: string; campanas: CampanaWeb[] };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const fechaIso = (v: unknown): string | null => {
  const t = texto(v);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const entero = (v: unknown): number => Math.max(0, Math.trunc(numero(v) ?? 0));

function disenoDeJson(v: unknown): DisenoDeCampana | null {
  if (!esObjeto(v)) return null;
  const modo = v.modo === "ambiente" || v.modo === "imagen" ? v.modo : null;
  const estado = v.estado === "programado" ? "programado" : v.estado === "borrador" ? "borrador" : null;
  if (!modo || !estado) return null;
  return { modo, plantilla: texto(v.plantilla), estado, imagenRuta: texto(v.imagen_ruta), version: Math.max(1, entero(v.version)) };
}

/** Una campaña como la manda la base, o `null` si le falta lo que la identifica (no se dibuja a medias). */
export function campanaDeJson(v: unknown): CampanaWeb | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const nombre = texto(v.nombre);
  const estado = v.estado === "vivo" || v.estado === "prog" || v.estado === "fin" ? v.estado : null;
  if (!id || !nombre || !estado) return null;
  return {
    id,
    nombre,
    pct: numero(v.pct),
    desde: fechaIso(v.desde),
    hasta: fechaIso(v.hasta),
    estado,
    prendas: entero(v.prendas),
    diseno: disenoDeJson(v.diseno),
  };
}

/** Lo que devolvió `fn_campanas_web()`; `null` si no es de la forma pedida (la pantalla lo dice en vez de mostrar una lista vacía que
 *  parecería «no hay campañas»). */
export function leerCampanasWeb(dato: unknown): LecturaCampanasWeb | null {
  if (!esObjeto(dato) || !Array.isArray(dato.campanas)) return null;
  const hoy = fechaIso(dato.hoy);
  if (!hoy) return null;
  return { hoy, campanas: dato.campanas.map(campanaDeJson).filter((c): c is CampanaWeb => c !== null) };
}

// ---------------------------------------------------------------- Palabras de tienda

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «12 oct» de una fecha `aaaa-mm-dd`. */
export function fechaCortaDicha(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1] ?? ""}`.trim();
}

/** «12 oct – 25 oct», «desde el 12 oct», «hasta el 25 oct» o «Sin fecha de término». */
export function vigenciaDicha(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `${fechaCortaDicha(desde)} – ${fechaCortaDicha(hasta)}`;
  if (desde) return `Desde el ${fechaCortaDicha(desde)}`;
  if (hasta) return `Hasta el ${fechaCortaDicha(hasta)}`;
  return "Sin fecha de término";
}

const NB = String.fromCharCode(160);
const MENOS = String.fromCharCode(8722);

/** «−20 %» con un espacio que no se parte (en un celular angosto el signo no se separa de su número); sin % no inventa uno. */
export function pctDicho(pct: number | null): string {
  if (pct === null) return "—";
  return `${MENOS}${Number(pct.toFixed(2))}${NB}%`;
}

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** «Termina hoy», «Termina en 5 días», «Empieza mañana», «Empieza en 12 días», «Terminó hace 3 días». */
export function cuandoDicho(c: Pick<CampanaWeb, "estado" | "desde" | "hasta">, hoy: string): string {
  if (c.estado === "vivo") {
    if (!c.hasta) return "Sin fecha de término";
    const n = diasEntreFechas(hoy, c.hasta);
    return n <= 0 ? "Termina hoy" : `Termina en ${dias(n)}`;
  }
  if (c.estado === "prog") {
    if (!c.desde) return "Por empezar";
    const n = diasEntreFechas(hoy, c.desde);
    return n <= 1 ? "Empieza mañana" : `Empieza en ${dias(n)}`;
  }
  if (!c.hasta) return "Terminada";
  const n = diasEntreFechas(c.hasta, hoy);
  return n <= 1 ? "Terminó ayer" : `Terminó hace ${dias(n)}`;
}

export const ESTADO_DICHO: Record<EstadoCampana, string> = { vivo: "En vivo", prog: "Programada", fin: "Terminada" };

/** Cómo se llama el diseño de una campaña, y de qué color va su insignia: sin diseño no dice nada de más. */
export function disenoDicho(d: DisenoDeCampana | null): { texto: string; borrador: boolean } {
  if (!d) return { texto: "Sin diseño", borrador: false };
  const nombre = d.modo === "imagen" ? "Imagen propia" : (nombreDeAmbiente(d.plantilla) ?? "Ambiente");
  return { texto: d.estado === "borrador" ? `Borrador · ${nombre}` : nombre, borrador: d.estado === "borrador" };
}

// ---------------------------------------------------------------- Cifras y filtros

export type FiltroCampanas = "todas" | EstadoCampana;

export type CifrasCampanas = {
  enVivo: number;
  /** La que termina primero entre las vivas: la que la tienda anuncia (como la portada). */
  vivaPrimera: CampanaWeb | null;
  programadas: number;
  proxima: CampanaWeb | null;
  /** Campañas vivas o por empezar que se verán «como siempre» porque no tienen diseño. */
  sinDiseno: number;
};

const finDe = (c: CampanaWeb) => c.hasta ?? "9999-12-31";

export function cifrasCampanas(campanas: readonly CampanaWeb[]): CifrasCampanas {
  const vivas = campanas.filter((c) => c.estado === "vivo");
  const prog = campanas.filter((c) => c.estado === "prog");
  return {
    enVivo: vivas.length,
    vivaPrimera: [...vivas].sort((a, b) => finDe(a).localeCompare(finDe(b)) || a.nombre.localeCompare(b.nombre))[0] ?? null,
    programadas: prog.length,
    proxima: [...prog].sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "") || a.nombre.localeCompare(b.nombre))[0] ?? null,
    sinDiseno: campanas.filter((c) => c.estado !== "fin" && !c.diseno).length,
  };
}

export const filtrarCampanas = (campanas: readonly CampanaWeb[], filtro: FiltroCampanas): CampanaWeb[] =>
  filtro === "todas" ? [...campanas] : campanas.filter((c) => c.estado === filtro);

export function contarPorFiltro(campanas: readonly CampanaWeb[]): Record<FiltroCampanas, number> {
  return {
    todas: campanas.length,
    vivo: campanas.filter((c) => c.estado === "vivo").length,
    prog: campanas.filter((c) => c.estado === "prog").length,
    fin: campanas.filter((c) => c.estado === "fin").length,
  };
}

// ---------------------------------------------------------------- Cruces

export type Cruce = { gana: CampanaWeb; otra: CampanaWeb; desde: string; hasta: string | null };

/** Las parejas de campañas (vivas o por empezar) que coinciden en fechas. La tienda muestra el diseño de UNA: la que termina primero
 *  (la misma regla de la franja y de `tienda_portada`; sin fecha de término, al final; empate, el nombre). Una campaña sin fecha de inicio
 *  empieza desde siempre. */
export function crucesDeCampanas(campanas: readonly CampanaWeb[]): Cruce[] {
  const activas = campanas.filter((c) => c.estado !== "fin");
  const cruces: Cruce[] = [];
  for (let i = 0; i < activas.length; i++) {
    for (let j = i + 1; j < activas.length; j++) {
      const a = activas[i]!;
      const b = activas[j]!;
      const desde = [a.desde ?? "0000-01-01", b.desde ?? "0000-01-01"].sort().at(-1)!;
      const fin = [finDe(a), finDe(b)].sort()[0]!;
      if (desde > fin) continue;
      const aGana = finDe(a).localeCompare(finDe(b)) < 0 || (finDe(a) === finDe(b) && a.nombre.localeCompare(b.nombre) <= 0);
      cruces.push({ gana: aGana ? a : b, otra: aGana ? b : a, desde: desde === "0000-01-01" ? "" : desde, hasta: fin === "9999-12-31" ? null : fin });
    }
  }
  return cruces;
}

// ---------------------------------------------------------------- Línea de tiempo (los próximos 3 meses)

export type BarraDeTiempo = { campana: CampanaWeb; izquierda: number; ancho: number };
export type LineaDeTiempo = { meses: { nombre: string; izquierda: number; ancho: number }[]; barras: BarraDeTiempo[]; hoy: number };

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Tres meses desde el 1.º del mes de hoy. Cada barra va en % del ancho, recortada a la ventana; las terminadas no salen y una campaña
 *  fuera de la ventana tampoco. */
export function lineaDeTiempo(campanas: readonly CampanaWeb[], hoy: string, meses = 3): LineaDeTiempo {
  const ini = `${hoy.slice(0, 7)}-01`;
  const [a, m] = ini.split("-").map(Number) as [number, number];
  const finMes = (k: number) => {
    const t = new Date(Date.UTC(a, m - 1 + k, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
  };
  const fin = finMes(meses);
  const total = diasEntreFechas(ini, fin);
  const pct = (dias: number) => (dias / total) * 100;
  const mesesDibujados = Array.from({ length: meses }, (_, k) => {
    const d0 = finMes(k);
    const d1 = finMes(k + 1);
    return { nombre: MESES_LARGOS[Number(d0.slice(5, 7)) - 1]!, izquierda: pct(diasEntreFechas(ini, d0)), ancho: pct(diasEntreFechas(d0, d1)) };
  });
  const barras: BarraDeTiempo[] = [];
  for (const c of campanas) {
    if (c.estado === "fin") continue;
    const desde = c.desde && c.desde > ini ? c.desde : ini;
    const hastaInclusive = c.hasta ?? sumarDias(fin, -1);
    const hasta = hastaInclusive < sumarDias(fin, -1) ? hastaInclusive : sumarDias(fin, -1);
    if (desde > hasta) continue;
    barras.push({ campana: c, izquierda: pct(diasEntreFechas(ini, desde)), ancho: pct(diasEntreFechas(desde, hasta) + 1) });
  }
  return { meses: mesesDibujados, barras, hoy: pct(diasEntreFechas(ini, hoy)) };
}
