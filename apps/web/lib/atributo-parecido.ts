// «Existe también»: lo que ya hay en un vocabulario (colores, tallas, tejidos, patrones, familias, categorías) y se parece
// al nombre que alguien está escribiendo para crear uno nuevo. Sin React ni red. ADR-0576.
//
// Nació del caso «Verde Olivo» (2026-10-30): dos compañeras crearon «Verde Olivo» teniendo «Verde oliva». La base solo frena el
// MISMO nombre (`fn_clave_texto`: tildes y mayúsculas no cuentan), y una letra de diferencia —olivo/oliva, rayas/raya, rojo/roja—
// pasa. Marcas y proveedores ya preguntaban «¿no será una que ya existe?» (`nombres-parecidos.ts`); los vocabularios no.
//
// CONTRATO
//   PROMETE: dado un nombre y los que existen, devuelve cada uno que coincide y POR QUÉ, el más claro primero:
//            · «mismo-nombre»: el que la base ya rechaza (índice único);
//            · «otro-nombre»: lo que se escribe es un sinónimo cargado de uno que existe («piel» → Nude);
//            · «casi-igual»: el mismo nombre en plural o en femenino («Verde Olivo»), o un error de tipeo en un nombre largo.
//   ASUME:   que la base sigue mandando con el mismo nombre; todo lo demás es una pregunta para quien escribe.
//   NO HACE: no bloquea por su cuenta ni decide por la persona. Tampoco entiende el sentido («Navy» y «Azul marino» solo se
//            encuentran si hay un sinónimo cargado) ni cree que un nombre dentro de otro sea el mismo («Azul» está en «Azul rey»
//            y son dos colores): por eso no usa el motivo «contenida» de las marcas.
//
// Por qué NO se reescribió la regla de parecidos: es la misma de marcas y proveedores (`nombresParecidos`), con dos opciones que
// un vocabulario necesita y una marca no: los números cuentan («Talla 38» no es «Talla 40»), lo contenido no avisa y el tipeo
// de una letra solo se nota desde 8 letras («Morado» y «Dorado» son dos colores; «Gris melange» y «Gris melanje», uno).

import { claveTexto, nombresParecidos, type QuitarPalabras } from "./nombres-parecidos";

export type MotivoCoincidencia = "mismo-nombre" | "otro-nombre" | "casi-igual";

export type Coincidencia<T> = {
  item: T;
  por: MotivoCoincidencia;
  /** El nombre del existente con el que coincide: su nombre, o el sinónimo si fue por un sinónimo. */
  con: string;
};

type ConNombres = { nombre: string; sinonimos?: readonly string[] };

/**
 * Una palabra sin su final de plural ni de masculino/femenino: «olivo» y «oliva» dan «oliv»; «lunares» y «lunar», «lunar».
 * Las de 3 letras o menos y los números quedan tal cual: una talla «XS» no es «X», y «Lila» (lil) no es «Lima» (lim).
 */
export function plegarPalabra(palabra: string): string {
  if (palabra.length <= 3 || /^\d+$/.test(palabra)) return palabra;
  let p = palabra;
  if (p.endsWith("s")) p = p.slice(0, -1);
  if (p.length > 3 && /[aeo]$/.test(p)) p = p.slice(0, -1);
  return p;
}

const plegar: QuitarPalabras = (palabras) => palabras.map(plegarPalabra);

