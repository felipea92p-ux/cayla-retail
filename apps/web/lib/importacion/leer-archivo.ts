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

/**
 * 4 MB, y no es una elección: Vercel rechaza cualquier cuerpo de request mayor a
 * 4,5 MB con un 413 propio ANTES de que el handler exista. Prometer 10 MB —como
 * hacía esta constante— era mentir: local (next dev) no tiene ese tope, así que
 * el mismo archivo funcionaba aquí y fallaba allá con un error que no era
 * nuestro. Un catálogo de 20.000 prendas en xlsx pesa ~2 MB; sobra. Lo encontró
 * la revisión adversarial del 2026-09-11.
 */
export const MAX_BYTES = 4 * 1024 * 1024;

export class ErrorDeLectura extends Error {}

/**
 * Techo del tamaño DESCOMPRIMIDO de un .xlsx. Un xlsx es un zip, y el límite
 * de 4 MB se aplica al comprimido: un archivo-bomba de 2 MB puede inflarse a
 * varios GB dentro de exceljs y tumbar la función por memoria antes de que
 * ningún código nuestro corra. Se leen los tamaños declarados en el directorio
 * central del zip —sin descomprimir nada— y se corta antes de abrirlo. Un
 * catálogo real de 20.000 filas y 20 columnas son ~30 MB inflados; SINATRA
 * (20 hojas, 12.000 filas en la mayor) ronda los 60. Revisión del 2026-09-11.
 */
export const MAX_BYTES_DESCOMPRIMIDO = 200 * 1024 * 1024;

/**
 * Suma los tamaños descomprimidos que declara el directorio central de un zip.
 * Devuelve -1 si no parece un zip o el directorio está dañado (exceljs dará
 * su propio error), e Infinity si alguna entrada es ZIP64 (tamaño real por
 * encima de 4 GB: eso no es un catálogo).
 */
export function tamanoDescomprimidoZip(datos: ArrayBuffer): number {
  const b = Buffer.from(datos);
  // Fin del directorio central: firma 0x06054b50, dentro de los últimos 64 KB
  // (22 bytes fijos + comentario opcional de hasta 65.535).
  const desde = Math.max(0, b.length - 65_557);
  let eocd = -1;
  for (let i = b.length - 22; i >= desde; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return -1;
  const entradas = b.readUInt16LE(eocd + 10);
  let pos = b.readUInt32LE(eocd + 16);
  if (entradas === 0xffff || pos === 0xffffffff) return Infinity;

  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (pos + 46 > b.length || b.readUInt32LE(pos) !== 0x02014b50) return -1;
    const inflado = b.readUInt32LE(pos + 24);
    if (inflado === 0xffffffff) return Infinity;
    total += inflado;
    const nombre = b.readUInt16LE(pos + 28);
    const extra = b.readUInt16LE(pos + 30);
    const comentario = b.readUInt16LE(pos + 32);
    pos += 46 + nombre + extra + comentario;
  }
  return total;
}

/** Lee un archivo subido. `nombre` decide el formato: el mime de un .xlsx varía
 *  demasiado entre navegadores y sistemas para confiar en él. */
