// La lista viva de Tienda web ▸ Vitrina ▸ Probador (ADR-0434, actividad 3): qué le falta a cada prenda publicada para salir en el
// probador de «Arma el tuyo». Lógica pura, sin navegador. Lee `fn_vitrina_probador()` (20261017015000).
//
// Una prenda sale en el probador si tiene un LARGO (el suyo o el típico de su categoría) y al menos un RECORTE listo. Las fotos por color
// no la frenan: un color sin foto propia se elige igual y la figura muestra otra foto de la prenda (Felipe, 2026-10-16: solo fotos
// reales), pero la lista lo dice para planear las sesiones de fotos.

/** El largo más corto y el más largo que acepta la base (`vitrina_productos_largo`). */
export const LARGO_MINIMO = 5;
export const LARGO_MAXIMO = 250;

export type ColorDePrenda = { codigo: string; nombre: string; hex: string | null; foto: boolean; hay: number };

export type PrendaDelProbador = {
  productoId: string;
  codigo: string | null;
  nombre: string;
  categoria: { id: string; nombre: string; prefijo: string | null } | null;
  /** Unidades vendidas en 90 días: el orden de la lista. */
  vendidas: number;
  /** El largo propio (cm), o `null` si usa el típico. */
  largo: number | null;
  /** El típico de su categoría (cm), o `null` si la categoría no tiene. */
  tipico: number | null;
  colores: ColorDePrenda[];
  fotos: number;
  recortes: { listos: number; porRevisar: number; sin: number };
  miniatura: string | null;
  miniaturaEsRecorte: boolean;
};

export type TipicoDeCategoria = { categoriaId: string; nombre: string; prefijo: string | null; largo: number | null; prendas: number };

export type LecturaProbador = { prendas: PrendaDelProbador[]; tipicos: TipicoDeCategoria[] };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function entero(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.trunc(n);
}

function prendaDe(v: unknown): PrendaDelProbador | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const productoId = texto(p.producto_id);
  const nombre = texto(p.nombre);
  if (!productoId || !nombre) return null;
  const cat = p.categoria && typeof p.categoria === "object" ? (p.categoria as Record<string, unknown>) : null;
  const rec = p.recortes && typeof p.recortes === "object" ? (p.recortes as Record<string, unknown>) : {};
  const colores: ColorDePrenda[] = [];
  for (const c of Array.isArray(p.colores) ? p.colores : []) {
    if (!c || typeof c !== "object") continue;
    const cc = c as Record<string, unknown>;
    const codigo = texto(cc.codigo);
    if (!codigo) continue;
    colores.push({ codigo, nombre: texto(cc.nombre) ?? codigo, hex: texto(cc.hex), foto: cc.foto === true, hay: Math.max(0, entero(cc.hay) ?? 0) });
  }
  const catId = cat ? texto(cat.id) : null;
  return {
    productoId,
    codigo: texto(p.codigo),
    nombre,
    categoria: cat && catId ? { id: catId, nombre: texto(cat.nombre) ?? "", prefijo: texto(cat.prefijo) } : null,
    vendidas: Math.max(0, entero(p.vendidas) ?? 0),
    largo: entero(p.largo),
    tipico: entero(p.tipico),
    colores,
    fotos: Math.max(0, entero(p.fotos) ?? 0),
    recortes: { listos: Math.max(0, entero(rec.listos) ?? 0), porRevisar: Math.max(0, entero(rec.por_revisar) ?? 0), sin: Math.max(0, entero(rec.sin) ?? 0) },
    miniatura: texto(p.miniatura),
    miniaturaEsRecorte: p.miniatura_es_recorte === true,
  };
}

