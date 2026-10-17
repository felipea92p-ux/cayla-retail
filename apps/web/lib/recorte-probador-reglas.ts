// El recorte de una foto de prenda para el probador de la tienda online (ADR-0434, actividad 1). Lógica pura, sin navegador: la usan
// `recorte-probador.ts` (que dibuja en un canvas) y sus pruebas. Sin imports de `@/`, como `foto-encuadre.ts`.
//
// EL PROBLEMA. El probador apila prendas a su tamaño real y para encimarlas cada una tiene que estar recortada, con fondo
// transparente. La foto que se ve en la tienda es un JPG sobre blanco (ADR-0228) y NO se toca (Felipe, 2026-10-16): el recorte es un
// archivo más. Para que sea la MISMA prenda que muestra la ficha —su luz, su nitidez, su encuadre—, los colores salen de esa foto y
// lo único que se agrega es la transparencia: la máscara de MODNet, calculada otra vez sobre el original (`originales/<id>.jpg`, el
// mismo archivo que se recortó al subirla) y llevada al lugar donde quedó la prenda en la foto.

import { cajaDeContenido, encuadrar, LIENZO_FOTO, MARGEN_PRENDA, recorteAgujereado, type Caja } from "./foto-encuadre";

/** El recorte más alto que se guarda. Una prenda del probador no pasa de ~400 px en un celular (2,5 px por cm): 1000 px sobra para
 *  una pantalla con el doble de densidad, y un PNG de ese alto pesa 200–600 KB. */
export const ALTO_MAX_RECORTE = 1000;

/** Desde qué fracción de fondo blanco se da por hecho que la foto se subió «Sin fondo». Las fotos sin fondo tienen el fondo de
 *  #ffffff puro (lo pintó `sobreBlanco`); el JPEG lo mueve uno o dos tonos. Una foto «Con fondo» sobre una pared clara no llega. */
export const FRACCION_FONDO_BLANCO = 0.97;

/** Desde qué tono (0–255, en el canal más oscuro) un píxel cuenta como blanco del fondo. */
export const TONO_BLANCO = 245;

/** Por qué un recorte queda «por revisar» (los valores de `foto_recortes.motivo`). */
export type MotivoRecorte = "huecos" | "con_fondo" | "sin_original";

/**
 * Dónde dibujar la máscara ENTERA (del tamaño del original) dentro de la foto de la tienda (1200×1500) para que la prenda caiga
 * exactamente donde quedó al subirla. Es la cuenta de `prepararFotoPrenda` al revés:
 *   · «Sin fondo»: la caja de la prenda (`cajaPrenda`, en el original) se encuadró con `MARGEN_PRENDA`.
 *   · «Con fondo»: el original entero se encuadró sin margen.
 * Devuelve el rectángulo de destino de la máscara completa (puede salirse del lienzo: lo de afuera no se ve).
 */
export function destinoDeLaMascara(original: { ancho: number; alto: number }, cajaPrenda: Caja, sinFondo: boolean): Caja {
  if (!sinFondo) return encuadrar(original, LIENZO_FOTO, 0);
  const d = encuadrar(cajaPrenda, LIENZO_FOTO, MARGEN_PRENDA);
  const escala = d.ancho / cajaPrenda.ancho;
  return {
    x: d.x - cajaPrenda.x * escala,
    y: d.y - cajaPrenda.y * escala,
    ancho: original.ancho * escala,
    alto: original.alto * escala,
  };
}

/**
 * ¿Lo que la máscara deja afuera es el blanco puro de una foto «Sin fondo»? Mira solo los píxeles que la máscara marca como fondo
 * (alfa bajo) y cuenta cuántos son blancos. Sin fondo que mirar, no se puede decir: `false`.
 */
export function esFondoBlanco(rgbaFoto: ArrayLike<number>, alfa: ArrayLike<number>, umbralAlfa = 16): boolean {
  let fondo = 0;
  let blancos = 0;
  for (let i = 0, p = 0; i < alfa.length; i++, p += 4) {
    if (alfa[i] > umbralAlfa) continue;
    fondo++;
    if (Math.min(rgbaFoto[p], rgbaFoto[p + 1], rgbaFoto[p + 2]) >= TONO_BLANCO) blancos++;
  }
  return fondo > 0 && blancos / fondo >= FRACCION_FONDO_BLANCO;
}

/**
 * Le pone la transparencia a la foto y le saca el blanco que se le mezcló en los bordes. Sobre blanco, un borde con alfa `a` se
 * pintó como `a·color + (1 − a)·255`: se despeja el color de la prenda. Sin eso, el borde queda con un halo claro que se nota sobre
 * una prenda oscura. Escribe en `rgba` (los píxeles de la foto) y deja el alfa de la máscara. `blanco = false` (foto con su fondo):
 * solo pone el alfa, porque el fondo no era blanco y no hay qué despejar.
 */
export function aplicarAlfa(rgba: Uint8ClampedArray, alfa: ArrayLike<number>, blanco: boolean): void {
  for (let i = 0, p = 0; i < alfa.length; i++, p += 4) {
    const a = alfa[i];
    rgba[p + 3] = a;
    if (!blanco || a === 0 || a >= 250) continue;
    const f = a / 255;
    for (let k = 0; k < 3; k++) rgba[p + k] = (rgba[p + k] - 255 * (1 - f)) / f;
  }
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

/** Por qué revisarlo antes de usarlo, o `null` si salió limpio. Un fondo que no es blanco (la foto se subió «Con fondo» sobre una
 *  pared o una tela) pesa más que los huecos: lo más probable es que se haya colado un pedazo. Una foto «Con fondo» sobre blanco parejo
 *  (la de un proveedor) se recorta igual de limpio que una «Sin fondo». Los huecos pesan más que la falta del original. */
export function motivoDelRecorte(h: { huecos: number | null; fondoBlanco: boolean; conOriginal: boolean }): MotivoRecorte | null {
  if (!h.fondoBlanco) return "con_fondo";
  if (recorteAgujereado(h.huecos)) return "huecos";
  if (!h.conOriginal) return "sin_original";
  return null;
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

/** El motivo de un error de las funciones de recortes, en palabras de la pantalla (`null` si no es uno de ellas). */
export function errorDeRecorte(texto: string): string | null {
  if (texto.includes("recorte_sin_permiso")) return "Para guardar recortes necesitas la Vitrina web o poder editar el catálogo.";
  if (texto.includes("recorte_foto_no_existe")) return "Esa foto ya no está. Recarga la pantalla.";
  if (texto.includes("recorte_archivo_no_existe")) return "El recorte no llegó al almacén. Vuelve a intentarlo.";
  if (texto.includes("recorte_no_existe")) return "Esa foto todavía no tiene recorte. Recarga la pantalla.";
  if (texto.includes("recorte_datos_invalidos")) return "El recorte no salió bien. Vuelve a intentarlo.";
  return null;
}
