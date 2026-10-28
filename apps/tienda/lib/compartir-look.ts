import { tituloPartido } from "./grupos";
import { busquedaConLook, colorDeLaPieza, presentes, type FotoDelColor, type Look, type PrendaDelProbador, type Zona } from "./probador";

// Compartir un look de «Arma el tuyo» (ADR-0434, actividad 9): el enlace público (`/tu-look?p=…`, sin cuenta y sin precios), la frase
// que lo acompaña y cómo se acomodan las prendas en las dos imágenes que se arman con `next/og`: la vista previa del enlace (1200×630,
// la que muestra WhatsApp) y la imagen para estados (1080×1920, lienzo v3, pantalla 9). Lógica pura, con su prueba al lado.
//
// En ninguna imagen pública va un texto que llegue en la dirección: solo los nombres de las prendas, que salen de la base. Si la vista
// previa dijera lo que trae `?n=`, cualquiera podría armar una imagen con la marca de CAYLA y su propio texto. El nombre del look solo va
// en la imagen para estados, que se arma para la cuenta dueña del look.

/** La página pública del look. */
export const RUTA_TU_LOOK = "/tu-look";

/** `/tu-look?p=TOP-0053.RPA~PAN-0012.CAM`: el look que se comparte (el mismo formato del probador). */
export const hrefTuLook = (codigo: string): string => `${RUTA_TU_LOOK}${busquedaConLook("", codigo)}`;

/**
 * El enlace que se comparte desde «Compartir tu look», con su marca de camino (ADR-0495): quien lo abre cuenta en Tienda web ▸ Tráfico como
 * llegado por WhatsApp, donde se comparte casi siempre (sus estados y sus chats). Si se comparte por otra aplicación, igual dirá WhatsApp:
 * la hoja del celular no cuenta a cuál fue. Se agrega al final, sin volver a escribir el look (sus `~` quedan tal cual).
 */
export function enlaceParaCompartir(origen: string, codigo: string): string {
  const href = hrefTuLook(codigo);
  return `${origen}${href}${href.includes("?") ? "&" : "?"}utm_source=whatsapp`;
}

/** La dirección de la tienda, como se ve en las imágenes. */
export const DOMINIO_A_LA_VISTA = "tienda.cayla.pe";

/** Lo que acompaña al enlace cuando se comparte: el enlace va dentro, porque al compartir una imagen algunas aplicaciones lo pierden. */
export const textoAlCompartir = (url: string): string => `Mira mi look en CAYLA: ${url}`;

/** «Top Estela, Wide Leg y Cartera Crescent»: las prendas del look, para la descripción del enlace. */
export function listaDeNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** El nombre de la imagen para estados, al compartirla o descargarla. */
export const ARCHIVO_DE_LA_HISTORIA = "mi-look-cayla.png";

/* ---------------- Las prendas en las imágenes ---------------- */

/** Las tarjetas son de tres tamaños, según lo que llevan: lo largo (un pantalón, un vestido), lo de arriba y el bolso. */
export type ClaseDeTarjeta = "alta" | "media" | "chica";

export const claseDeTarjeta = (zona: Zona): ClaseDeTarjeta => (zona === "bolso" ? "chica" : zona === "abajo" || zona === "vestido" ? "alta" : "media");

export type PiezaDeLaImagen = { nombre: string; foto: FotoDelColor; clase: ClaseDeTarjeta };

/** Las prendas del look, en el orden de sus números (el de las zonas), con la foto que se ve de su color. */
export function piezasDeLaImagen(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>): PiezaDeLaImagen[] {
  return presentes(look).flatMap((z) => {
    const p = indice.get(look[z]!.id);
    return p ? [{ nombre: p.nombre, foto: colorDeLaPieza(p, look[z]!).foto, clase: claseDeTarjeta(z) }] : [];
  });
}

/* ---------------- Dónde va cada tarjeta ---------------- */

// Las medidas son las del lienzo (la imagen para estados mide 390×693 ahí; se dibuja a 1080×1920, ×2,77). Dos columnas: en la de la
// izquierda, la primera y la tercera prenda; en la de la derecha, la segunda y la cuarta. La derecha empieza un poco más arriba, cada
// tarjeta tapa apenas el borde de papel de la de arriba (en el lienzo tapaba 34 px, y con eso el nombre de la prenda de arriba) y cada
// una va girada a su lado. Con tres, la tercera se corre un poco hacia el centro sin tapar el nombre de la de la derecha. Si no cabe,
// todo se achica igual, desde el centro de cada columna.

