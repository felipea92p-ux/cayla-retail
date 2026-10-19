import { contraste, luminancia, mezclar } from "./contraste";
import { PALETAS, coloresEnTema, paletaPorId, type Colores, type Paleta, type Tema } from "./paletas";

// EL DISEÑO DE LA PORTADA DE UNA CAMPAÑA (ADR-0436; maqueta docs/maquetas/campanas-diseno-2026-10). Es el contrato entre el ERP, que lo
// arma y lo guarda (`retail.campana_disenos`), y la tienda, que lo pinta (`retail.tienda_portada()`). Libertad dentro de un marco: cada
// opción sale de una lista curada (colores con su contraste medido, estampados dibujados por CAYLA, cuatro acomodos), así la primera
// portada con letra amarilla sobre crema no llega a ningún cliente.

export const FONDOS = ["degradado", "liso", "dibujo", "foto"] as const;
export const PATRONES = ["huellitas", "rayas", "puntos", "cuadros", "corazones", "estrellas", "confeti", "ondas"] as const;
export const INTENSIDADES = ["suave", "medio", "fuerte"] as const;
export const ACOMODOS = ["polaroids", "grande", "mosaico", "letras"] as const;
export const TAMANOS = ["grande", "enorme"] as const;
export const SELLOS = ["ninguno", "descuento", "dias", "nuevo"] as const;
/** La frase propia: una línea en la computadora, dos en el celular. */
export const FRASE_MAX = 60;
/** Cuántas prendas caben en la portada (el mosaico es el que más lleva). */
export const PRENDAS_MAX = 4;
/** Cuánto se puede oscurecer la foto del fondo (y con cuánto empieza): por debajo la letra casi nunca se lee, por encima la foto no se ve. */
export const OSCURO_MIN = 0.15;
export const OSCURO_MAX = 0.9;
export const OSCURO_DE_FABRICA = 0.45;

export type Fondo = (typeof FONDOS)[number];
export type Patron = (typeof PATRONES)[number];
export type Intensidad = (typeof INTENSIDADES)[number];
export type Acomodo = (typeof ACOMODOS)[number];
export type Tamano = (typeof TAMANOS)[number];
export type Sello = (typeof SELLOS)[number];

/** Los colores de una paleta propia («Mi color», o sacada de una prenda): una paleta sin id. */
export type ColoresPropios = Omit<Paleta, "id">;

export type DisenoDeCampana = {
  /** El id de una paleta curada, o «propia» (sus colores van en `colores`). */
  paleta: string;
  colores: ColoresPropios | null;
  fondo: Fondo;
  patron: Patron;
  intensidad: Intensidad;
  acomodo: Acomodo;
  /** Desde qué palabra del nombre va la cursiva; `null`: la última (como hoy). */
  corte: number | null;
  tamano: Tamano;
  frase: string;
  /** Los modelos que salen en la portada, en orden; `null`: los elige la web. */
  prendas: string[] | null;
  cuenta: boolean;
  pctGigante: boolean;
  colibri: boolean;
  sello: Sello;
  /** La foto del fondo «Con foto» (su dirección pública en el almacén de la campaña); puede quedarse con otro fondo. */
  foto: string | null;
  /** El color de lo más claro de la foto, medido al subirla: con él la revisión sabe si la letra se lee sin abrir la foto. */
  fotoTono: string | null;
  /** Cuánto se oscurece la foto con el color de la campaña (`OSCURO_MIN` a `OSCURO_MAX`). */
  oscuro: number;
};

/**
 * La portada de siempre: el rojo CAYLA en degradado con tres polaroids y, si hay descuento, el «−15%» calado detrás de las fotos. Una
 * campaña sin diseño se ve así (es la portada que ya veía el cliente antes de ADR-0436: por eso el % gigante viene puesto).
 */
export const DISENO_DE_SIEMPRE: DisenoDeCampana = {
  paleta: "cayla",
  colores: null,
  fondo: "degradado",
  patron: "huellitas",
  intensidad: "medio",
  acomodo: "polaroids",
  corte: null,
  tamano: "grande",
  frase: "",
  prendas: null,
  cuenta: true,
  pctGigante: true,
  colibri: true,
  sello: "ninguno",
  foto: null,
  fotoTono: null,
  oscuro: OSCURO_DE_FABRICA,
};

