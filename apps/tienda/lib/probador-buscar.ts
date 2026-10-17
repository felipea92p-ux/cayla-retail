import { normalizar } from "./buscador";
import { agotada, busquedaConLook, colorPara, NOMBRE_ZONA, PARAMETRO_DEL_LOOK, type ColorDelProbador, type Look, type PrendaDelProbador, type Zona } from "./probador";

// «Buscar otra» y «Ver todas» del probador (ADR-0434, actividad 5; lienzo v3, `V3Buscar`): todas las prendas del probador de una zona, o
// las que nombran lo escrito —su nombre, su categoría, su zona o un color—, sin tildes ni mayúsculas, para probarlas en su lugar del
// look. Busca en lo que la página ya trajo (las prendas del probador de la tienda elegida): nada va a la base mientras se escribe. El
// «Solo en Trujillo» del lienzo es la franja «Ver lo que hay en» de toda la tienda: con una tienda elegida, aquí solo llega lo que hay
// en ella. Lógica pura, con su prueba al lado.

/** Las zonas para filtrar, en el orden de las píldoras (y de los grupos de «Todo»). */
export type FiltroDeZona = Zona | "todo";
export const FILTROS_DE_ZONA: readonly { clave: FiltroDeZona; nombre: string }[] = [
  { clave: "todo", nombre: "Todo" },
  { clave: "arriba", nombre: "Arriba" },
  { clave: "vestido", nombre: "Vestidos" },
  { clave: "abajo", nombre: "Abajo" },
  { clave: "encima", nombre: "Encima" },
  { clave: "bolso", nombre: "Bolsos" },
];

/** El parámetro de la dirección con la búsqueda abierta (`?buscar=arriba`): «atrás» la cierra, como en cualquier pantalla. */
export const PARAMETRO_DE_BUSCAR = "buscar";

/** La búsqueda de la dirección con la búsqueda abierta en `zona` (o cerrada, con null), y el look como estaba (sin «%7E»). */
export function busquedaConBuscar(busqueda: string, zona: FiltroDeZona | null): string {
  const q = new URLSearchParams(busqueda);
  const look = q.get(PARAMETRO_DEL_LOOK);
  q.delete(PARAMETRO_DEL_LOOK);
  if (zona) q.set(PARAMETRO_DE_BUSCAR, zona);
  else q.delete(PARAMETRO_DE_BUSCAR);
  return busquedaConLook(q.toString(), look);
}

/** El filtro de la dirección, o null si no hay búsqueda abierta (o es uno que no existe). */
export function leerFiltroDeZona(valor: string | null | undefined): FiltroDeZona | null {
  return FILTROS_DE_ZONA.find((f) => f.clave === valor?.trim())?.clave ?? null;
}

/** Las palabras de lo escrito, sin tildes ni mayúsculas. */
export const palabrasDe = (texto: string): string[] => normalizar(texto).split(/\s+/).filter(Boolean);

const nombreDelFiltro = (zona: Zona): string => FILTROS_DE_ZONA.find((f) => f.clave === zona)?.nombre ?? NOMBRE_ZONA[zona];

/** ¿La prenda tiene todas las palabras en su nombre, su categoría, su zona o el nombre de alguno de sus colores? */
export function coincide(p: PrendaDelProbador, palabras: readonly string[]): boolean {
  if (palabras.length === 0) return true;
  const texto = normalizar([p.nombre, p.categoria ?? "", NOMBRE_ZONA[p.zona], nombreDelFiltro(p.zona), ...p.colores.map((c) => c.nombre)].join(" "));
  return palabras.every((w) => texto.includes(w));
}

/**
 * Lo que se ve: las que coinciden en la zona, primero las que se pueden poner (lo agotado, al final), en el orden del probador. Sin nada
 * escrito y con «Todo», nada: se ve «¿Qué buscas?» con sus sugerencias.
 */
export function buscarParaElLook(prendas: readonly PrendaDelProbador[], { texto, zona }: { texto: string; zona: FiltroDeZona }): PrendaDelProbador[] {
  const palabras = palabrasDe(texto);
  if (palabras.length === 0 && zona === "todo") return [];
  const lista = prendas.filter((p) => (zona === "todo" || p.zona === zona) && coincide(p, palabras));
  return [...lista.filter((p) => !agotada(p)), ...lista.filter(agotada)];
}

export type GrupoDeResultados = { zona: Zona; nombre: string; nota: string | null; prendas: PrendaDelProbador[] };

/** Con «Todo», un grupo por zona (en el orden de las píldoras), con su título y cuántas; en una zona, uno solo. */
export function gruposDeResultados(resultados: readonly PrendaDelProbador[]): GrupoDeResultados[] {
  return FILTROS_DE_ZONA.flatMap((f) => {
    if (f.clave === "todo") return [];
    const prendas = resultados.filter((p) => p.zona === f.clave);
    return prendas.length > 0 ? [{ zona: f.clave, nombre: f.nombre, nota: f.clave === "vestido" ? "ocupan arriba y abajo" : null, prendas }] : [];
  });
}