export function atributosParecidos<T extends ConNombres>(
  nombre: string,
  existentes: readonly T[],
  { max = 4, excluir }: { max?: number; excluir?: (item: T) => boolean } = {}
): Coincidencia<T>[] {
  const clave = claveTexto(nombre);
  if (!clave) return [];

  const mismos: Coincidencia<T>[] = [];
  const otros: Coincidencia<T>[] = [];
  const resto: T[] = [];
  for (const item of excluir ? existentes.filter((e) => !excluir(e)) : existentes) {
    if (claveTexto(item.nombre) === clave) {
      mismos.push({ item, por: "mismo-nombre", con: item.nombre });
      continue;
    }
    const sinonimo = (item.sinonimos ?? []).find((s) => claveTexto(s) === clave);
    if (sinonimo !== undefined) otros.push({ item, por: "otro-nombre", con: sinonimo });
    else resto.push(item);
  }

  // Cada nombre de cada existente (el suyo y sus sinónimos) compite por parecerse; de cada uno vale el que más se parezca.
  const entradas = resto.flatMap((item) => [item.nombre, ...(item.sinonimos ?? [])].map((n) => ({ nombre: n, item })));
  const { parecidos } = nombresParecidos(nombre, entradas, { max: entradas.length, quitar: plegar, numerosCuentan: true, contenida: false, tipeoDesde: 8 });
  const vistos = new Set<T>();
  const casi: Coincidencia<T>[] = [];
  for (const { item: entrada } of parecidos) {
    if (vistos.has(entrada.item)) continue;
    vistos.add(entrada.item);
    casi.push({ item: entrada.item, por: "casi-igual", con: entrada.nombre });
  }

  return [...mismos, ...otros, ...casi].slice(0, max);
}

// ---- Qué hace la pantalla con cada coincidencia ----------------------------------------------------------------------

/** `frena`: el mismo nombre, la base no lo deja pasar. `pregunta`: puede ser el mismo; se guarda cuando la persona dice que no. `avisa`: solo se ve parecido. */
export type NivelDeCoincidencia = "frena" | "pregunta" | "avisa";

export type MotivoVisto = MotivoCoincidencia | "tono";

const NIVEL: Record<MotivoVisto, NivelDeCoincidencia> = {
  "mismo-nombre": "frena",
  "otro-nombre": "pregunta",
  "casi-igual": "pregunta",
  tono: "avisa",
};

export function nivelDeMotivo(por: MotivoVisto): NivelDeCoincidencia {
  return NIVEL[por];
}

/** El nivel más fuerte de la lista, o `null` si no hay nada que decir. */
export function nivelMasFuerte(coincidencias: readonly { por: MotivoVisto }[]): NivelDeCoincidencia | null {
  const niveles = coincidencias.map((c) => NIVEL[c.por]);
  return niveles.includes("frena") ? "frena" : niveles.includes("pregunta") ? "pregunta" : niveles.includes("avisa") ? "avisa" : null;
}

export const TEXTO_DEL_MOTIVO: Record<MotivoVisto, string> = {
  "mismo-nombre": "mismo nombre",
  "otro-nombre": "otro nombre de este",
  "casi-igual": "casi el mismo nombre",
  tono: "se ve casi igual",
};

/**
 * Cómo se nombra cada vocabulario en la pregunta, y qué se parte en dos si se crea repetido. La consecuencia es lo que hace que
 * la persona conteste en serio: «queda registrada de dos formas» se entiende; «posible duplicado» no.
 */
export const VOCABLOS = {
  color: { lo: "lo", un: "un color", otro: "otro color", mismo: "el mismo color", existente: "el que ya existe", consecuencia: "con dos nombres, la misma prenda queda registrada de dos formas y su stock se parte en dos" },
  talla: { lo: "la", un: "una talla", otro: "otra talla", mismo: "la misma talla", existente: "la que ya existe", consecuencia: "con dos tallas iguales, el stock de una misma prenda se parte en dos" },
  tejido: { lo: "lo", un: "un tejido", otro: "otro tejido", mismo: "el mismo tejido", existente: "el que ya existe", consecuencia: "con dos nombres, los filtros y el análisis cuentan cada uno por separado" },
  patron: { lo: "lo", un: "un patrón", otro: "otro patrón", mismo: "el mismo patrón", existente: "el que ya existe", consecuencia: "con dos nombres, los filtros y el análisis cuentan cada uno por separado" },
  familia: { lo: "la", un: "una familia", otro: "otra familia", mismo: "la misma familia", existente: "la que ya existe", consecuencia: "con dos familias iguales, sus categorías y el análisis se reparten en dos" },
  categoria: { lo: "la", un: "una categoría", otro: "otra categoría", mismo: "la misma categoría", existente: "la que ya existe", consecuencia: "con dos categorías iguales, las prendas del mismo tipo quedan repartidas en dos" },
} as const;