export type Estilo = { id: string; nombre: string; nota: string; cambia: Partial<DisenoDeCampana> };

/** Los ocho puntos de partida: un toque y la portada queda lista; después se cambia lo que se quiera. */
export const ESTILOS: readonly Estilo[] = [
  { id: "hoy", nombre: "Clásico CAYLA", nota: "El de hoy", cambia: {} },
  // Los que ya dicen el descuento de otra forma (el sello, la teja del mosaico) o lo dejan de lado no llevan además el % gigante: dos «−15%»
  // en la misma portada se pelean (maqueta, `ESTILOS`).
  {
    id: "huellitas",
    nombre: "Huellitas",
    nota: "Dibujo y sello",
    cambia: { paleta: "caramelo", fondo: "dibujo", patron: "huellitas", sello: "descuento", pctGigante: false },
  },
  { id: "galeria", nombre: "Galería", nota: "Claro y ordenado", cambia: { paleta: "arena", fondo: "liso", acomodo: "mosaico", colibri: false, pctGigante: false } },
  { id: "gala", nombre: "Noche de gala", nota: "Una foto grande", cambia: { paleta: "noche", acomodo: "grande", pctGigante: true } },
  {
    id: "cartel",
    nombre: "Cartel",
    nota: "Solo letras",
    cambia: { paleta: "negro-rojo", fondo: "liso", acomodo: "letras", tamano: "enorme", pctGigante: true, sello: "dias", colibri: false },
  },
  {
    id: "suave",
    nombre: "Suave",
    nota: "Corazones",
    cambia: { paleta: "rosa", fondo: "dibujo", patron: "corazones", intensidad: "suave", acomodo: "grande", pctGigante: false },
  },
  { id: "bosque", nombre: "Bosque", nota: "Estrellas", cambia: { paleta: "bosque", fondo: "dibujo", patron: "estrellas", acomodo: "mosaico", pctGigante: false } },
  { id: "fiesta", nombre: "Fiesta", nota: "Confeti", cambia: { paleta: "terracota", fondo: "dibujo", patron: "confeti", sello: "nuevo", pctGigante: false } },
];

/** Empezar con un estilo: todo vuelve al de siempre más lo del estilo; el texto, las prendas y la foto que ya se eligieron se quedan. */
export function aplicarEstilo(d: DisenoDeCampana, id: string): DisenoDeCampana {
  const estilo = ESTILOS.find((e) => e.id === id);
  if (!estilo) return d;
  return { ...DISENO_DE_SIEMPRE, ...estilo.cambia, frase: d.frase, prendas: d.prendas, corte: d.corte, foto: d.foto, fotoTono: d.fotoTono, oscuro: d.oscuro };
}

/** El estilo del que parece salir el diseño (mismos colores, fondo y acomodo); `null` si ya es otro («Personalizado»). */
export function estiloDelDiseno(d: DisenoDeCampana): Estilo | null {
  return (
    ESTILOS.find((e) => {
      const base = { ...DISENO_DE_SIEMPRE, ...e.cambia };
      return (
        d.colores === null &&
        base.paleta === d.paleta &&
        base.fondo === d.fondo &&
        base.acomodo === d.acomodo &&
        (d.fondo !== "dibujo" || base.patron === d.patron)
      );
    }) ?? null
  );
}

/* ---------------- Las prendas de la portada ---------------- */

/** Cuántas prendas muestra cada acomodo: tres polaroids, una foto grande, cuatro en mosaico (tres en el celular), ninguna con solo letras. */
const CABEN: Readonly<Record<Acomodo, number>> = { polaroids: 3, grande: 1, mosaico: PRENDAS_MAX, letras: 0 };

export function piezasQueCaben(d: DisenoDeCampana | null): number {
  return CABEN[d?.acomodo ?? "polaroids"];
}

/**
 * Las prendas que salen en la portada, en su orden: las que se eligieron en el diseño («Las prendas»), las que de ellas se pueden mostrar
 * aquí, en el orden en que se tocaron; si no se eligió ninguna, o ninguna de las elegidas se puede mostrar (no tiene foto publicada, no
 * está en la tienda elegida), las que la web elige sola (`disponibles`, ya en su orden). La usan la tienda y la vista previa del ERP.
 */