/** `hoja`: nombre de la hoja a leer. Sin ella, la que tiene más filas. */
export async function leerArchivo(datos: ArrayBuffer, nombre: string, hoja?: string): Promise<Tabla> {
  if (datos.byteLength > MAX_BYTES) {
    throw new ErrorDeLectura(
      `El archivo pesa ${(datos.byteLength / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB. ` +
        `Si es un Excel con fotos dentro, guárdalo como CSV y vuelve a subirlo.`
    );
  }
  if (datos.byteLength === 0) throw new ErrorDeLectura("El archivo está vacío.");

  const ext = nombre.toLowerCase().split(".").pop() ?? "";

  if (ext === "xlsx" || ext === "xlsm") return leerExcel(datos, nombre, hoja);
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

async function leerExcel(datos: ArrayBuffer, origen: string, nombreHoja?: string): Promise<Tabla> {
  const inflado = tamanoDescomprimidoZip(datos);
  if (inflado > MAX_BYTES_DESCOMPRIMIDO) {
    throw new ErrorDeLectura(
      `El Excel se expande a ${Number.isFinite(inflado) ? `${Math.round(inflado / 1024 / 1024)} MB` : "más de 4 GB"} al abrirlo, ` +
        `y el máximo son ${MAX_BYTES_DESCOMPRIMIDO / 1024 / 1024} MB. Guarda solo la hoja del inventario como CSV y vuelve a subirla.`
    );
  }

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new ErrorDeLectura(
      "No pude abrir el Excel. Puede estar dañado o protegido con contraseña — probá guardándolo como CSV."
    );
  }

  // `actualRowCount` cuenta filas CON VALORES; `rowCount` cuenta cualquier fila
  // tocada, aunque solo tenga bordes o relleno. Con rowCount una hoja de
  // plantilla formateada hasta la fila 5.000 le ganaba a la de datos, y
  // `leerExcel` moría en "no tiene ninguna fila con datos" antes de devolver la
  // lista de hojas — así que la pantalla nunca ofrecía elegir otra.
  const hojas = libro.worksheets.filter((h) => h.actualRowCount > 0);
  if (hojas.length === 0) throw new ErrorDeLectura("El Excel no tiene ninguna hoja con datos.");

  // Por defecto la hoja con más filas, no la primera: un catálogo real suele
  // traer "Portada" o "Instrucciones" delante. Pero es solo un DEFAULT, y la
  // persona puede elegir otra — SINATRA 2025.xlsm lo dejó claro: la hoja con
  // más filas era "Gastos" (12.239) y el inventario estaba en "Ingreso
  // Mercadería" (3.941). Ninguna heurística sabe cuál es la hoja correcta de
  // un archivo financiero de 20 pestañas; quien lo mandó, sí.
  const hoja = nombreHoja
    ? hojas.find((h) => h.name === nombreHoja)
    : hojas.reduce((a, b) => (b.actualRowCount > a.actualRowCount ? b : a));
  if (!hoja) throw new ErrorDeLectura(`El Excel no tiene una hoja llamada «${nombreHoja}» con datos.`);

  // UNA sola vez, fuera del bucle. En exceljs 4.4 `columnCount` es un getter
  // que recorre TODAS las filas con eachRow en cada acceso; tenerlo en la
  // condición del `for` de cada fila hacía la lectura O(filas² × columnas).
  // Medido: 3.000 filas × 15 columnas tardaban 3,5 s; 12.000 filas (la hoja
  // "Gastos" de SINATRA), ~100 s — más que el timeout de la función en
  // Vercel, así que la persona nunca llegaba a ver el desplegable de hojas.
  // Cacheado: 4 ms. Lo encontró la revisión adversarial del 2026-09-11.
  const ancho = hoja.columnCount;

  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: string[] = [];
    // Se recorre por índice y no con eachCell porque eachCell SALTA las
    // vacías, y saltarlas correría todas las columnas de la derecha una
    // posición a la izquierda.
    for (let i = 1; i <= ancho; i++) {
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
    hojas: hojas.map((h) => ({ nombre: h.name, filas: h.actualRowCount })),
    hojaElegida: hoja.name,
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
  // Una celda que forma parte de un rango COMBINADO y no es la principal tiene
  // `value` null y un `.text` que revienta con "Cannot read properties of null"
  // — bug de exceljs. Lo destapó SINATRA 2025.xlsm, que combina celdas en los
  // títulos de casi todas sus hojas. Para el importador vale como vacía: el
  // dato vive en la celda principal del rango, que sí se lee.
  if (celda.isMerged && celda.value == null) return "";

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
  // El mismo bug de exceljs puede asomar por otros caminos (fórmulas sobre
  // rangos combinados): si .text revienta, el valor crudo sirve igual.
  try {
    return celda.text ?? String(v);
  } catch {
    return String(v);
  }
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

  // Mismo techo que un archivo subido, y un tiempo máximo: sin esto el carril
  // de Sheets traía a memoria lo que Google quisiera mandar, sin límite ni
  // timeout, mientras el de archivo cortaba en 4 MB. Revisión del 2026-09-11.
  const res = await fetch(exportUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch((e: unknown) => {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new ErrorDeLectura("Google tardó más de 20 segundos en responder. Si la hoja es muy grande, descárgala como CSV y súbela.");
    }
    throw e;
  });
  if (!res.ok) {
    // El caso frecuente no es que el enlace esté mal: es que la hoja sea privada.
    // Google responde con un 302 a la pantalla de login, que acá llega como 401/403.
    throw new ErrorDeLectura(
      res.status === 401 || res.status === 403
        ? "La hoja es privada. En Google Sheets: Compartir → Cualquier persona con el enlace → Lector, y vuelve a intentar."
        : `Google respondió ${res.status} al intentar descargar la hoja.`
    );
  }

  const texto = await leerHastaLimite(res, MAX_BYTES);
  // Una hoja privada a veces devuelve 200 con el HTML del login en vez del CSV.
  if (texto.trimStart().startsWith("<")) {
    throw new ErrorDeLectura(
      "Google devolvió una página de inicio de sesión en vez de la hoja. Compártela con 'Cualquier persona con el enlace'."
    );
  }

  return leerCSV(texto, `Google Sheets ${id}`);
}

/** Lee el cuerpo como texto y corta —sin seguir descargando— si pasa de `max` bytes. */
async function leerHastaLimite(res: Response, max: number): Promise<string> {
  const declarado = Number(res.headers.get("content-length") ?? 0);
  if (declarado > max) {
    throw new ErrorDeLectura(`La hoja pesa ${(declarado / 1024 / 1024).toFixed(1)} MB y el máximo son ${max / 1024 / 1024} MB.`);
  }
  if (!res.body) return await res.text();

  const lector = res.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      throw new ErrorDeLectura(`La hoja pesa más de ${max / 1024 / 1024} MB. Pártela en dos, o descárgala como CSV y súbela.`);
    }
    trozos.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(trozos));
}
