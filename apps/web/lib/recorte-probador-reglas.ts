// El recorte de una foto de prenda para el probador de la tienda online (ADR-0434, actividad 1; cambiado por el ADR-0442). Lógica pura,
// sin navegador: la usan `recorte-probador.ts` (que dibuja en un canvas) y sus pruebas. Sin imports de `@/`, como `foto-encuadre.ts`.
//
// DE DÓNDE SALE. Desde el ADR-0442 (Felipe, 2026-10-17) el ERP no quita fondos: la IA externa que usa el equipo entrega cada prenda como
// PNG con fondo TRANSPARENTE real y la foto se sube tal cual. El recorte del probador es esa misma imagen: su transparencia, limpiada
// (sin neblina ni halo) y cortada a la caja de la prenda. Antes salía de una máscara de MODNet calculada en el navegador sobre un JPEG
// (la transparencia se perdía al subirla), y esa máscara dejaba manchitas claras alrededor de la prenda.

import { cajaDeContenido, recorteAgujereado, soloLaPrenda, UMBRAL_ALFA, type Caja } from "./foto-encuadre";

/** El recorte más alto que se guarda. Una prenda del probador no pasa de ~400 px en un celular (2,5 px por cm): 1000 px sobra para
 *  una pantalla con el doble de densidad, y un PNG de ese alto pesa 200–600 KB. */
export const ALTO_MAX_RECORTE = 1000;

/** Por qué un recorte queda «por revisar» (los valores de `foto_recortes.motivo`). Hoy solo se genera «huecos»; los otros dos quedan
 *  porque hay filas de antes del ADR-0442 (el recortador de MODNet) y la pantalla tiene que poder leerlas. */
export type MotivoRecorte = "huecos" | "con_fondo" | "sin_original";

/** Desde qué fracción de la foto transparente (alfa menor a 128) se dice que trae fondo transparente. Un JPG, o un PNG con fondo,
 *  tiene 0; una prenda sobre fondo transparente deja casi siempre un tercio o más. */
export const FRACCION_TRANSPARENTE_MINIMA = 0.01;

/** Desde qué opacidad (0–255) un píxel es tela del todo. La IA suele dejarla en 253: sobre otro color se vería «lavada». */
export const ALFA_SOLIDA = 240;

/**
 * ¿La foto trae fondo transparente de verdad? Lee el canal alfa de una imagen RGBA (4 bytes por píxel). Una foto sin transparencia
 * no tiene recorte: nadie le quita el fondo (ADR-0442) y se queda «sin recorte».
 */
export function tieneFondoTransparente(rgba: ArrayLike<number>): boolean {
  const total = rgba.length / 4;
  if (total === 0) return false;
  let transparentes = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 128) transparentes++;
  return transparentes / total >= FRACCION_TRANSPARENTE_MINIMA;
}

/**
 * Deja limpio el alfa que entrega la IA, sin tocar el color de nadie. Modifica `rgba` en el lugar:
 *   · lo casi invisible (alfa de `UMBRAL_ALFA` para abajo: neblina, sombra tenue, halo) pasa a transparente del todo;
 *   · lo casi opaco (`ALFA_SOLIDA` para arriba) pasa a opaco del todo, así la tela no queda medio transparente;
 *   · lo de en medio —el borde suave de 1 o 2 píxeles— se respeta;
 *   · las piezas sueltas mucho más chicas que la prenda (una mota, un resto) se borran (`soloLaPrenda`); un conjunto de dos piezas se queda.
 * Las aberturas del diseño (un ojal, un escote) son alfa 255 en la imagen de la IA y no se tocan.
 */
export function limpiarAlfa(rgba: Uint8ClampedArray, ancho: number, alto: number): void {
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i];
    if (a <= UMBRAL_ALFA) rgba[i] = 0;
    else if (a >= ALFA_SOLIDA) rgba[i] = 255;
  }
  soloLaPrenda(rgba, ancho, alto);
}

/** La caja de lo que quedó visible, para recortar el aire transparente alrededor de la prenda. */
export function cajaVisible(rgba: ArrayLike<number>, ancho: number, alto: number): Caja | null {
  const c = cajaDeContenido(rgba, ancho, alto);
  return c ? { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto } : null;
}

