import type { CampoDeGuia } from "./guia-campos";
import { CANTIDAD_ILEGIBLE, leerCantidad, metrosPorKilo, type CompraDeTela, type MaterialVista } from "./insumos-reglas";
import { MONTO_ILEGIBLE, numeroDeMonto } from "./monto-plata-reglas";
import { claveTexto, nombresParecidos } from "./nombres-parecidos";

// «Nueva tela» (ADR-0554, actividad 2): una tela y todos sus colores en una sola hoja. Reglas puras, sin React ni red; la hoja y la guía de foco las comparten.
//
// CONTRATO
//   PROMETE: `problemasDeTelaNueva` es la ÚNICA regla con la que la hoja decide si guarda (la guía y el botón no pueden contradecirla); `payloadDeTelaNueva` arma exactamente lo que `crear_material` y
//            `agregar_colores_a_material` esperan (la merma como fracción, el saldo en METROS y su costo total); lo que no se entiende (una coma mal puesta, «1.200») NO se lee como cero.
//   ASUME:   el libro de la tela va en metros; el kilo y el rollo se convierten con el ancho y el gramaje de la ficha o con los metros habituales del rollo (el dato medido al llegar es de «Llegó tela»).
//            Quien no es líder no anota saldo (dinero): la base lo rechaza y la hoja ni lo ofrece.
//   NO HACE: no decide quién puede guardar ni toca la base. El código que se muestra es una vista previa: lo asigna la base.

export const COMPRAS: readonly { valor: CompraDeTela; texto: string }[] = [
  { valor: "metro", texto: "Por metro" },
  { valor: "kilo", texto: "Por kilo" },
  { valor: "rollo", texto: "Por rollo" },
];

/** Una fila de la tabla de colores. Todo es texto, como se escribe. `ya` está en la unidad de COMPRA (kg, m o rollos); `costo`, por esa misma unidad. */
export type FilaDeColor = { color: string; ya: string; costo: string; minimo: string };

export type EntradaTelaNueva = {
  nombre: string;
  tejidoId: string;
  composicion: string;
  compra: CompraDeTela;
  ancho: string;
  gramaje: string;
  metrosPorRollo: string;
  /** En porcentaje, como se escribe («5»). Vacío = 0. */
  merma: string;
  filas: FilaDeColor[];
  /** Quien guarda puede anotar el saldo inicial (es el líder). */
  puedeSaldo: boolean;
  responsableListo: boolean;
};

const MENSAJE_NOMBRE = "Ponle un nombre a la tela.";
const MENSAJE_MERMA = "La merma va de 0 % a menos de 50 %.";
const MENSAJE_KILO = "Para pasar los kilos a metros hace falta el ancho y el gramaje de la tela.";
const MENSAJE_ROLLO = "Di cuántos metros trae un rollo (lo habitual).";
const MENSAJE_SIN_COLORES = "Elige al menos un color.";
const MENSAJE_SIN_COSTO = "Un color con saldo necesita su costo (escribe 0 si no lo sabes).";
const MENSAJE_SALDO_DEL_LIDER = "El saldo inicial, con su costo, lo anota el líder.";

/** Los metros de un kilo según lo que se escribió (ancho en cm, gramaje en g/m²). */
export function rindeEscrito(e: Pick<EntradaTelaNueva, "ancho" | "gramaje">): number | null {
  return metrosPorKilo(leerCantidad(e.ancho), leerCantidad(e.gramaje));
}

/** Cuánto hay de un color, en la unidad en que se compró (kg, m o rollos); `null` si no se escribió o no se entiende. */
export function cantidadEscrita(f: FilaDeColor): number | null {
  return f.ya.trim() === "" ? null : leerCantidad(f.ya);
}

export const tieneSaldo = (f: FilaDeColor): boolean => (cantidadEscrita(f) ?? 0) > 0;

/** Los METROS que entran por una fila: lo escrito pasado a metros con la forma de compra de la tela. `null` si falta algo para convertirlo. */
export function metrosDeFila(e: Pick<EntradaTelaNueva, "compra" | "ancho" | "gramaje" | "metrosPorRollo">, f: FilaDeColor): number | null {
  const q = cantidadEscrita(f);
  if (q === null) return null;
  if (e.compra === "metro") return q;
  if (e.compra === "kilo") {
    const r = rindeEscrito(e);
    return r === null ? null : q * r;
  }
  const m = leerCantidad(e.metrosPorRollo);
  return m === null ? null : q * m;
}

