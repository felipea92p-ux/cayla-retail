// Las dos referencias de un color además de su nombre (20260926180000, ADR-0215):
//   · su código Pantone TCX — el idioma con que se pide una tela al taller o al proveedor;
//   · sus sinónimos — cómo le dicen en la tienda («plomo» es Gris, «guinda» es Vino).
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