/** El tamaño final del PNG: la caja de la prenda, achicada a `ALTO_MAX_RECORTE` de alto si es más alta (nunca se agranda). */
export function tamanoDelRecorte(caja: { ancho: number; alto: number }, altoMax = ALTO_MAX_RECORTE): { ancho: number; alto: number } {
  const escala = Math.min(1, altoMax / caja.alto);
  return { ancho: Math.max(1, Math.round(caja.ancho * escala)), alto: Math.max(1, Math.round(caja.alto * escala)) };
}

/** Por qué revisarlo antes de usarlo, o `null` si salió limpio. Con la transparencia de la IA, un hueco cerrado en medio de la tela casi
 *  siempre es una abertura del diseño (un ojal, un cut-out) y quien lo mira lo confirma con «Usar en el probador»; si fuera un defecto de
 *  la imagen, lo descarta y se cambia la foto. */
export function motivoDelRecorte(huecos: number | null): MotivoRecorte | null {
  return recorteAgujereado(huecos) ? "huecos" : null;
}

/** En palabras de la tienda, por qué un recorte quedó por revisar. */
export function textoDelMotivo(m: MotivoRecorte | null): string | null {
  if (m === "con_fondo") return "La foto se subió con su fondo, que no es blanco: mira que no se haya colado un pedazo.";
  if (m === "huecos") return "Quedaron huecos en la tela.";
  if (m === "sin_original") return "Se recortó desde la foto de la tienda porque no estaba la original.";
  return null;
}

/**
 * Dónde se guarda el recorte de una foto, en el mismo bucket: `fotos/<id>.jpg` → `recortes/<id>-<sello>.png` (el id de la foto, como el
 * original, y un sello de esa subida). Una foto de antes del ADR-0228 (en la raíz del bucket) usa su nombre sin la extensión.
 * El sello existe porque el almacén no deja pisar un archivo y, al chocar, responde con un error que deja colgada la subida siguiente
 * cerca de un minuto (medido el 2026-10-16 en el banco local): con un nombre que no se repite no hay choque ni reintento. El nombre lo
 * guarda `foto_recortes`, así que nadie tiene que adivinarlo.
 */
export function rutaDelRecorte(foto: string, sello: string): string {
  const base = (foto.split("/").pop() ?? foto).replace(/\.[^.]+$/, "");
  return `recortes/${base}-${sello}.png`;
}

// ---------------------------------------------------------------------------------------------------------------------
// La lectura de Vitrina ▸ Probador (`fn_vitrina_recortes`, 20261017003000)
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoRecorte = "listo" | "por_revisar" | "descartado";

export type RecorteDeFoto = { url: string; proporcion: number; estado: EstadoRecorte; motivo: MotivoRecorte | null };

export type FotoDelProbador = {
  /** El archivo de la foto en el bucket (`fotos/<id>.jpg`): la llave de `foto_recortes`. */
  foto: string;
  url: string;
  /** La URL del original, o `null` si no está en el almacén. */
  original: string | null;
  productoId: string;
  codigo: string | null;
  nombre: string;
  color: string | null;
  colorNombre: string | null;
  /** Unidades que vendió su modelo en 90 días: el orden en que se recorta. */
  vendidas: number;
  recorte: RecorteDeFoto | null;
};

const ESTADOS: readonly EstadoRecorte[] = ["listo", "por_revisar", "descartado"];
const MOTIVOS: readonly MotivoRecorte[] = ["huecos", "con_fondo", "sin_original"];

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function recorteDe(v: unknown): RecorteDeFoto | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const url = texto(r.url);
  const proporcion = Number(r.proporcion);
  const estado = ESTADOS.find((e) => e === r.estado);
  if (!url || !Number.isFinite(proporcion) || proporcion <= 0 || !estado) return null;
  return { url, proporcion, estado, motivo: MOTIVOS.find((m) => m === r.motivo) ?? null };
}

/** Lo que devuelve `fn_vitrina_recortes()`. Una foto mal formada se salta (no tumba la pantalla). */
export function leerRecortes(data: unknown): FotoDelProbador[] {
  const fotos = data && typeof data === "object" ? (data as { fotos?: unknown }).fotos : null;
  if (!Array.isArray(fotos)) return [];
  const salida: FotoDelProbador[] = [];
  for (const v of fotos) {
    if (!v || typeof v !== "object") continue;
    const f = v as Record<string, unknown>;
    const foto = texto(f.foto);
    const url = texto(f.url);
    const productoId = texto(f.producto_id);
    const nombre = texto(f.nombre);
    if (!foto || !url || !productoId || !nombre) continue;
    salida.push({
      foto,
      url,
      original: texto(f.original),
      productoId,
      codigo: texto(f.codigo),
      nombre,
      color: texto(f.color),
      colorNombre: texto(f.color_nombre),
      vendidas: Math.max(0, Math.trunc(Number(f.vendidas) || 0)),
      recorte: recorteDe(f.recorte),
    });
  }
  return salida;
}