/**
 * El color con que se muestra una prenda en la búsqueda: el que el cliente tocó en su tarjeta; si no, el que nombra lo escrito
 * («rosa» muestra el rosa pálido); si no, el que ya tiene en el look o el que entra solo.
 */
export function colorEnLaBusqueda(
  p: PrendaDelProbador,
  palabras: readonly string[],
  vista: Readonly<Record<string, string>>,
  recordados: Readonly<Record<string, string>>,
): ColorDelProbador {
  const tocado = p.colores.find((c) => c.codigo === vista[p.id]);
  if (tocado) return tocado;
  const nombrado = palabras.length > 0 ? p.colores.find((c) => palabras.some((w) => normalizar(c.nombre).includes(w))) : undefined;
  return nombrado ?? colorPara(p, recordados);
}

/** Qué hace el botón de la tarjeta: probarla, ponerle este color a la que ya está, decir que ya está, o nada (agotada). */
export type EstadoDeLaTarjeta = "probar" | "este-color" | "en-tu-look" | "agotada";
export function estadoDeLaTarjeta(p: PrendaDelProbador, color: ColorDelProbador, look: Look): EstadoDeLaTarjeta {
  if (agotada(p)) return "agotada";
  const puesta = look[p.zona];
  if (puesta?.id !== p.id) return "probar";
  return puesta.color === color.codigo ? "en-tu-look" : "este-color";
}

/** La línea del conteo: «3 prendas para «rosa» en arriba»; sin nada escrito ni zona, «Busca en toda la tienda». */
export function conteoDeBusqueda(n: number, texto: string, zona: FiltroDeZona): string {
  const escrito = texto.trim();
  if (!escrito && zona === "todo") return "Busca en toda la tienda";
  const enQue = zona === "todo" ? "" : ` en ${nombreDelFiltro(zona).toLocaleLowerCase("es")}`;
  return `${n === 1 ? "1 prenda" : `${n} prendas`}${escrito ? ` para «${escrito}»` : ""}${enQue}`;
}

/** Lo que dice la caja según dónde busca (lienzo): en toda la tienda o en una zona. */
export function marcadorDeBusqueda(zona: FiltroDeZona): string {
  return zona === "todo" ? "Nombre, color o tipo de prenda" : `Busca en ${nombreDelFiltro(zona).toLocaleLowerCase("es")}: nombre o color`;
}

/** El título vacío: «No encontramos «verde» en abajo». */
export function tituloSinResultados(texto: string, zona: FiltroDeZona): string {
  return `No encontramos «${texto.trim()}»${zona === "todo" ? "" : ` en ${nombreDelFiltro(zona).toLocaleLowerCase("es")}`}`;
}

/** «Todo lo de arriba»: el título de una zona sin nada escrito, con lo que hay en ella («Camisas y blusas, tops y polos»). */
export function portadaDeZona(prendas: readonly PrendaDelProbador[], zona: Zona): { titulo: string; texto: string | null } {
  const nombres = [...new Set(prendas.filter((p) => p.zona === zona).flatMap((p) => (p.categoria ? [p.categoria.toLocaleLowerCase("es")] : [])))];
  const lista = nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return {
    titulo: `Todo lo de ${nombreDelFiltro(zona).toLocaleLowerCase("es")}`,
    texto: lista ? lista.charAt(0).toLocaleUpperCase("es") + lista.slice(1) : null,
  };
}

/**
 * Lo que se sugiere tocar (lienzo: «rosa, negro, pantalón, blazer, cartera»): los dos colores y las tres categorías que más prendas
 * tienen en el probador, en minúsculas. Salen de lo que hay: nunca sugiere algo que no encontraría.
 */
export function sugerenciasDeBusqueda(prendas: readonly PrendaDelProbador[]): string[] {
  const contar = (claves: string[]) => {
    const n = new Map<string, number>();
    for (const c of claves) n.set(c, (n.get(c) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([c]) => c);
  };
  const colores = contar(prendas.flatMap((p) => [...new Set(p.colores.map((c) => c.nombre.toLocaleLowerCase("es")))])).slice(0, 2);
  const categorias = contar(prendas.flatMap((p) => (p.categoria ? [p.categoria.toLocaleLowerCase("es")] : []))).slice(0, 3);
  return [...colores, ...categorias];
}

/** Lo que dice el aviso al probar una prenda desde la búsqueda (lienzo): dónde quedó en el probador. */
export const AVISO_AL_PROBAR: Record<Zona, string> = {
  arriba: "Ahora está arriba en tu probador.",
  vestido: "Ocupa arriba y abajo en tu probador.",
  abajo: "Ahora está abajo en tu probador.",
  encima: "Va encima en tu probador.",
  bolso: "Ahora es el bolso de tu look.",
};
