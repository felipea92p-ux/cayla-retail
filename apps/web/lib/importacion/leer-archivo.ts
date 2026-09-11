import ExcelJS from "exceljs";
import { parsearCSV, detectarCabecera, type Tabla } from "./tabla";

/**
 * De lo que sea que mande el cliente a una tabla de texto.
 *
 * TRES ENTRADAS, UNA SALIDA. `.xlsx`, `.csv`/`.txt` y un enlace de Google Sheets
 * terminan en el mismo `Tabla`, y de ahí en adelante el importador no sabe ni le
 * importa de dónde vino. Es lo que después deja meter el carril de PDF y foto sin
 * tocar nada de lo que sigue: solo tiene que producir un `Tabla`.
 *
 * NADA SE INTERPRETA ACÁ. Todo sale como texto, tal como se veía. Convertir es
 * trabajo del mapeo, que sabe qué significa cada columna; un lector que además
 * convierte transforma "0012" en 12 y destruye un código de barras.
 */

/** 10 MB. Un catálogo de 20.000 prendas en xlsx pesa ~2 MB; más que esto no es un
 *  catálogo, es un archivo con imágenes incrustadas o algo que no queremos parsear. */
export const MAX_BYTES = 10 * 1024 * 1024;

export class ErrorDeLectura extends Error {}

/** Lee un archivo subido. `nombre` decide el formato: el mime de un .xlsx varía
 *  demasiado entre navegadores y sistemas para confiar en él. */
export async function leerArchivo(datos: ArrayBuffer, nombre: string): Promise<Tabla> {
  if (datos.byteLength > MAX_BYTES) {
    throw new ErrorDeLectura(
      `El archivo pesa ${(datos.byteLength / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB. ` +
        `Si es un Excel con fotos dentro, guárdalo como CSV y vuelve a subirlo.`
    );
  }
  if (datos.byteLength === 0) throw new ErrorDeLectura("El archivo está vacío.");

  const ext = nombre.toLowerCase().split(".").pop() ?? "";

  if (ext === "xlsx" || ext === "xlsm") return leerExcel(datos, nombre);
  if (ext === "csv" || ext === "txt") return leerCSV(new TextDecoder("utf-8").decode(datos), nombre);
  if (ext === "xls") {
    // El .xls viejo (BIFF, anterior a 2007) es otro formato entero, y soportarlo
    // costaría una librería más para un caso que Excel resuelve en dos clics.
    throw new ErrorDeLectura(
      "El formato .xls es el de Excel antiguo. Ábrelo en Excel y usa Guardar como → .xlsx o .csv."
    );
  }
  throw new ErrorDeLectura(`No sé leer un archivo .${ext}. Acepto .xlsx, .csv y enlaces de Google Sheets.`);
}

function leerCSV(texto: string, origen: string): Tabla {
  const filas = parsearCSV(texto);
  if (filas.length === 0) throw new ErrorDeLectura("El archivo no tiene ninguna fila con datos.");
  return { filas, filaCabecera: detectarCabecera(filas), origen };
}

async function leerExcel(datos: ArrayBuffer, origen: string): Promise<Tabla> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorDeLectura(
      "No pude abrir el Excel. Puede estar dañado o protegido con contraseña — probá guardándolo como CSV."
    );
  }

  // La hoja con más filas, no la primera: un catálogo real suele traer "Portada"
  // o "Instrucciones" delante, y leer la primera devolvería tres celdas de texto.
  const hojas = libro.worksheets.filter((h) => h.rowCount > 0);
  if (hojas.length === 0) throw new ErrorDeLectura("El Excel no tiene ninguna hoja con datos.");
  const hoja = hojas.reduce((a, b) => (b.rowCount > a.rowCount ? b : a));

  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: string[] = [];
    // `cellCount` cuenta hasta la última celda con algo; se recorre por índice y
    // no con eachCell porque eachCell SALTA las vacías, y saltarlas correría
    // todas las columnas de la derecha una posición a la izquierda.
    for (let i = 1; i <= hoja.columnCount; i++) {
      celdas.push(textoDeCelda(fila.getCell(i)));
    }
    filas.push(celdas);
  });

  const conDatos = filas.filter((f) => f.some((c) => c.trim() !== ""));
  if (conDatos.length === 0) throw new ErrorDeLectura("El Excel no tiene ninguna fila con datos.");

  return {
    filas: conDatos,
    filaCabecera: detectarCabecera(conDatos),
    origen: `${origen} · hoja "${hoja.name}"`,
  };
}

/**
 * El texto de una celda tal como lo ve quien abre el Excel.
 *
 * Se usa el texto y no el valor tipado a propósito: la celda que muestra
 * "S/ 89.90" guarda el número 89.9, y la que muestra un código "0012" guarda el
 * texto "0012" o el número 12 según cómo se haya tipeado. Tomar el texto
 * renderizado es lo único que da el mismo resultado que un CSV exportado a mano
 * — y hace que las dos rutas de entrada se comporten igual.
 */
function textoDeCelda(celda: ExcelJS.Cell): string {
  const v = celda.value;
  if (v == null) return "";

  // Una fórmula trae { formula, result }: interesa el resultado, no la fórmula.
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return r == null ? "" : String(r);
  }
  // Texto enriquecido: se concatenan los tramos y se pierde el formato, que es
  // lo correcto — un color de fuente no es un dato del inventario.
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.RichText[] extends never ? never : { richText: { text: string }[] }).richText
      .map((t) => t.text)
      .join("");
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "hyperlink" in v) {
    return String((v as { text?: string }).text ?? "");
  }
  return celda.text ?? String(v);
}

/**
 * Convierte un enlace de Google Sheets en su exportación CSV y la descarga.
 *
 * SEGURIDAD, y no es teórica: acá el servidor hace una petición saliente a una
 * URL que escribió el usuario. Sin la comprobación de host esto sería un SSRF de
 * manual — alguien pega `http://169.254.169.254/...` y el servidor va y lo trae.
 * Por eso solo se acepta `docs.google.com` y solo por https.
 */
export async function leerGoogleSheets(url: string): Promise<Tabla> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ErrorDeLectura("Eso no parece un enlace. Copia la dirección completa desde la barra del navegador.");
  }

  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") {
    throw new ErrorDeLectura("Solo acepto enlaces de Google Sheets (docs.google.com).");
  }

  const id = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(u.pathname)?.[1];
  if (!id) throw new ErrorDeLectura("No encontré el identificador de la hoja en ese enlace.");

  // El gid identifica la pestaña; va en el fragmento (#gid=) o en la query.
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] ?? "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;

  const res = await fetch(exportUrl, { redirect: "follow" });
  if (!res.ok) {
    // El caso frecuente no es que el enlace esté mal: es que la hoja sea privada.
    // Google responde con un 302 a la pantalla de login, que acá llega como 401/403.
    throw new ErrorDeLectura(
      res.status === 401 || res.status === 403
        ? "La hoja es privada. En Google Sheets: Compartir → Cualquier persona con el enlace → Lector, y vuelve a intentar."
        : `Google respondió ${res.status} al intentar descargar la hoja.`
    );
  }

  const texto = await res.text();
  // Una hoja privada a veces devuelve 200 con el HTML del login en vez del CSV.
  if (texto.trimStart().startsWith("<")) {
    throw new ErrorDeLectura(
      "Google devolvió una página de inicio de sesión en vez de la hoja. Compártela con 'Cualquier persona con el enlace'."
    );
  }

  return leerCSV(texto, `Google Sheets ${id}`);
}