export type CifrasRecortes = { fotos: number; listos: number; porRevisar: number; descartados: number; sinRecorte: number };

export function cifrasRecortes(fotos: readonly FotoDelProbador[]): CifrasRecortes {
  const c: CifrasRecortes = { fotos: fotos.length, listos: 0, porRevisar: 0, descartados: 0, sinRecorte: 0 };
  for (const f of fotos) {
    if (!f.recorte) c.sinRecorte++;
    else if (f.recorte.estado === "listo") c.listos++;
    else if (f.recorte.estado === "por_revisar") c.porRevisar++;
    else c.descartados++;
  }
  return c;
}

/** Las fotos que «Preparar recortes» tiene que recortar, en el orden de la lectura (lo que más se vende, primero). */
export function porRecortar(fotos: readonly FotoDelProbador[]): FotoDelProbador[] {
  return fotos.filter((f) => !f.recorte);
}

/** Las que esperan que alguien las mire antes de usarlas en el probador. */
export function porRevisar(fotos: readonly FotoDelProbador[]): FotoDelProbador[] {
  return fotos.filter((f) => f.recorte?.estado === "por_revisar");
}

/** La foto con su recorte nuevo (lo que devuelven `registrar_recorte` y `revisar_recorte`), sin volver a leer toda la lista. */
export function conRecorte(fotos: readonly FotoDelProbador[], foto: string, recorte: RecorteDeFoto): FotoDelProbador[] {
  return fotos.map((f) => (f.foto === foto ? { ...f, recorte } : f));
}

/** El recorte que devuelven `registrar_recorte` y `revisar_recorte`, con la URL armada desde la de su foto. */
export function recorteDeRespuesta(data: unknown, urlFoto: string): RecorteDeFoto | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const ruta = texto(r.recorte);
  const base = /^(https?:\/\/[^/?#]+\/storage\/v1\/object\/public\/retail-productos-fotos\/)/.exec(urlFoto)?.[1];
  if (!ruta || !base) return null;
  return recorteDe({ url: base + ruta, proporcion: r.proporcion, estado: r.estado, motivo: r.motivo });
}

/**
 * Cómo deshacer un recorte recién descartado (/formidable y /chaos, 2026-10-17): la pantalla recuerda cómo estaba —«listo» o «por
 * revisar»— y `deshacer_descarte_recorte` lo devuelve a eso solo si sigue descartado (si alguien ya decidió, responde
 * `recorte_ya_cambio` y no pisa nada) y lo anota en la Actividad. `null` si no hay nada que deshacer (ya estaba descartado).
 */
export function paraDeshacerElDescarte(foto: string, antes: RecorteDeFoto): { p_foto: string; p_estado: "listo" | "por_revisar" } | null {
  if (antes.estado === "descartado") return null;
  return { p_foto: foto, p_estado: antes.estado };
}

/** El motivo de un error de las funciones de recortes, en palabras de la pantalla (`null` si no es uno de ellas). */
export function errorDeRecorte(texto: string): string | null {
  if (texto.includes("recorte_sin_permiso")) return "Para guardar recortes necesitas la Vitrina web o poder editar el catálogo.";
  if (texto.includes("recorte_foto_no_existe")) return "Esa foto ya no está. Recarga la pantalla.";
  if (texto.includes("recorte_archivo_no_existe")) return "El recorte no llegó al almacén. Vuelve a intentarlo.";
  if (texto.includes("recorte_no_existe")) return "Esa foto todavía no tiene recorte. Recarga la pantalla.";
  if (texto.includes("recorte_ya_cambio")) return "No se deshizo: alguien ya decidió ese recorte. Recarga para verlo.";
  if (texto.includes("recorte_datos_invalidos")) return "El recorte no salió bien. Vuelve a intentarlo.";
  return null;
}
