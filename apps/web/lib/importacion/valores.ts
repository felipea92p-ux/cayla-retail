import { claveTexto } from "../taxonomia/anclar";
import type { FilaEstandar } from "./mapeo";

/**
 * Los valores distintos del archivo, y cuáles ya existen en el vocabulario.
 *
 * LA IDEA QUE HACE ESTO BARATO: un catálogo de 3.000 prendas tiene ~40 colores y
 * ~25 categorías DISTINTOS. Resolver los 3.000 valores sería resolver 3.000
 * veces el mismo "Azul marino". Se resuelve el diccionario, no las filas — y de
 * esos 65 valores, los que ya existen en el vocabulario de la marca los cruza
 * `claveTexto` gratis. Al modelo solo llega lo que de verdad es nuevo.
 *
 * Todo acá es puro: se testea sin base, sin red y sin IA.
 */

export type ValorDistinto = {
  /** El texto tal como venía en el archivo. */
  texto: string;
  /** En cuántas prendas aparece. Ordena la revisión: 300 prendas pesan más que 1. */
  apariciones: number;
};

export type ValorResuelto = ValorDistinto & {
  /** El término del vocabulario de la marca que ya le corresponde, si lo hay. */
  existente: { clave: string; nombre: string } | null;
  /** Si hay que crearlo: de qué término universal colgaría. */
  propuesta: { universalId: string | null; universalNombre: string | null; confianza: string; porque: string } | null;
};

/**
 * Saca los valores distintos de un campo, ordenados por cuántas prendas los usan.
 *
 * Agrupa por `claveTexto`, no por texto exacto: "Azul marino", "AZUL MARINO" y
 * "azul  marino" son el mismo color escrito por tres personas distintas, y
 * tratarlos como tres valores distintos multiplicaría por tres lo que hay que
 * revisar — además de proponer crear tres colores donde hay uno.
 *
 * Se conserva la grafía MÁS FRECUENTE como representante: si 300 filas dicen
 * "Azul marino" y 2 dicen "azul marino", el color se llamará como lo escribió la
 * mayoría.
 */
export function valoresDistintos(filas: FilaEstandar[], campo: "color" | "categoria"): ValorDistinto[] {
  const porClave = new Map<string, Map<string, number>>();

  for (const f of filas) {
    const crudo = f[campo]?.trim();
    if (!crudo) continue;
    const clave = claveTexto(crudo);
    if (!clave) continue;
    const grafias = porClave.get(clave) ?? new Map<string, number>();
    grafias.set(crudo, (grafias.get(crudo) ?? 0) + 1);
    porClave.set(clave, grafias);
  }

  const salida: ValorDistinto[] = [];
  for (const grafias of porClave.values()) {
    let total = 0;
    let mejor = "";
    let mejorN = -1;
    for (const [texto, n] of grafias) {
      total += n;
      if (n > mejorN) {
        mejorN = n;
        mejor = texto;
      }
    }
    salida.push({ texto: mejor, apariciones: total });
  }

  return salida.sort((a, b) => b.apariciones - a.apariciones || a.texto.localeCompare(b.texto));
}

/**
 * Cruza los valores del archivo con el vocabulario que la marca ya tiene.
 *
 * El cruce va por `claveTexto` porque es exactamente lo que hace el índice único
 * de `colores` en Postgres (0046). Si acá se cruzara de otra forma, el
 * importador creería que un color es nuevo, intentaría crearlo, y la base lo
 * rechazaría — un error tardío, en mitad de una escritura, sobre un dato que la
 * persona ya confirmó en pantalla.
 */
export function cruzarConVocabulario(
  valores: ValorDistinto[],
  vocabulario: { clave: string; nombre: string }[]
): { yaExisten: ValorResuelto[]; nuevos: ValorDistinto[] } {
  const porClave = new Map(vocabulario.map((v) => [claveTexto(v.nombre), v]));

  const yaExisten: ValorResuelto[] = [];
  const nuevos: ValorDistinto[] = [];

  for (const v of valores) {
    const encontrado = porClave.get(claveTexto(v.texto));
    if (encontrado) {
      yaExisten.push({ ...v, existente: { clave: encontrado.clave, nombre: encontrado.nombre }, propuesta: null });
    } else {
      nuevos.push(v);
    }
  }
  return { yaExisten, nuevos };
}

/**
 * Normaliza una talla sin inventarse nada: espacios fuera y mayúsculas.
 *
 * A propósito NO hay vocabulario cerrado de tallas, ni acá ni en la base. La
 * decisión está razonada en 0046: las tallas ya vienen acotadas por
 * `categorias.tallas_sugeridas`, son de baja entropía (XS…XXL, 26…34, Único) y
 * cortas, así que las variantes de escritura son pocas y obvias. Agregar tallas
 * tarde es barato porque la talla no es FK de nada; agregar colores tarde es
 * caro. Esa asimetría es la que justifica tratarlas distinto.
 *
 * Se quita el prefijo "T" o "TALLA" porque "T-M" y "M" son la misma talla, y esa
 * es la única variante de escritura frecuente de verdad.
 */
export function normalizarTalla(texto: string): string {
  const t = texto
    .trim()
    .toUpperCase()
    .replace(/^TALLA\s*[-:.]?\s*/i, "")
    .replace(/^T\s*[-:.]\s*/i, "")
    .replace(/\s+/g, " ");

  // Las formas de "talla única" colapsan a UNA, igual que hace `fn_token_talla`
  // (0047) al generar el código corto. Sin esto, un archivo con "U" en una fila
  // y "Único" en otra del mismo modelo y color pasaba el dedup (tallas distintas
  // para `variantes_identidad_unica`) pero producía el mismo código
  // (BLU-0001-AZM-U dos veces) y `variantes_codigo_unico` abortaba la
  // importación entera con un 23505 crudo. Revisión del 2026-09-11.
  if (["U", "UNICO", "ÚNICO", "UNICA", "ÚNICA", "TALLA UNICA", "TALLA ÚNICA", ""].includes(t)) return "Único";
  return t;
}

/**
 * Réplica exacta de `fn_token_talla` (0047): el segmento de talla del código
 * corto. Existe acá por una sola razón: el dedup del importador tiene que usar
 * LA MISMA clave que `variantes_codigo_unico`, o deja pasar lo que ese índice
 * rechaza. "S/M" y "SM" son tallas distintas para `variantes_identidad_unica`
 * pero el mismo token (se quitan los no alfanuméricos), así que producirían el
 * mismo código y la importación entera moría con un 23505 crudo. Si esto y la
 * función de Postgres divergen, el bug es acá; el test lo fija.
 */
export function tokenTalla(texto: string): string {
  const clave = claveTexto(texto);
  if (!clave) return "U";
  if (["unico", "unica", "talla unica", "u"].includes(clave)) return "U";
  if (clave === "estandar") return "STD";
  return texto
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => "aeiouunAEIOUUN"["áéíóúüñÁÉÍÓÚÜÑ".indexOf(c)])
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}
