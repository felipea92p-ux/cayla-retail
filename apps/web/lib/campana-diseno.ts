import {
  DISENO_DE_SIEMPRE,
  PALETAS,
  PATRONES,
  estiloDelDiseno,
  leerDiseno,
  mismoDiseno,
  paletaDelDiseno,
  paletasDeLasPrendas,
  piezasQueCaben,
  type Acomodo,
  type ColoresPropios,
  type ContextoRevision,
  type DisenoDeCampana,
  type Fondo,
  type Intensidad,
  type Patron,
  type Sello,
  type Tamano,
} from "@cayla-retail/portada";
import type { EstadoCampo } from "@/lib/guia-campos";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import type { PrendaDeCampana } from "@/lib/campana-detalle";
import type { DiaPortada } from "@/lib/campanas-reglas";

// Tienda web ▸ Campañas ▸ una campaña ▸ «Diseño en la web» (ADR-0436, actividad 4): lo que la pantalla lee de la base y decide sin
// dibujar. El diseño en sí (sus opciones, sus colores y la revisión) vive en @cayla-retail/portada, el mismo paquete que pinta la tienda.

export type EstadoDiseno = {
  /** Lo que se está probando y todavía no ve el cliente; su `version` evita pisar el trabajo de otra persona. */
  borrador: { diseno: DisenoDeCampana; version: number } | null;
  /** Lo que ve el cliente hoy (si la campaña sale en la portada). */
  publicado: { diseno: DisenoDeCampana; publicadoEn: string; publicadoPor: string | null } | null;
  /** El que «Volver al anterior» regresa. */
  anterior: { diseno: DisenoDeCampana; publicadoEn: string } | null;
};

const SIN_NADA: EstadoDiseno = { borrador: null, publicado: null, anterior: null };

