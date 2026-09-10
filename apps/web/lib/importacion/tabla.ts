/**
 * La tabla cruda que sale de un archivo de cliente, y el parser de CSV.
 *
 * QUÉ ES UNA TABLA ACÁ. Filas de TEXTO, tal como venían. Nada se convierte a
 * número, a fecha ni a nada: "S/ 89,90" se conserva como "S/ 89,90". Interpretar
 * es trabajo del mapeo, que es el paso siguiente y el que sabe qué significa cada
 * columna. Un lector que además interpreta decide dos cosas a la vez y se
 * equivoca en las dos: convierte "0012" a 12 y pierde un código de barras.
 *
 * TODO ES PURO Y SIN RED. Se testea sin Excel, sin Supabase y sin IA — que es
 * justo lo que hace falta, porque acá los errores son silenciosos: un separador
 * mal detectado no falla, devuelve una sola columna con toda la fila dentro.
 */

export type Tabla = {
  /** Todas las filas del archivo, incluida la cabecera y lo que haya encima. */
  filas: string[][];
  /**
   * En qué fila está la cabecera, según la heurística de `detectarCabecera`.
   * Es una SUGERENCIA: los Excel de clientes traen logos, títulos y filas en
   * blanco antes de la tabla de verdad, y quien confirma es una persona.
   */
  filaCabecera: number;
  /** De dónde salió, para mensajes de error y para la auditoría de la importación. */
  origen: string;
};

/** Lo que separa las celdas. Excel en español escribe `;` por defecto. */
export type Separador = "," | ";" | "\t" | "|";

const SEPARADORES: Separador[] = [";", ",", "\t", "|"];

/**
 * Adivina el separador contando cuál produce el mismo número de columnas en más
 * filas. Contar apariciones a secas se equivoca con "Blusa, manga larga": las
 * comas de dentro de un campo ganarían. Lo que delata al separador de verdad no
 * es que aparezca mucho, es que aparezca CONSISTENTEMENTE en todas las filas.
 */
export function detectarSeparador(texto: string): Separador {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lineas.length === 0) return ";";

  let mejor: Separador = ";";
  let mejorPuntaje = -1;

  for (const sep of SEPARADORES) {
    const cuentas = lineas.map((l) => partirLinea(l, sep).length);
    const columnas = cuentas[0];
    if (columnas < 2) continue;
    // Cuántas filas tienen exactamente el mismo ancho que la primera.
    const consistentes = cuentas.filter((c) => c === columnas).length;
    // Se premia la consistencia y, a igualdad, tener más columnas: un separador
    // equivocado suele dar 1 sola columna en todas las filas — consistente, sí,
    // pero inútil, y por eso `columnas < 2` ya lo descartó arriba.
    const puntaje = consistentes * 100 + columnas;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = sep;
    }
  }
  return mejor;
}

/** Parte UNA línea respetando comillas. Auxiliar de la detección, no del parseo real. */
function partirLinea(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas;
}

/**
 * Parsea CSV completo, carácter a carácter.
 *
 * Se hace a mano y no con `split` porque un CSV real trae comillas y saltos de
 * línea DENTRO de una celda —una descripción de producto con un salto adentro es
 * lo más normal del mundo—, y cualquier `split` los parte por la mitad. La
 * máquina de estados es la única forma correcta; el precio es que hay que
 * escribirla bien una vez.
 */
export function parsearCSV(texto: string, separador?: Separador): string[][] {
  // El BOM que Excel escribe al guardar como CSV UTF-8. Sin quitarlo, la primera
  // cabecera se llama "﻿SKU" y no coincide con nada.
  const limpio = texto.replace(/^﻿/, "");
  const sep = separador ?? detectarSeparador(limpio);

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];

    if (enComillas) {
      if (c === '"') {
        // `""` dentro de comillas es una comilla literal, no el cierre.
        if (limpio[i + 1] === '"') {
          celda += '"';
          i++;
        } else enComillas = false;
      } else celda += c;
      continue;
    }

    if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      // CRLF cuenta como un solo fin de línea, no dos.
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += c;
    }
  }

  // Lo que quedó pendiente si el archivo no termina en salto de línea.
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }

  return normalizar(filas);
}

/**
 * Quita filas totalmente vacías y empareja el ancho de todas al de la más ancha.
 *
 * Se RELLENA, nunca se trunca: una fila más ancha que la cabecera casi siempre
 * significa que hay una columna sin título, no que sobren datos. Truncar
 * perdería precios en silencio, que es la peor forma de fallar acá.
 */
function normalizar(filas: string[][]): string[][] {
  const conDatos = filas.filter((f) => f.some((c) => c.trim() !== ""));
  if (conDatos.length === 0) return [];
  const ancho = Math.max(...conDatos.map((f) => f.length));
  return conDatos.map((f) => (f.length === ancho ? f : [...f, ...Array(ancho - f.length).fill("")]));
}

/**
 * En qué fila empieza la tabla de verdad.
 *
 * EL PROBLEMA REAL: el Excel de una boutique casi nunca empieza en A1 con los
 * títulos. Trae el logo, "INVENTARIO 2026", un par de filas en blanco, y recién
 * después las cabeceras. Empezar a leer en la fila 0 produce columnas llamadas
 * "INVENTARIO 2026", "", "" — y de ahí no se recupera ningún mapeo.
 *
 * LA HEURÍSTICA: la cabecera es la primera fila que (a) tiene al menos la mitad
 * de sus celdas llenas, (b) no repite valores, y (c) es más "de texto" que la
 * fila siguiente. La (c) es la que de verdad distingue: en una tabla de
 * inventario las cabeceras son palabras y los datos traen números —precios,
 * cantidades, tallas—, así que la frontera entre las dos se nota.
 *
 * Devuelve 0 si no encuentra nada mejor: no adivinar es preferible a saltarse
 * datos reales, y la persona lo corrige en pantalla.
 */
export function detectarCabecera(filas: string[][]): number {
  const limite = Math.min(filas.length - 1, 15);

  for (let i = 0; i < limite; i++) {
    const fila = filas[i];
    const llenas = fila.filter((c) => c.trim() !== "");
    if (llenas.length < Math.max(2, Math.ceil(fila.length / 2))) continue;

    // Cabeceras repetidas ("", "", "Total", "Total") delatan una fila de títulos
    // combinados, no la cabecera real.
    const unicas = new Set(llenas.map((c) => c.trim().toLowerCase()));
    if (unicas.size !== llenas.length) continue;

    const siguiente = filas[i + 1];
    if (!siguiente) continue;

    if (proporcionNumerica(fila) < proporcionNumerica(siguiente)) return i;
  }
  return 0;
}

/** Qué parte de las celdas llenas parecen un número. */
function proporcionNumerica(fila: string[]): number {
  const llenas = fila.filter((c) => c.trim() !== "");
  if (llenas.length === 0) return 0;
  const numericas = llenas.filter((c) => /^[\s$€S/.]*-?[\d.,]+\s*%?$/.test(c.trim()));
  return numericas.length / llenas.length;
}
