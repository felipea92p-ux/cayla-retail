// La página PÚBLICA del Club CAYLA en tres pasos (ADR-0288 act. g; diseño aprobado por Felipe el 2026-10-01): al escanear el QR,
// sus datos y «ya eres socia». Lo que la pantalla calcula para dibujarlos. Lógica pura, sin React ni red: la usan
// `components/clientas/RegistroClub.tsx` y `components/clientas/club-publico-pasos.tsx`.
//
// CONTRATO
//   PROMETE: las cifras del inicio salen de lo que contesta `fn_club_pagina` (el % del cumpleaños, la escala del vale y el
//            umbral que hace contar un año), nunca escritas a mano; la barra de avance del formulario cuenta lo MISMO que su guía
//            de foco (`camposDelRegistro`): lo requerido hecho sobre lo requerido; «¿este mes es su cumpleaños?», «hasta el 31 de
//            octubre» y «Socia desde oct. 2026» con el calendario de Lima.
//   ASUME:   `hoy` es `aaaa-mm-dd` de Lima (`hoyLima()`); el mes de nacimiento es el que ella eligió en el formulario («1»…«12»).
//   NO HACE: no decide quién tiene cupón: el aviso de cumpleaños repite el beneficio vigente para quien nació este mes; el canje
//            lo valida la caja. Tampoco agrega reglas a la guía: la barra solo cuenta lo que la guía ya dice.

import { MESES_DEL_ANIO } from "./club-cumple-reglas";
import { formatoPct, formatoSoles, type PaginaClub } from "./club-registro-reglas";
import { hoyLima } from "./fechas-lima";
import type { CampoDeGuia } from "./guia-campos";

/* ------------------------------------------------------------------ Paso 1: al escanear */

/** Los textos fijos del inicio (el diseño aprobado). Van en minúsculas: la página pone en versalitas lo que el diseño pide así. */
export const INICIO = {
  antetitulo: "Únete gratis",
  tituloArriba: "Tu mes,",
  tituloAbajo: "tu regalo.",
  bajada: "Un descuento en tu cumpleaños y un vale de compra cada año en CAYLA.",
  boton: "Quiero unirme",
  bajoBoton: "Es gratis y te toma un minuto · solo mayores de 18",
} as const;

/** Una barra de la mini escalera del vale: su año, su monto y su alto en % (la más alta, 100). */
export type BarraVale = { anio: number; monto: number; alto: number };

/** El alto de la barra más baja: con 0 no se vería, y el dibujo tiene que leerse como una escalera que sube. */
const ALTO_MINIMO = 30;

/**
 * La mini escalera del vale de aniversario: una barra por año de la escala vigente, de menor a mayor año, con alto proporcional a
 * su monto (la más chica, 30 %; la más grande, 100 %). Con un solo monto, todas al 100 %.
 */
export function barrasDelVale(escala: readonly { anio: number; monto: number }[]): BarraVale[] {
  const filas = [...escala].sort((a, b) => a.anio - b.anio);
  const montos = filas.map((f) => f.monto);
  const min = Math.min(...montos);
  const max = Math.max(...montos);
  return filas.map((f) => ({
    anio: f.anio,
    monto: f.monto,
    alto: max === min ? 100 : Math.round((ALTO_MINIMO + ((100 - ALTO_MINIMO) * (f.monto - min)) / (max - min)) * 10) / 10,
  }));
}

/** «de S/ 20 a S/ 60, que crece contigo»: del vale del primer año al del último. Si no sube, solo «de S/ 20». */
export function rangoDelVale(escala: readonly { anio: number; monto: number }[]): string {
  const filas = [...escala].sort((a, b) => a.anio - b.anio);
  const primero = filas[0];
  const ultimo = filas[filas.length - 1];
  if (!primero || !ultimo) return "";
  return ultimo.monto > primero.monto
    ? `de ${formatoSoles(primero.monto)} a ${formatoSoles(ultimo.monto)}, que crece contigo`
    : `de ${formatoSoles(primero.monto)}`;
}

/** Las tres tarjetas del inicio, en orden: el % del cumpleaños, el vale con su escalera y lo nuevo por WhatsApp. */
export type TarjetaInicio =
  | { tipo: "cumple"; cifra: string; fuerte: string; resto: string }
  | { tipo: "vale"; barras: BarraVale[]; fuerte: string; resto: string }
  | { tipo: "whatsapp"; fuerte: string; resto: string };

export function tarjetasDelInicio(p: PaginaClub): TarjetaInicio[] {
  const rango = rangoDelVale(p.escala);
  return [
    { tipo: "cumple", cifra: `${formatoPct(p.pct)} %`, fuerte: "En tu mes de cumpleaños", resto: ", en una compra en cualquier tienda CAYLA." },
    // El asterisco lleva a la nota del umbral, al pie (`notaDelUmbral`): el vale no es por cualquier año, solo por el que cuenta.
    { tipo: "vale", barras: barrasDelVale(p.escala), fuerte: "Un vale cada aniversario", resto: `${rango ? `, ${rango}` : ""}.*` },
    { tipo: "whatsapp", fuerte: "Lo nuevo, primero", resto: ", por WhatsApp. Solo si quieres." },
  ];
}

/** «*Un año cuenta si hiciste 6 compras o sumaste S/ 600 en compras.»: el umbral vigente del vale, al pie del inicio. */
export function notaDelUmbral(p: PaginaClub): string {
  return `*Un año cuenta si hiciste ${p.compras} ${p.compras === 1 ? "compra" : "compras"} o sumaste ${formatoSoles(p.montoMinimo)} en compras.`;
}

/* ------------------------------------------------------------------ Paso 2: sus datos */