function objeto(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/**
 * Lo que devuelve `retail.campana_diseno`. Un diseño que esta versión de la web no sabe leer cuenta como que no está (la pantalla abre la
 * portada de siempre y no se cae); si la respuesta entera no tiene forma, `null`: la pestaña lo dice.
 */
export function leerEstadoDiseno(x: unknown): EstadoDiseno | null {
  const o = objeto(x);
  if (!o) return null;
  const b = objeto(o.borrador);
  const p = objeto(o.publicado);
  const a = objeto(o.anterior);
  const db = b ? leerDiseno(b.diseno) : null;
  const dp = p ? leerDiseno(p.diseno) : null;
  const da = a ? leerDiseno(a.diseno) : null;
  return {
    ...SIN_NADA,
    borrador: b && db && Number.isInteger(b.version) ? { diseno: db, version: b.version as number } : null,
    publicado:
      p && dp && typeof p.publicado_en === "string"
        ? { diseno: dp, publicadoEn: p.publicado_en, publicadoPor: typeof p.publicado_por === "string" && p.publicado_por.trim() ? p.publicado_por : null }
        : null,
    anterior: a && da && typeof a.publicado_en === "string" ? { diseno: da, publicadoEn: a.publicado_en } : null,
  };
}

/** Una prenda de la campaña que puede salir en la portada: su foto (o, sin foto, su categoría y su color, ADR-0333). */
export type PiezaDePortada = { id: string; nombre: string; foto: string | null; colorHex?: string | null } & CategoriaDePrenda;

/** Lo que la portada dice de la campaña. */
export type CampanaDePortada = { nombre: string; pct: number | null; hasta: string | null };

/**
 * Las prendas de la campaña en el orden en que la tienda elige sus polaroids (`heroDelInicio`: primero las que tienen foto); cada una con
 * el color de su primera variante con color, para dibujarla sin foto.
 */
export function piezasDeLaCampana(prendas: readonly PrendaDeCampana[]): PiezaDePortada[] {
  return [...prendas]
    .sort((a, b) => Number(a.foto === null) - Number(b.foto === null) || a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => ({
      id: p.productoId,
      nombre: p.nombre,
      foto: p.foto,
      colorHex: p.colores.find((c) => c.hex)?.hex ?? null,
      categoria: p.categoria,
      prefijo: p.prefijo,
      familia: p.familia,
    }));
}

/** Las paletas sacadas de los colores de las prendas de la campaña (paso «Colores»); un color sin `#hex` no cuenta. */
export function paletasDeLaCampana(prendas: readonly PrendaDeCampana[]): ColoresPropios[] {
  return paletasDeLasPrendas(
    prendas.map((p) => ({ nombre: p.nombre, colores: p.colores.flatMap((c) => (c.hex ? [{ nombre: c.nombre, hex: c.hex }] : [])) })),
  );
}

/** Cómo se nombran las campañas de un carrusel: «Día del Gato y Halloween», «A, B y C». */
export function nombresEnOrden(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** El día siguiente a `fecha` (`AAAA-MM-DD`). */
export const diaSiguiente = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Qué anuncia la portada el día después de que la campaña termina, para la hoja «Publicar» («Después sale»). Lo dice la base
 * (`campanas_portada_dias`, la regla de la tienda), no esta pantalla: aquí solo se le pone nombre (con varias, el carrusel en su orden).
 * `null`: no se pudo saber.
 */
export function queSaleDespues(dias: readonly DiaPortada[] | null, nombres: ReadonlyMap<string, string>): string | null {
  const dia = dias?.[0];
  if (!dia) return null;
  if (dia.campanas.length === 0) return "Lo nuevo";
  const conNombre = dia.campanas.map((id) => nombres.get(id));
  if (conNombre.some((n) => n === undefined)) return null;
  return conNombre.length === 1 ? conNombre[0]! : `${nombresEnOrden(conNombre as string[])}, en carrusel`;
}

/**
 * Lo que identifica lo que hay guardado: cambia al guardar el borrador, al publicar y al volver al anterior. El editor se vuelve a armar
 * cuando cambia (con la versión nueva del borrador), así nunca guarda encima con una versión vieja.
 */
export function claveDelEstado(e: EstadoDiseno): string {
  return `${e.borrador?.version ?? 0}|${e.publicado?.publicadoEn ?? "-"}|${e.anterior?.publicadoEn ?? "-"}`;
}

/** Lo que se abre en el editor: el borrador si se estaba probando; si no, lo publicado; si no, la portada de siempre. */
export function disenoParaEditar(e: EstadoDiseno): { diseno: DisenoDeCampana; version: number } {
  if (e.borrador) return e.borrador;
  return { diseno: e.publicado?.diseno ?? DISENO_DE_SIEMPRE, version: 0 };
}

/**
 * Si lo que se ve ya es lo que ve el cliente, o un borrador que todavía no. Lo dicen la barra de abajo del editor y la insignia de cada
 * campaña en la lista (con su borrador, o sin él lo publicado): un borrador igual a lo publicado no es un borrador.
 */
export function estadoDelBorrador(e: { publicado: { diseno: DisenoDeCampana } | null }, diseno: DisenoDeCampana): "publicado" | "borrador" | "de-siempre" {
  if (e.publicado && mismoDiseno(e.publicado.diseno, diseno)) return "publicado";
  if (!e.publicado && mismoDiseno(DISENO_DE_SIEMPRE, diseno)) return "de-siempre";
  return "borrador";
}

/**
 * Lo que el editor manda a guardar: la frase sin espacios a los lados (la base la exige así; mientras se escribe, «Mimos » con su espacio
 * final se rechazaba y el borrador quedaba sin guardar). En pantalla se sigue viendo lo que se escribió.
 */
export function disenoParaGuardar(d: DisenoDeCampana): DisenoDeCampana {
  return d.frase === d.frase.trim() ? d : { ...d, frase: d.frase.trim() };
}

/**
 * Si el borrador que hay en la base es el que ESTA pantalla mandó y cuya respuesta se perdió (la base lo guardó, la red cortó la vuelta):
 * su versión, para seguir guardando encima sin decir «alguien más lo cambió». Si es otro, `null`: ese sí es un choque.
 */
export function versionDeMiBorrador(leido: Pick<EstadoDiseno, "borrador"> | null, sinRespuesta: DisenoDeCampana | null): number | null {
  if (!leido?.borrador || !sinRespuesta) return null;
  return mismoDiseno(leido.borrador.diseno, disenoParaGuardar(sinRespuesta)) ? leido.borrador.version : null;
}

/** A dónde vuelve la portada al «Volver al anterior»: con uno anterior, a él; sin él, a la de siempre. («a el» no se escribe: «al».) */
export const adondeVuelve = (hayAnterior: boolean): string => (hayAnterior ? "al diseño anterior" : "a la portada de siempre");

/** Cómo va el guardado del borrador en el editor. */
export type EstadoGuardado = "al-dia" | "guardando" | "error" | "choque";

/** La línea del pie del editor: si el último guardado falló, nunca dice «guardado» (el aviso de arriba dice qué pasó). */
export function textoDelPie(guardado: EstadoGuardado, comoEsta: "publicado" | "borrador" | "de-siempre", hayPublicado: boolean): string {
  if (guardado === "guardando") return "Guardando el borrador…";
  if (guardado === "error" || guardado === "choque") return "El último cambio todavía no se guardó.";
  if (comoEsta === "publicado") return "Es el diseño que ve el cliente hoy.";
  if (comoEsta === "de-siempre") return "Es la portada de siempre: cambia algo para darle su diseño.";
  return hayPublicado ? "Borrador guardado: la web sigue mostrando el diseño publicado." : "Borrador guardado: la web sigue mostrando la portada de siempre.";
}

/** Una línea para el resumen de cada paso del editor (lo que se eligió). */
export function resumenEstilo(d: DisenoDeCampana): string {
  return estiloDelDiseno(d)?.nombre ?? "Personalizado";
}
export function resumenColores(d: DisenoDeCampana): string {
  return paletaDelDiseno(d).nombre;
}

/** Lo que la revisión necesita saber de las prendas de la campaña. */
export function contextoDeRevision(prendas: readonly { foto: string | null }[]): ContextoRevision {
  return { prendas: prendas.length, prendasConFoto: prendas.filter((p) => p.foto).length };
}

/* ---------------- Los nombres de cada opción (maqueta, `FONDOS`, `PATRONES`, `ACOMODOS`, `SELLOS`) ---------------- */

export const NOMBRES_FONDO: Readonly<Record<Fondo, { nombre: string; nota: string }>> = {
  degradado: { nombre: "Degradado", nota: "Como hoy" },
  liso: { nombre: "Liso", nota: "Un solo color" },
  dibujo: { nombre: "Con dibujo", nota: "Un estampado suave" },
  foto: { nombre: "Con foto", nota: "La que subas" },
};
export const NOMBRES_PATRON: Readonly<Record<Patron, string>> = {
  huellitas: "Huellitas",
  rayas: "Rayas",
  puntos: "Puntos",
  cuadros: "Cuadros",
  corazones: "Corazones",
  estrellas: "Estrellas",
  confeti: "Confeti",
  ondas: "Ondas",
};
export const NOMBRES_INTENSIDAD: Readonly<Record<Intensidad, string>> = { suave: "Suave", medio: "Medio", fuerte: "Fuerte" };
export const NOMBRES_ACOMODO: Readonly<Record<Acomodo, { nombre: string; nota: string }>> = {
  polaroids: { nombre: "Polaroids", nota: "Tres fotos que caen" },
  grande: { nombre: "Foto grande", nota: "Una prenda protagonista" },
  mosaico: { nombre: "Mosaico", nota: "Cuatro, en orden" },
  letras: { nombre: "Solo letras", nota: "El nombre manda" },
};
export const NOMBRES_TAMANO: Readonly<Record<Tamano, string>> = { grande: "Grande", enorme: "Enorme" };
export const NOMBRES_SELLO: Readonly<Record<Sello, string>> = { ninguno: "Ninguno", descuento: "El descuento", dias: "Solo por días", nuevo: "Lo nuevo" };

/** Los sellos que esta campaña puede llevar: el del descuento, solo si tiene descuento. */
export function sellosDeLaCampana(pct: number | null): Sello[] {
  return (Object.keys(NOMBRES_SELLO) as Sello[]).filter((s) => s !== "descuento" || !!pct);
}

/* ---------------- Lo que cada paso resume en su cabecera ---------------- */

export function resumenFondo(d: DisenoDeCampana): string {
  const fondo = NOMBRES_FONDO[d.fondo].nombre;
  return d.fondo === "dibujo" ? `${fondo}: ${NOMBRES_PATRON[d.patron].toLowerCase()}` : fondo;
}
export function resumenAcomodo(d: DisenoDeCampana): string {
  return NOMBRES_ACOMODO[d.acomodo].nombre;
}
export function resumenTexto(d: DisenoDeCampana): string {
  return `${NOMBRES_TAMANO[d.tamano]} · ${d.frase.trim() ? `«${d.frase.trim()}»` : "sin frase"}`;
}
export function resumenPrendas(d: DisenoDeCampana, piezas: readonly { id: string }[]): string {
  if (piezas.length === 0) return "Esta campaña no tiene prendas";
  if (d.acomodo === "letras") return "Con solo letras no salen prendas";
  const elegidas = (d.prendas ?? []).filter((id) => piezas.some((p) => p.id === id)).length;
  if (elegidas === 0) return "Las elige la web";
  // Salen las que caben en el acomodo: «4 elegidas» con tres polaroids engañaba (el ciego de /formidable dudó de cuántas había de verdad).
  const salen = Math.min(elegidas, piezasQueCaben(d));
  if (salen < elegidas) return `${salen} de tus ${elegidas} elegidas`;
  return salen === 1 ? "1 elegida por ti" : `${salen} elegidas por ti`;
}
/** Los detalles que de verdad salen: la cuenta solo con fecha de fin, el % gigante y el sello del descuento solo con descuento. */
export function resumenDetalles(d: DisenoDeCampana, c: Pick<CampanaDePortada, "pct" | "hasta">): string {
  const salen = [
    d.cuenta && c.hasta ? "cuenta regresiva" : null,
    d.pctGigante && c.pct ? "% gigante" : null,
    d.colibri ? "colibrí" : null,
    d.sello !== "ninguno" && (d.sello !== "descuento" || c.pct) ? "sello" : null,
  ].filter((x): x is string => x !== null);
  if (salen.length === 0) return "Sin detalles";
  const lista = salen.join(", ");
  return lista[0]!.toUpperCase() + lista.slice(1);
}

/* ---------------- El texto: desde qué palabra va la cursiva ---------------- */

export const palabrasDelNombre = (nombre: string): string[] => nombre.trim().split(/\s+/).filter(Boolean);

/** Desde qué palabra va la cursiva hoy: la elegida o, sin elegir, la última (con una sola palabra, ninguna). */
export function corteEfectivo(d: DisenoDeCampana, nombre: string): number {
  const n = palabrasDelNombre(nombre).length;
  return Math.min(d.corte ?? (n > 1 ? n - 1 : n), n);
}

/** La cursiva desde la palabra `k` (`k` = tantas como palabras: sin cursiva). La de siempre (la última) se guarda como «sin elegir». */
export function cortarEn(d: DisenoDeCampana, nombre: string, k: number): DisenoDeCampana {
  const n = palabrasDelNombre(nombre).length;
  const deSiempre = n > 1 ? n - 1 : n;
  return { ...d, corte: k === deSiempre ? null : Math.max(0, Math.min(k, n)) };
}

/* ---------------- Las prendas: cuáles salen y en qué orden ---------------- */

/**
 * Las prendas que el paso «Qué prendas salen» muestra marcadas, en su orden: las elegidas (las que siguen en la campaña) o, si la web elige, las
 * que elegiría (las primeras de `piezas`, ya con las de foto primero). Tantas como caben en el acomodo.
 */
export function prendasMarcadas(d: DisenoDeCampana, piezas: readonly { id: string }[]): string[] {
  const caben = piezasQueCaben(d);
  const elegidas = (d.prendas ?? []).filter((id) => piezas.some((p) => p.id === id));
  return (elegidas.length > 0 ? elegidas : piezas.map((p) => p.id)).slice(0, caben);
}

/**
 * Tocar una prenda: si estaba, sale; si no, entra al final y, si ya no cabe, sale la primera (con «Foto grande», tocar otra la cambia).
 * Sin ninguna marcada, vuelve a elegir la web.
 */
export function tocarPrenda(d: DisenoDeCampana, piezas: readonly { id: string }[], id: string): DisenoDeCampana {
  const caben = piezasQueCaben(d);
  if (caben === 0 || !piezas.some((p) => p.id === id)) return d;
  const marcadas = prendasMarcadas(d, piezas);
  const sin = marcadas.filter((x) => x !== id);
  const nuevas = sin.length < marcadas.length ? sin : [...marcadas, id].slice(-caben);
  return { ...d, prendas: nuevas.length > 0 ? nuevas : null };
}

/* ---------------- «Sorpréndeme» ---------------- */

/**
 * Un diseño al azar dentro del marco: una paleta curada (siempre se lee), un fondo, un dibujo suave o medio, un acomodo (con solo letras
 * si la campaña no tiene prendas), a veces un sello y a veces el % gigante, nunca el descuento dos veces (como los estilos). El texto, las
 * prendas elegidas, la cuenta y el colibrí se quedan. Siempre cambia algo. `azar` se pasa en las pruebas para que sea repetible.
 */
export function sorprendeme(
  d: DisenoDeCampana,
  c: { pct: number | null; conPrendas: boolean },
  azar: () => number = Math.random,
): DisenoDeCampana {
  const uno = <T>(lista: readonly T[]): T => lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))]!;
  for (let intento = 0; intento < 8; intento++) {
    const acomodo: Acomodo = c.conPrendas ? uno(["polaroids", "grande", "mosaico", "letras"] as const) : "letras";
    const sello: Sello = uno(["ninguno", "ninguno", "dias", "nuevo", c.pct ? "descuento" : "ninguno"] as const);
    const nuevo: DisenoDeCampana = {
      ...d,
      paleta: uno(PALETAS).id,
      colores: null,
      fondo: uno(["degradado", "liso", "dibujo", "dibujo"] as const),
      patron: uno(PATRONES),
      intensidad: uno(["suave", "medio"] as const),
      acomodo,
      sello,
      pctGigante: !!c.pct && azar() < 0.3 && sello !== "descuento" && acomodo !== "mosaico",
      tamano: acomodo === "letras" ? "enorme" : "grande",
    };
    if (!mismoDiseno(nuevo, d)) return nuevo;
  }
  return { ...d, paleta: PALETAS.find((p) => p.id !== d.paleta)!.id, colores: null };
}