export type Tarjeta = { x: number; y: number; w: number; h: number; giro: number };

const TAMANO: Record<ClaseDeTarjeta, { w: number; h: number }> = { alta: { w: 166, h: 262 }, media: { w: 162, h: 200 }, chica: { w: 150, h: 160 } };
const GIROS = [-7, 5, -2, 4];
const CENTRO_IZQUIERDA = 105;
const CENTRO_DERECHA = 279;
const CENTRO_TERCERA_SOLA = 118;
const DESFASE_DERECHA = 36;
const TAPA = 10;

/** Las tarjetas dentro de una franja de alto (`arriba` a `abajo`, en medidas del lienzo), en el orden de las prendas. */
export function tarjetasDelLook(clases: readonly ClaseDeTarjeta[], franja: { arriba: number; abajo: number }): Tarjeta[] {
  const n = Math.min(clases.length, 4);
  if (n === 0) return [];
  const columna = (i: number): "izq" | "der" => (n === 1 ? "izq" : i % 2 === 0 ? "izq" : "der");
  const altoDe = (lado: "izq" | "der") => {
    const altos = clases.slice(0, n).flatMap((c, i) => (columna(i) === lado ? [TAMANO[c].h] : []));
    return altos.length === 0 ? 0 : altos.reduce((a, b) => a + b, 0) - TAPA * (altos.length - 1);
  };
  const alto = Math.max(altoDe("izq") + (n > 1 ? DESFASE_DERECHA : 0), altoDe("der"));
  const espacio = franja.abajo - franja.arriba;
  const k = Math.min(1, espacio / alto);
  const y0 = franja.arriba + (espacio - alto * k) / 2;
  const usado = { izq: n > 1 ? DESFASE_DERECHA * k : 0, der: 0 };
  return clases.slice(0, n).map((c, i) => {
    const lado = columna(i);
    const w = Math.round(TAMANO[c].w * k);
    const alto = TAMANO[c].h * k;
    const centro = n === 1 ? (CENTRO_IZQUIERDA + CENTRO_DERECHA) / 2 : n === 3 && i === 2 ? CENTRO_TERCERA_SOLA : lado === "izq" ? CENTRO_IZQUIERDA : CENTRO_DERECHA;
    const y = Math.round(y0 + usado[lado]);
    usado[lado] += alto - TAPA * k;
    // Redondeado, el borde de abajo no se pasa de la franja.
    return { x: Math.round(centro - w / 2), y, w, h: Math.min(Math.round(alto), Math.floor(franja.abajo) - y), giro: GIROS[i] };
  });
}

/** Lo que ocupan las tarjetas, de borde a borde (la vista previa las acomoda a la derecha). */
export function bordesDe(tarjetas: readonly Tarjeta[]): { x: number; y: number; w: number; h: number } {
  if (tarjetas.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...tarjetas.map((t) => t.x));
  const y = Math.min(...tarjetas.map((t) => t.y));
  return { x, y, w: Math.max(...tarjetas.map((t) => t.x + t.w)) - x, h: Math.max(...tarjetas.map((t) => t.y + t.h)) - y };
}

/** La foto dentro de su recuadro, entera y sin deformarse: el ancho y el alto que le tocan por su proporción (ancho ÷ alto). */
export function fotoContenida(caja: { w: number; h: number }, proporcion: number): { w: number; h: number } {
  const p = proporcion > 0 && Number.isFinite(proporcion) ? proporcion : 1;
  return caja.w / caja.h > p ? { w: Math.round(caja.h * p), h: Math.round(caja.h) } : { w: Math.round(caja.w), h: Math.round(caja.w / p) };
}

/** El nombre del look en la imagen para estados: la última palabra aparte (va en cursiva, en el rosado de la marca) y su tamaño (en
 *  medidas del lienzo) por su renglón más largo, para que no baje sobre las tarjetas. */
export function tituloDeLaHistoria(nombre: string): { antes: string; ultima: string; tamano: number } {
  const [antes, ultima] = tituloPartido(nombre);
  const largo = Math.max(antes.length, ultima.length);
  return { antes, ultima, tamano: largo <= 10 ? 56 : largo <= 14 ? 46 : largo <= 18 ? 38 : 32 };
}