/** Lo que vale lo escrito en una fila (cantidad × costo, a céntimos). `null` si no se escribió el costo o no se entiende. */
export function costoTotalDeFila(f: FilaDeColor): number | null {
  const q = cantidadEscrita(f);
  const c = numeroDeMonto(f.costo);
  if (q === null || f.costo.trim() === "" || !Number.isFinite(c) || c < 0) return null;
  return Math.round(q * c * 100) / 100;
}

/** Hay algo escrito y no se entiende como cantidad (la celda dice cómo escribirlo). */
export const numeroMalEscrito = (texto: string): boolean => texto.trim() !== "" && leerCantidad(texto) === null;

/** Lo que una fila tiene mal escrito (vacío si está bien). Una fila sin nada escrito es válida: la tela se crea en cero. */
function problemasDeFila(e: EntradaTelaNueva, f: FilaDeColor): string[] {
  const p: string[] = [];
  if (numeroMalEscrito(f.ya) || numeroMalEscrito(f.minimo)) p.push(CANTIDAD_ILEGIBLE);
  if (f.costo.trim() !== "" && !Number.isFinite(numeroDeMonto(f.costo))) p.push(MONTO_ILEGIBLE);
  if (tieneSaldo(f)) {
    if (!e.puedeSaldo) p.push(MENSAJE_SALDO_DEL_LIDER);
    else if (costoTotalDeFila(f) === null && Number.isFinite(numeroDeMonto(f.costo))) p.push(MENSAJE_SIN_COSTO);
    else if (metrosDeFila(e, f) === null) p.push(e.compra === "kilo" ? MENSAJE_KILO : MENSAJE_ROLLO);
  }
  return p;
}

const mermaDe = (e: Pick<EntradaTelaNueva, "merma">): number | null => (e.merma.trim() === "" ? 0 : leerCantidad(e.merma));
const mermaBuena = (e: Pick<EntradaTelaNueva, "merma">): boolean => {
  const m = mermaDe(e);
  return m !== null && m >= 0 && m / 100 < 0.5;
};
const compraCompleta = (e: EntradaTelaNueva): boolean =>
  e.compra === "metro" || (e.compra === "kilo" && rindeEscrito(e) !== null) || (e.compra === "rollo" && (leerCantidad(e.metrosPorRollo) ?? 0) > 0);

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. */
export function problemasDeTelaNueva(e: EntradaTelaNueva): string[] {
  const p: string[] = [];
  if (!e.nombre.trim()) p.push(MENSAJE_NOMBRE);
  if (e.compra === "kilo" && rindeEscrito(e) === null) p.push(MENSAJE_KILO);
  if (e.compra === "rollo" && !((leerCantidad(e.metrosPorRollo) ?? 0) > 0)) p.push(MENSAJE_ROLLO);
  if (!mermaBuena(e)) p.push(MENSAJE_MERMA);
  if (e.filas.length === 0) p.push(MENSAJE_SIN_COLORES);
  for (const m of new Set(e.filas.flatMap((f) => problemasDeFila(e, f)))) p.push(m);
  return p;
}

/** Los campos de la guía de foco de la hoja: qué está hecho, qué sigue y qué falta. «Falta» sale de `problemasDeTelaNueva`, nunca de una regla propia. */
export function camposDeTelaNueva(e: EntradaTelaNueva): CampoDeGuia[] {
  const mermaEscrita = e.merma.trim() !== "";
  const problemasDeColores = [...new Set(e.filas.flatMap((f) => problemasDeFila(e, f)))];
  return [
    { id: "nombre", nombre: "Nombre de la tela", requerido: true, hecho: e.nombre.trim() !== "", pendiente: MENSAJE_NOMBRE },
    // Lo recomendado que no bloquea: el tejido alimenta la sugerencia de «Nueva orden»; la composición, la etiqueta de la prenda.
    { id: "tejido", nombre: "El tejido", requerido: false, sugerido: true, hecho: e.tejidoId !== "", pendiente: "Elige el tejido (o créalo aquí mismo): «Nueva orden» lo usa para proponer la tela." },
    { id: "composicion", nombre: "La composición", requerido: false, sugerido: true, hecho: e.composicion.trim() !== "", pendiente: "Escribe la composición: sale en la etiqueta de la prenda." },
    { id: "compra", nombre: "Cómo la compras", requerido: true, hecho: compraCompleta(e), pendiente: e.compra === "kilo" ? MENSAJE_KILO : MENSAJE_ROLLO },
    { id: "merma", nombre: "Merma al cortar", requerido: mermaEscrita, hecho: mermaEscrita && mermaBuena(e), pendiente: MENSAJE_MERMA },
    { id: "colores", nombre: "Los colores", requerido: true, hecho: e.filas.length > 0 && problemasDeColores.length === 0, pendiente: e.filas.length === 0 ? MENSAJE_SIN_COLORES : (problemasDeColores[0] ?? MENSAJE_SIN_COLORES) },
    { id: "quien", nombre: "Quién la anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta tela." },
  ];
}

