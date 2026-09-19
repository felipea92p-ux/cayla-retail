// Búsqueda del Resumen (2026-09-19, ADR-0113). Determinista y sin IA: cada
// palabra que se escribe es una CONDICIÓN y todas tienen que cumplirse
// («blusa blanco L» = blusa Y blanco Y talla L), en cualquier orden. Puro, sin
// dependencias (vitest no resuelve `@/` — ver gotchas-local-tests-y-seed).
//
// Qué normaliza, para que escribir bien o mal alcance:
//  · mayúsculas y acentos («Blúsa» = «blusa»);
//  · separadores («BLU-0001» = «blu 0001» = «blu0001»);
//  · género y número («blanca», «blancos», «blanco» → mismo tronco; «blusas» =
//    «blusa»): así «blusa blanca» encuentra un color cuyo nombre canónico es
//    «Blanco». Es un tronco barato (se quita la «s» final y la vocal de género),
//    no un lematizador: alcanza para el vocabulario de un catálogo de moda y se
//    puede leer entero en diez líneas.
//
// Qué NO hace, a propósito: no corrige errores de tipeo ni interpreta sinónimos
// («crudo» no encuentra «blanco»). Si hace falta, el sinónimo se agrega al
// vocabulario del catálogo, no acá.

export type CamposBusqueda = {
  referencia: string;
  categoria: string | null;
  color: string | null;
  talla: string | null;
  sku: string;
  codigo: string | null;
  productoCodigo: string | null;
  codigosBarras: string[];
};

export type IndiceBusqueda = {
  /** Palabras de nombre, categoría, color y talla, normalizadas. */
  palabras: string[];
  /** El tronco de cada palabra (para «blanca» ↔ «blanco»). */
  troncos: string[];
  /** La talla tal cual, normalizada («l», «xl», «38»). */
  talla: string;
  /** Códigos sin separadores: SKU, código de variante, de producto y de barras. */
  codigos: string[];
};

/** Palabras que se escriben por costumbre y no filtran nada. */
const PALABRAS_VACIAS = new Set(["talla", "tallas", "color", "colores", "de", "del", "en", "la", "el", "los", "las", "y", "con", "para", "un", "una"]);

/** minúsculas, sin acentos, todo lo que no es letra o número pasa a espacio. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sin separadores ni espacios: «BLU-0001» → «blu0001». Para códigos. */
export function compactar(texto: string): string {
  return normalizarTexto(texto).replace(/ /g, "");
}

/** Tronco de una palabra ya normalizada: quita el plural y la vocal de género. */
export function tronco(palabra: string): string {
  let t = palabra;
  if (t.length > 3 && t.endsWith("s")) t = t.slice(0, -1);
  if (t.length >= 4 && /[aoe]$/.test(t)) t = t.slice(0, -1);
  return t;
}

function palabrasDe(texto: string | null | undefined): string[] {
  return texto ? normalizarTexto(texto).split(" ").filter(Boolean) : [];
}

export function crearIndice(c: CamposBusqueda): IndiceBusqueda {
  const palabras = [...palabrasDe(c.referencia), ...palabrasDe(c.categoria), ...palabrasDe(c.color), ...palabrasDe(c.talla)];
  const codigos = [c.sku, c.codigo, c.productoCodigo, ...c.codigosBarras]
    .filter((x): x is string => !!x)
    .map(compactar)
    .filter(Boolean);
  return { palabras, troncos: palabras.map(tronco), talla: compactar(c.talla ?? ""), codigos };
}

export type TokenBusqueda = {
  /** Lo que se escribió, normalizado (con separadores → espacios). */
  texto: string;
  /** Sin separadores, para comparar contra códigos. */
  compacto: string;
  /** Tiene dígitos o guion: se lee como código (SKU, barras, talla numérica). */
  esCodigo: boolean;
  tronco: string;
};

/** Cada palabra escrita, lista para comparar. Las vacías («talla», «de») se descartan. */
export function tokensDeConsulta(consulta: string): TokenBusqueda[] {
  const vistos = new Set<string>();
  const tokens: TokenBusqueda[] = [];
  for (const crudo of consulta.split(/\s+/)) {
    if (!crudo) continue;
    const texto = normalizarTexto(crudo);
    if (!texto) continue;
    const compacto = texto.replace(/ /g, "");
    if (vistos.has(compacto)) continue;
    if (PALABRAS_VACIAS.has(compacto)) continue;
    vistos.add(compacto);
    tokens.push({ texto, compacto, esCodigo: /\d/.test(crudo) || crudo.includes("-"), tronco: tronco(compacto) });
  }
  return tokens;
}

function cumple(indice: IndiceBusqueda, t: TokenBusqueda): boolean {
  // Un código (con dígitos o guion): coincide como fragmento de algún código,
  // como talla exacta («38») o como comienzo de una palabra («30» de «Pantalón 30»).
  if (t.esCodigo) {
    return (
      indice.talla === t.compacto ||
      indice.codigos.some((c) => c.includes(t.compacto)) ||
      indice.palabras.some((p) => p.startsWith(t.compacto))
    );
  }
  // Una o dos letras («l», «m», «xl»): solo una palabra ENTERA. Si no, «l»
  // encontraría todo lo que empiece con «l».
  if (t.compacto.length <= 2) {
    return indice.talla === t.compacto || indice.palabras.includes(t.compacto);
  }
  // Tres o más letras: comienzo de una palabra (por tronco, para género y
  // plural) o fragmento de un código («blu» dentro de «BLU-CAM-BLA-L»).
  return indice.troncos.some((r) => r.startsWith(t.tronco)) || indice.codigos.some((c) => c.includes(t.compacto));
}

/** ¿La fila cumple TODAS las condiciones? Una consulta vacía cumple siempre. */
export function coincideConsulta(indice: IndiceBusqueda, consulta: string): boolean {
  const tokens = tokensDeConsulta(consulta);
  return tokens.every((t) => cumple(indice, t));
}