/* ---------------- La guía de foco del editor (ADR-0284) ---------------- */

export type ClavePaso = "estilo" | "colores" | "fondo" | "acomodo" | "texto" | "prendas" | "detalles";
export type PasoDelDiseno = { clave: ClavePaso; titulo: string; opcional: boolean };

/**
 * Los pasos del editor, en orden (maqueta, `PASOS`). Todos traen un valor de fábrica (nada «falta» para publicar): la guía dice por dónde
 * ir. El texto, las prendas y los detalles son opcionales: la portada se ve bien sin tocarlos.
 */
export const PASOS_DEL_DISENO: readonly PasoDelDiseno[] = [
  { clave: "estilo", titulo: "Empieza con un estilo", opcional: false },
  { clave: "colores", titulo: "Colores", opcional: false },
  { clave: "fondo", titulo: "Fondo", opcional: false },
  { clave: "acomodo", titulo: "Cómo se acomoda", opcional: false },
  { clave: "texto", titulo: "El texto", opcional: true },
  { clave: "prendas", titulo: "Qué prendas salen", opcional: true },
  { clave: "detalles", titulo: "Detalles", opcional: true },
];

/**
 * Cómo se marca cada paso: el abierto, «ahora»; el que se visitó y ya se cerró, ✓; el que nadie abrió todavía, «falta» (o «opcional»).
 * `sigue`: el primero sin visitar que no es opcional (lleva «Sigue aquí» mientras está cerrado). Nunca cambia qué se puede publicar.
 * `armado`: el diseño ya existe (hay un borrador o uno publicado): no hay nada «por hacer» —viene armado—, así que lo que no se visitó no dice
 * «Falta» ni «Sigue aquí» (ADR-0284, regla 4: una ficha que ya venía completa no se llena de marcas); lo que se visita igual lleva ✓.
 */
export function estadoDePasos(
  pasos: readonly PasoDelDiseno[],
  visitados: ReadonlySet<ClavePaso>,
  abierto: ClavePaso | null,
  armado = false,
): { estados: Record<ClavePaso, EstadoCampo>; sigue: ClavePaso | null } {
  const sinVisitar = (p: PasoDelDiseno): EstadoCampo => (p.opcional || armado ? "opcional" : "falta");
  const estados = Object.fromEntries(pasos.map((p) => [p.clave, p.clave === abierto ? "ahora" : visitados.has(p.clave) ? "hecho" : sinVisitar(p)])) as Record<ClavePaso, EstadoCampo>;
  const sigue = armado ? null : (pasos.find((p) => !p.opcional && !visitados.has(p.clave) && p.clave !== abierto)?.clave ?? null);
  return { estados, sigue };
}

/** ¿El diseño ya existe? Hay uno en prueba o uno publicado; un «anterior» solo no cuenta (hoy la portada es la de siempre). */
export function disenoYaArmado(e: Pick<EstadoDiseno, "borrador" | "publicado"> & Partial<Pick<EstadoDiseno, "anterior">>): boolean {
  return e.borrador !== null || e.publicado !== null;
}