/** Lo que devuelve `fn_vitrina_probador()`. Lo mal formado se salta (no tumba la pantalla). */
export function leerProbador(data: unknown): LecturaProbador {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const prendas = (Array.isArray(d.prendas) ? d.prendas : []).map(prendaDe).filter((p): p is PrendaDelProbador => p !== null);
  const tipicos: TipicoDeCategoria[] = [];
  for (const v of Array.isArray(d.tipicos) ? d.tipicos : []) {
    if (!v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    const categoriaId = texto(t.categoria_id);
    if (!categoriaId) continue;
    tipicos.push({ categoriaId, nombre: texto(t.nombre) ?? "", prefijo: texto(t.prefijo), largo: entero(t.largo), prendas: Math.max(0, entero(t.prendas) ?? 0) });
  }
  return { prendas, tipicos };
}

/** El largo con que la dibuja el probador: el suyo, o el típico de su categoría. `null`: no entra hasta que se anote. */
export function largoEfectivo(p: Pick<PrendaDelProbador, "largo" | "tipico">): number | null {
  return p.largo ?? p.tipico;
}

/** Los colores con stock que todavía no tienen su foto: los que hay que fotografiar. */
export function coloresPorFotografiar(p: Pick<PrendaDelProbador, "colores">): ColorDePrenda[] {
  return p.colores.filter((c) => !c.foto && c.hay > 0);
}

/** ¿Sale en el probador? Largo y un recorte listo. */
export function estaLista(p: PrendaDelProbador): boolean {
  return largoEfectivo(p) !== null && p.recortes.listos > 0;
}

export type CifrasProbador = { prendas: number; listas: number; sinLargo: number; coloresPorFotografiar: number; prendasPorFotografiar: number };

export function cifrasProbador(prendas: readonly PrendaDelProbador[]): CifrasProbador {
  let listas = 0;
  let sinLargo = 0;
  let colores = 0;
  let conColores = 0;
  for (const p of prendas) {
    if (estaLista(p)) listas++;
    if (largoEfectivo(p) === null) sinLargo++;
    const faltan = coloresPorFotografiar(p).length;
    colores += faltan;
    if (faltan > 0) conColores++;
  }
  return { prendas: prendas.length, listas, sinLargo, coloresPorFotografiar: colores, prendasPorFotografiar: conColores };
}

export type FiltroPrendas = "todas" | "listas" | "sin_largo" | "por_fotografiar";

/** Sin tildes ni mayúsculas, para buscar como se escribe en la tienda. */
function normal(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function filtrarPrendas(prendas: readonly PrendaDelProbador[], filtro: FiltroPrendas, busqueda: string): PrendaDelProbador[] {
  const q = normal(busqueda);
  return prendas.filter((p) => {
    if (filtro === "listas" && !estaLista(p)) return false;
    if (filtro === "sin_largo" && largoEfectivo(p) !== null) return false;
    if (filtro === "por_fotografiar" && coloresPorFotografiar(p).length === 0) return false;
    if (!q) return true;
    return normal(p.nombre).includes(q) || normal(p.codigo ?? "").includes(q) || normal(p.categoria?.nombre ?? "").includes(q);
  });
}

/**
 * Lo que se escribió en la caja del largo: un entero de 5 a 250 cm, vacío (vuelve al típico) o algo que no sirve. Acepta «62», «62 cm»
 * y «62,0»; no adivina «6 2».
 */
export function leerLargo(escrito: string): { valor: number | null } | { error: string } {
  const limpio = escrito.trim().toLowerCase().replace(/\s*cm$/, "").replace(",", ".");
  if (limpio === "") return { valor: null };
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { error: "Escribe el largo en centímetros, solo el número." };
  const n = Math.round(Number(limpio));
  if (n < LARGO_MINIMO || n > LARGO_MAXIMO) return { error: `El largo va de ${LARGO_MINIMO} a ${LARGO_MAXIMO} cm.` };
  return { valor: n };
}

/** El largo de una prenda en palabras de la lista: «62 cm», «45 cm · el típico» o «Falta». */
export function textoDelLargo(p: Pick<PrendaDelProbador, "largo" | "tipico">): string {
  if (p.largo !== null) return `${p.largo} cm`;
  if (p.tipico !== null) return `${p.tipico} cm · el típico`;
  return "Falta";
}

/** El motivo de un error de las funciones de los largos, en palabras de la pantalla (`null` si no es uno de ellos). */
export function errorDeLargo(textoError: string): string | null {
  if (textoError.includes("vitrina_largo_sin_vitrina")) return "Esa prenda no está en la vitrina: muéstrala en la web primero.";
  if (textoError.includes("vitrina_largo_invalido")) return `El largo va de ${LARGO_MINIMO} a ${LARGO_MAXIMO} cm.`;
  return null;
}