/** Lo que se manda a la base: `{ material, colores }`. La merma va como fracción; el saldo, en METROS y con su costo total. Con `agregandoColores` solo van los colores. */
export function payloadDeTelaNueva(e: EntradaTelaNueva): { material: Record<string, unknown>; colores: Record<string, unknown>[] } {
  const merma = (mermaDe(e) ?? 0) / 100;
  const material: Record<string, unknown> = {
    nombre: e.nombre.trim(),
    tipo: "tela",
    tejido_id: e.tejidoId || null,
    composicion: e.composicion.trim() || null,
    unidad_compra: e.compra,
    merma_pct: merma,
    ...(e.compra === "kilo" ? { ancho_cm: leerCantidad(e.ancho), gramaje_gm2: leerCantidad(e.gramaje) } : {}),
    ...(e.compra === "rollo" ? { metros_por_rollo: leerCantidad(e.metrosPorRollo) } : {}),
  };
  return { material, colores: coloresParaLaBase(e) };
}

/** Los colores como los espera la base (`[{color_codigo, stock_minimo?, saldo_inicial?: {cantidad, costo_total}}]`). */
export function coloresParaLaBase(e: EntradaTelaNueva): Record<string, unknown>[] {
  return e.filas.map((f) => {
    const metros = metrosDeFila(e, f);
    const total = costoTotalDeFila(f);
    const minimo = f.minimo.trim() === "" ? null : leerCantidad(f.minimo);
    return {
      color_codigo: f.color,
      stock_minimo: minimo,
      ...(tieneSaldo(f) && metros !== null && total !== null ? { saldo_inicial: { cantidad: Math.round(metros * 1000) / 1000, costo_total: total } } : {}),
    };
  });
}

/** El prefijo con que la base arma el código de la tela: las 3 primeras letras de su primera palabra («Milano Melange» → MIL; sin letras, TEL). */
export function prefijoDeTela(nombre: string): string {
  const letras = (claveTexto(nombre).split(" ")[0] ?? "").replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
  return letras.length >= 2 ? letras : "TEL";
}

/** El código que la base le va a poner a la tela (vista previa: lo asigna ella). Prefijo + el siguiente número libre de ese prefijo. */
export function codigoDeVistaPrevia(nombre: string, existentes: readonly Pick<MaterialVista, "codigo">[]): string {
  const p = prefijoDeTela(nombre);
  const usados = existentes.map((m) => /^([A-Z]{2,3})-(\d+)/i.exec(m.codigo)).filter((r): r is RegExpExecArray => r !== null && r[1].toUpperCase() === p).map((r) => Number(r[2]));
  return `${p}-${String(Math.max(0, ...usados) + 1).padStart(2, "0")}`;
}

/** ¿Ya hay una tela con este nombre (o muy parecido)? Antes de crearla se avisa, para sumarle colores a esa en vez de repetirla. */
export function telaParecida<T extends Pick<MaterialVista, "nombre" | "tipo">>(nombre: string, materiales: readonly T[]): { tela: T; igual: boolean } | null {
  const r = nombresParecidos(nombre, materiales.filter((m) => m.tipo === "tela"), { max: 1 });
  if (r.igual) return { tela: r.igual, igual: true };
  const p = r.parecidos[0];
  return p ? { tela: p.item, igual: false } : null;
}