/** La barra de avance: cuánto de lo requerido está hecho y las dos frases que la acompañan. */
export type Avance = {
  hechos: number;
  total: number;
  /** De 0 a 1: el ancho de la barra. */
  fraccion: number;
  /** A la izquierda: «Empecemos», «Vas bien», «Ya casi» o «Todo listo» (sin género). */
  estado: string;
  /** A la derecha: «Te falta aceptar», «2 de 5 listos» (si falta más de una cosa) o «Ya puedes unirte». */
  falta: string;
};

/** Cómo se dice lo que falta de cada campo en «Te falta …». Un campo que no está aquí usa su nombre. */
const QUE_FALTA: Record<string, string> = {
  documento: "tu documento",
  nombre: "tu nombre",
  celular: "tu celular",
  nacimiento: "tu fecha de nacimiento",
  correo: "revisar tu correo",
  mayor: "confirmar tu edad",
  terminos: "aceptar",
};

/**
 * El avance REAL del formulario: lo requerido que la guía de foco da por hecho, sobre todo lo requerido. Lo opcional (el correo
 * vacío, la casilla de WhatsApp) no suma ni resta: la barra llega al final sin ellos, igual que se enciende el botón «Unirme».
 */
export function avanceDelRegistro(campos: readonly CampoDeGuia[]): Avance {
  const requeridos = campos.filter((c) => c.requerido);
  const faltan = requeridos.filter((c) => !c.hecho);
  const total = requeridos.length;
  const hechos = total - faltan.length;
  const fraccion = total === 0 ? 1 : hechos / total;
  const estado = faltan.length === 0 ? "Todo listo" : hechos === 0 ? "Empecemos" : faltan.length <= 2 ? "Ya casi" : "Vas bien";
  const unico = faltan.length === 1 ? faltan[0] : undefined;
  const falta =
    faltan.length === 0
      ? "Ya puedes unirte"
      : unico
        ? `Te falta ${QUE_FALTA[unico.id] ?? unico.nombre.toLocaleLowerCase("es")}`
        : `${hechos} de ${total} listos`;
  return { hechos, total, fraccion, estado, falta };
}

/** «MQ» de «Mariela Q. R.»: la inicial de su nombre y la de su primer apellido, para el círculo del «¿Eres …?». */
export function iniciales(nombreAMedias: string): string {
  return nombreAMedias
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toLocaleUpperCase("es"))
    .join("");
}

/* ------------------------------------------------------------------ Paso 3: ya es socia */

/** ¿Nació en el mes en que está hoy Lima? `mes` es el del formulario («1»…«12»). */
export function esMesDeCumple(mes: string, hoy: string): boolean {
  const m = Number(mes.trim());
  return mes.trim() !== "" && Number.isInteger(m) && m >= 1 && m <= 12 && m === Number(hoy.slice(5, 7));
}

/** «31 de octubre»: el último día del mes de `hoy` (con febrero bisiesto). */
export function ultimoDiaDelMes(hoy: string): string {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${dias} de ${(MESES_DEL_ANIO[mes - 1] ?? "").toLocaleLowerCase("es")}`;
}

/**
 * «¡Este mes es tu cumpleaños! Tienes 10 % en una compra hasta el 31 de octubre.»: solo si nació en el mes en curso de Lima.
 * El % es el vigente (`fn_club_pagina`); el beneficio vale durante todo su mes (Términos, sección 3).
 */
export function avisoDeCumple(p: PaginaClub, mes: string, hoy: string): { titulo: string; texto: string } | null {
  if (!esMesDeCumple(mes, hoy)) return null;
  return { titulo: "¡Este mes es tu cumpleaños!", texto: `Tienes ${formatoPct(p.pct)} % en una compra hasta el ${ultimoDiaDelMes(hoy)}.` };
}

const MESES_CORTOS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];

/**
 * «Socia desde oct. 2026», para su tarjeta de socia: el mes y el año en que se unió, en hora de Lima (las 9 p. m. del 30 de
 * setiembre en Lima ya son 1 de octubre para el servidor). Acepta `aaaa-mm-dd` o un instante con zona. null si no se entiende.
 */
export function sociaDesde(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.trim();
  let iso: string | null = /^\d{4}-\d{2}-\d{2}$/.test(limpio) ? limpio : null;
  if (!iso) {
    const t = Date.parse(limpio);
    if (Number.isNaN(t)) return null;
    iso = hoyLima(new Date(t));
  }
  const mes = MESES_CORTOS[Number(iso.slice(5, 7)) - 1];
  return mes ? `Miembro desde ${mes} ${iso.slice(0, 4)}` : null;
}

/** Los colores de los pétalos: los de la marca, como nombres de token de `globals.css` (`var(--color-<nombre>)`). */
export const COLORES_PETALO = ["rojo", "sand", "taupe", "rojo-profundo", "grafico-neutro"] as const;

export type Petalo = {
  /** % desde la izquierda de la página. */
  izquierda: number;
  ancho: number;
  alto: number;
  color: (typeof COLORES_PETALO)[number];
  /** ms que tarda en caer, y cuándo empieza. */
  duracion: number;
  retraso: number;
};

/**
 * Los pétalos que caen UNA vez al llegar a «ya eres socia»: siempre los mismos (sin azar), repartidos a lo ancho, de tres
 * tamaños, en los cinco colores de la marca y escalonados para que no caigan en bloque (el diseño aprobado: 18).
 */
export function petalos(cantidad = 18): Petalo[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    izquierda: ((i * 37) % 96) + 2,
    ancho: 8 + (i % 3) * 3,
    alto: 12 + (i % 4) * 3,
    color: COLORES_PETALO[i % COLORES_PETALO.length]!,
    duracion: 2400 + (i % 5) * 260,
    retraso: 200 + ((i * 90) % 900),
  }));
}
