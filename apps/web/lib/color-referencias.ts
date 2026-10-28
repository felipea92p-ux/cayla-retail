// Las referencias de un color además de su nombre (20260926180000, ADR-0215; 20261003190000, ADR-0316):
//   · su código Pantone TCX — el idioma con que se pide una tela al taller o al proveedor;
//   · sus sinónimos — cómo le dicen en la tienda («plomo» es Gris, «guinda» es Vino);
//   · su descripción — qué transmite y dónde funciona, para que una asesora lo recomiende;
//   · con qué colores combina bien — los CÓDIGOS de otros colores.
//
// PROMETE: `normalizarPantone` deja el código como lo guarda la base («19-1557 TCX»), o `null` si viene vacío, o
//   `"invalido"` si no tiene esa forma. `normalizarSinonimos` deja una lista limpia: sin vacíos, sin repetidos (sin
//   importar tildes ni mayúsculas), sin el propio nombre del color, con un tope.
// ASUME: nada de la base: la pantalla y la API usan esto mismo para que validen igual. El candado final vive en la
//   base (formato con `check`, y un código Pantone no puede estar en dos colores: índice único).

const PANTONE = /^(\d{2})\s*-?\s*(\d{4})(\s*tcx)?$/i;

export function normalizarPantone(texto: string | null | undefined): string | null | "invalido" {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const m = PANTONE.exec(t);
  return m ? `${m[1]}-${m[2]} TCX` : "invalido";
}

export const MAX_SINONIMOS = 12;
const MAX_LARGO_SINONIMO = 40;

const claveTexto = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Acepta una lista o un texto separado por comas, punto y coma o saltos de línea. */
export function normalizarSinonimos(entrada: string | readonly string[] | null | undefined, nombreDelColor = ""): string[] {
  const partes = typeof entrada === "string" ? entrada.split(/[,;\n]/) : [...(entrada ?? [])];
  const vistos = new Set<string>([claveTexto(nombreDelColor)]);
  const salida: string[] = [];
  for (const parte of partes) {
    const limpio = String(parte).replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_SINONIMO);
    const k = claveTexto(limpio);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(limpio);
    if (salida.length === MAX_SINONIMOS) break;
  }
  return salida;
}

// ── Descripción y «combina con» (ADR-0316) ─────────────────────────────────────────────────────────────────────────────
// PROMETE: `normalizarDescripcion` y `normalizarCombinaCon` dejan lo que la base acepta, o dicen `"invalido"`. Los mismos límites que
//   los candados de la base (`colores_descripcion_largo`: 1–300 caracteres; `colores_combina_con_maximo`: hasta 8) para que la pantalla y
//   la API rechacen antes que la base.
// ASUME: nada de la base. Que un código EXISTA lo comprueba el disparador `colores_valida_combina_con`; aquí solo la forma.
export const MAX_DESCRIPCION = 300;
export const MAX_COMBINA_CON = 8;

/** La descripción sin espacios de más; `null` si viene vacía; `"invalido"` si pasa de 300 caracteres. */
export function normalizarDescripcion(texto: string | null | undefined): string | null | "invalido" {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_DESCRIPCION ? "invalido" : t;
}

/**
 * La lista de códigos con que combina: en mayúsculas, sin repetidos y sin el propio color (esos dos se descartan, no son un error).
 * `"invalido"` si algún elemento no es un código de 3 letras o si pasa del tope. Una entrada vacía o ausente es la lista vacía.
 */
export function normalizarCombinaCon(entrada: unknown, propio = ""): string[] | "invalido" {
  if (entrada == null || entrada === "") return [];
  if (!Array.isArray(entrada)) return "invalido";
  const salida: string[] = [];
  for (const x of entrada) {
    if (typeof x !== "string") return "invalido";
    const codigo = x.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(codigo)) return "invalido";
    if (codigo === propio.trim().toUpperCase() || salida.includes(codigo)) continue;
    salida.push(codigo);
  }
  return salida.length > MAX_COMBINA_CON ? "invalido" : salida;
}

/** Sumar o quitar un color de la lista. Con la lista llena, sumar no hace nada (la pantalla lo avisa): nunca pasa del tope. */
export function alternarCombinaCon(actual: readonly string[], codigo: string): string[] {
  if (actual.includes(codigo)) return actual.filter((c) => c !== codigo);
  return actual.length >= MAX_COMBINA_CON ? [...actual] : [...actual, codigo];
}