export function prendasElegidas<T extends { id: string }>(disponibles: readonly T[], d: DisenoDeCampana | null): T[] {
  const porId = new Map(disponibles.map((p) => [p.id, p]));
  const elegidas = (d?.prendas ?? []).flatMap((id) => porId.get(id) ?? []);
  return elegidas.length > 0 ? elegidas : [...disponibles];
}

/* ---------------- Los colores ---------------- */

const CREMA = "#f6efe6"; // tema-fijo: la letra clara de la portada (la de los tokens de la tienda)
const TINTA = "#1a1a18"; // tema-fijo: la letra oscura de la portada
const NEGRO = "#000000"; // tema-fijo: para oscurecer un color
const BLANCO = "#ffffff"; // tema-fijo: para aclarar un color

/** El color con que abre el selector de «Mi color» antes de elegir uno (un verde azulado que se lee con la letra clara). */
export const COLOR_PROPIO_DE_PARTIDA = "#2f6f73"; // tema-fijo: un dato de la portada, no del tema

/** La paleta con que se pinta el diseño: la curada por su id o la propia con sus colores. */
export function paletaDelDiseno(d: DisenoDeCampana): Paleta {
  if (d.paleta === "propia" && d.colores) return { id: "propia", ...d.colores };
  return paletaPorId(d.paleta);
}

export function coloresDelDiseno(d: DisenoDeCampana, tema: Tema): Colores {
  return coloresEnTema(paletaDelDiseno(d), tema);
}

/**
 * «Mi color»: la letra (crema o tinta) se elige sola, la que más se lee; el segundo tono y el acento salen del mismo color. Un color claro
 * trae su versión de noche, para no encandilar en modo oscuro.
 */
export function paletaPropia(hex: string): ColoresPropios {
  const fondo = hex.toLowerCase();
  const letra = contraste(CREMA, fondo) >= contraste(TINTA, fondo) ? CREMA : TINTA;
  const clara = letra === TINTA;
  return {
    nombre: "Mi color",
    fondo,
    fondo2: mezclar(fondo, BLANCO, clara ? 0.4 : 0.16),
    letra,
    acento: clara ? mezclar(fondo, NEGRO, 0.62) : mezclar(fondo, BLANCO, 0.7),
    ...(clara ? { noche: { fondo: mezclar(fondo, NEGRO, 0.78), fondo2: mezclar(fondo, NEGRO, 0.7), letra: CREMA, acento: mezclar(fondo, BLANCO, 0.35) } } : {}),
  };
}

/** Si ni la letra clara ni la oscura se leen sobre un color: el mismo color, apenas más oscuro, que sí se lee con la letra clara. */
export function colorQueSeLee(hex: string): string {
  for (let q = 0.1; q <= 0.9; q += 0.05) {
    const h = mezclar(hex, NEGRO, q);
    if (contraste(CREMA, h) >= 4.5) return h;
  }
  return TINTA;
}

/**
 * Una paleta sacada del color de una prenda de la campaña: el fondo es ese color (oscurecido si es claro), la letra crema y el acento,
 * el color de otra prenda clara de la campaña si la hay (o el mismo, aclarado).
 */
export function paletaDePrenda(nombre: string, hex: string, acento: string | null): ColoresPropios {
  const fondo = luminancia(hex) < 0.2 ? hex.toLowerCase() : mezclar(hex, NEGRO, 0.6);
  return { nombre, fondo, fondo2: mezclar(fondo, BLANCO, 0.14), letra: CREMA, acento: (acento ?? mezclar(hex, BLANCO, 0.66)).toLowerCase() };
}

/* ---------------- Leer un diseño guardado ---------------- */

const HEX = /^#[0-9a-f]{6}$/;
/** Solo una foto de nuestro almacén de campañas (la base lo exige igual: `campana_disenos_foto_url`). */
const FOTO = /^https?:\/\/[^/?#\s"'<>]+\/storage\/v1\/object\/public\/retail-campanas-fotos\/fondos\/[0-9a-f-]{36}\.jpg$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esDe = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);

function leerColores(x: unknown, completos: boolean): Partial<Colores> | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const fuera: Partial<Colores> = {};
  for (const k of ["fondo", "fondo2", "letra", "acento"] as const) {
    if (o[k] === undefined && !completos) continue;
    if (typeof o[k] !== "string" || !HEX.test(o[k])) return null;
    fuera[k] = o[k];
  }
  return fuera;
}