export type Vocablo = keyof typeof VOCABLOS;

/** Una coincidencia como la dibuja la pantalla: lo que se muestra y lo que decide el nivel. */
export type CoincidenciaVista = { id: string; nombre: string; por: MotivoVisto; detalle: string };

/** Convierte lo que devuelve la regla en filas de la pregunta; `leer` dice cómo se llama cada existente y si trae algo que aclarar («desactivado»). */
export function vistaDeCoincidencias<T>(
  coincidencias: readonly { item: T; por: MotivoVisto; con?: string | null }[],
  leer: (item: T) => { id: string; nombre: string; extra?: string }
): CoincidenciaVista[] {
  return coincidencias.map((c) => {
    const { id, nombre, extra } = leer(c.item);
    const motivo = c.por === "otro-nombre" && c.con ? `«${c.con}» es otro nombre de este` : TEXTO_DEL_MOTIVO[c.por];
    return { id, nombre, por: c.por, detalle: extra ? `${motivo} · ${extra}` : motivo };
  });
}

/**
 * Lo de siempre para un vocabulario de un solo nombre (tallas, tejidos, patrones, familias, categorías): lo que ya existe y se parece
 * a `nombre`, listo para la pregunta. `excluirId` deja fuera al que se está editando. Un desactivado también cuenta, y lo dice.
 */
export function existentesParecidos(
  nombre: string,
  existentes: readonly { id: string; nombre: string; activo?: boolean }[],
  { excluirId }: { excluirId?: string | null } = {}
): CoincidenciaVista[] {
  return vistaDeCoincidencias(
    atributosParecidos(nombre, existentes, { excluir: (e) => e.id === excluirId }),
    (e) => ({ id: e.id, nombre: e.nombre, extra: e.activo === false ? "desactivado" : undefined })
  );
}

export type TextoDeLaPregunta = {
  titulo: string;
  bajada: string;
  /** «No, «X» es otro color»: solo cuando se puede seguir. `null` si el nombre es idéntico o si solo se ve parecido. */
  no: string | null;
  /** Lo que se le dice a quien toca el botón de guardar apagado, o por qué está apagado. `null` si guardar no espera nada. */
  falta: string | null;
};

/** `null` si no hay nada que decir. El texto sigue al nivel más fuerte de las coincidencias. */
export function textoDeLaPregunta(que: Vocablo, nombre: string, coincidencias: readonly { nombre: string; por: MotivoVisto }[]): TextoDeLaPregunta | null {
  const nivel = nivelMasFuerte(coincidencias);
  if (!nivel) return null;
  const v = VOCABLOS[que];
  const escrito = nombre.trim();
  if (nivel === "frena") {
    const igual = coincidencias.find((c) => c.por === "mismo-nombre")!;
    return {
      titulo: `«${igual.nombre}» ya existe`,
      bajada: `Con el mismo nombre no se guarda otro: elige ${v.existente} o cambia lo que escribiste.`,
      no: null,
      falta: `«${igual.nombre}» ya existe: elíge${v.lo} en vez de crear${v.lo} otra vez.`,
    };
  }
  if (nivel === "pregunta") {
    const primera = coincidencias.find((c) => nivelDeMotivo(c.por) === "pregunta")!;
    return {
      titulo: `¿No será ${v.un} que ya existe?`,
      bajada: `Si es ${v.mismo}, usa ${v.existente}: ${v.consecuencia}.`,
      no: `No, «${escrito}» es ${v.otro}`,
      falta: `Antes de guardar, dinos si «${escrito}» es ${v.mismo} que «${primera.nombre}».`,
    };
  }
  return {
    titulo: `Se ve casi igual que ${v.un} que ya existe`,
    bajada: `Si es ${v.mismo}, usa ${v.existente}: ${v.consecuencia}. Si es ${v.otro}, guárdalo igual.`,
    no: null,
    falta: null,
  };
}