function leerColoresPropios(x: unknown): ColoresPropios | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const base = leerColores(o, true) as Colores | null;
  if (!base || typeof o.nombre !== "string" || o.nombre.trim() === "" || o.nombre.length > 60) return null;
  if (o.noche === undefined || o.noche === null) return { nombre: o.nombre, ...base };
  const noche = leerColores(o.noche, false);
  return noche ? { nombre: o.nombre, ...base, noche } : null;
}

/**
 * El diseño que llega de la base, revisado campo por campo. Si algo no calza (un valor que esta versión no conoce, un color mal escrito),
 * `null`: quien lo usa cae en el diseño de siempre, nunca en una portada rota (principio 9). La base ya lo impide con sus `check`;
 * esto cubre la versión de la tienda que todavía no conoce una opción nueva.
 */
export function leerDiseno(x: unknown): DisenoDeCampana | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const colores = o.colores === null || o.colores === undefined ? null : leerColoresPropios(o.colores);
  const paletaValida = o.paleta === "propia" ? colores !== null : typeof o.paleta === "string" && PALETAS.some((p) => p.id === o.paleta) && colores === null;
  if (!paletaValida || (o.colores != null && colores === null)) return null;
  if (!esDe(FONDOS, o.fondo) || !esDe(PATRONES, o.patron) || !esDe(INTENSIDADES, o.intensidad) || !esDe(ACOMODOS, o.acomodo)) return null;
  if (!esDe(TAMANOS, o.tamano) || !esDe(SELLOS, o.sello)) return null;
  if (!(o.corte === null || (Number.isInteger(o.corte) && (o.corte as number) >= 0))) return null;
  if (typeof o.frase !== "string" || o.frase.length > FRASE_MAX) return null;
  const prendas = o.prendas;
  if (!(prendas === null || (Array.isArray(prendas) && prendas.length >= 1 && prendas.length <= PRENDAS_MAX && prendas.every((p) => typeof p === "string" && UUID.test(p))))) {
    return null;
  }
  if (typeof o.cuenta !== "boolean" || typeof o.pctGigante !== "boolean" || typeof o.colibri !== "boolean") return null;
  // La foto (actividad 8). Un diseño guardado antes de ella no trae estos datos: sin foto y con el oscurecido de fábrica.
  const foto = o.foto ?? null;
  const fotoTono = o.fotoTono ?? null;
  const oscuro = o.oscuro ?? OSCURO_DE_FABRICA;
  if (!(foto === null || (typeof foto === "string" && FOTO.test(foto)))) return null;
  if (!(fotoTono === null || (typeof fotoTono === "string" && HEX.test(fotoTono)))) return null;
  if ((foto === null) !== (fotoTono === null) || (o.fondo === "foto" && foto === null)) return null;
  if (typeof oscuro !== "number" || !(oscuro >= OSCURO_MIN && oscuro <= OSCURO_MAX)) return null;
  return {
    paleta: o.paleta as string,
    colores,
    fondo: o.fondo,
    patron: o.patron,
    intensidad: o.intensidad,
    acomodo: o.acomodo,
    corte: o.corte as number | null,
    tamano: o.tamano,
    frase: o.frase,
    prendas: prendas as string[] | null,
    cuenta: o.cuenta,
    pctGigante: o.pctGigante,
    colibri: o.colibri,
    sello: o.sello,
    foto: foto as string | null,
    fotoTono: fotoTono as string | null,
    oscuro,
  };
}

/** Dos diseños iguales en todo (para saber si el borrador ya está publicado). */
export function mismoDiseno(a: DisenoDeCampana, b: DisenoDeCampana): boolean {
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

function ordenado(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(ordenado);
  if (typeof x === "object" && x !== null) {
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, ordenado((x as Record<string, unknown>)[k])]),
    );
  }
  return x;
}
