// «Igual que la anterior» al recibir (tarea 7 del tablero de Recibir, Felipe 2026-11-14).
//
// El problema: un envío trae diez modelos de la misma marca y la misma tela, y la hoja de crear abre vacía en cada uno. Son de 4 a 7 toques
// repetidos por modelo nuevo (tejido, patrón, tallas y, sin aviso, la marca). Aquí se arma la ficha que ofrece lo de la prenda recién creada
// para llenarlo de un toque.
//
// Es una OFERTA, nunca un valor de fábrica: Felipe decidió que tallas y marca arrancan vacías (2026-10-13 y 2026-11-03), y tejido y patrón son
// opcionales desde el 3-nov (una blusa de encaje salió marcada «Liso»). Por eso la ficha dice qué llena, cada dato se quita antes de usarla y,
// si la persona ya eligió algo, no se ofrece: no pisa lo suyo. El nombre, los colores y el precio no se copian: cambian de un modelo a otro.

import { compararTallas } from "./tallas";

/** Lo que se recuerda de la prenda recién creada en el envío. Lleva los textos porque un tejido ofrecido en esa hoja («Ver todos») puede no
 *  estar todavía en la lista de la categoría que trae la hoja siguiente. */
export type PrendaAnterior = {
  categoriaId: string;
  nombre: string;
  tejido: { id: string; texto: string } | null;
  patron: { id: string; texto: string } | null;
  tallas: readonly { id: string; valor: string }[];
};

export type DatoDeLaAnterior = "tejido" | "patron" | "tallas";

export type FichaDeLaAnterior = {
  nombre: string;
  datos: { clave: DatoDeLaAnterior; texto: string }[];
};

/** Lo que la hoja ya tiene elegido de esos tres datos. */
type Elegido = { tejidoId: string; patronId: string; tallaIds: readonly string[] };

/** «S a L» si son seguidas en la curva de la categoría; si no, «S, M y XL». */
export function textoDeTallas(elegidas: readonly { id: string; valor: string }[], curva: readonly { id: string; valor: string }[]): string {
  const orden = [...curva].sort((a, b) => compararTallas(a.valor, b.valor));
  const pos = new Map(orden.map((t, i) => [t.id, i]));
  const lista = [...elegidas].sort((a, b) => compararTallas(a.valor, b.valor));
  if (lista.length === 0) return "";
  if (lista.length === 1) return lista[0].valor;
  const indices = lista.map((t) => pos.get(t.id));
  const seguidas = indices.every((i, k) => i !== undefined && (k === 0 || i === (indices[k - 1] as number) + 1));
  if (seguidas && lista.length >= 3) return `${lista[0].valor} a ${lista[lista.length - 1].valor}`;
  const valores = lista.map((t) => t.valor);
  return `${valores.slice(0, -1).join(", ")} y ${valores[valores.length - 1]}`;
}

/**
 * La ficha que se ofrece, o `null` si no hay nada que ofrecer: otra categoría (sus tallas y telas son otras), nada que copiar, o la persona ya
 * eligió alguno de los tres datos (la ficha no pisa lo suyo). `quitados` son los datos que la persona sacó de la ficha con su ✕. Un dato que la
 * hoja no pregunta (la categoría no pide tejido) o una talla que la categoría ya no tiene no se ofrece.
 */
export function fichaDeLaAnterior(
  anterior: PrendaAnterior | null | undefined,
  hoja: {
    categoriaId: string;
    curva: readonly { id: string; valor: string }[];
    pideTejido: boolean;
    pidePatron: boolean;
    elegido: Elegido;
  },
  quitados: ReadonlySet<DatoDeLaAnterior> = new Set(),
): FichaDeLaAnterior | null {
  if (!anterior || anterior.categoriaId !== hoja.categoriaId) return null;
  const { elegido } = hoja;
  if (elegido.tejidoId || elegido.patronId || elegido.tallaIds.length > 0) return null;
  const datos: FichaDeLaAnterior["datos"] = [];
  if (hoja.pideTejido && anterior.tejido && !quitados.has("tejido")) datos.push({ clave: "tejido", texto: anterior.tejido.texto });
  if (hoja.pidePatron && anterior.patron && !quitados.has("patron")) datos.push({ clave: "patron", texto: anterior.patron.texto });
  const tallas = tallasQueSirven(anterior, hoja.curva);
  if (tallas.length > 0 && !quitados.has("tallas")) datos.push({ clave: "tallas", texto: textoDeTallas(tallas, hoja.curva) });
  return datos.length > 0 ? { nombre: anterior.nombre, datos } : null;
}

function tallasQueSirven(anterior: PrendaAnterior, curva: readonly { id: string }[]) {
  const deLaCategoria = new Set(curva.map((t) => t.id));
  return anterior.tallas.filter((t) => deLaCategoria.has(t.id));
}

/** Lo que la ficha llena al tocarla: solo los datos que siguen en ella. */
export function loQueLlena(
  anterior: PrendaAnterior,
  ficha: FichaDeLaAnterior,
  curva: readonly { id: string; valor: string }[],
): { tejidoId?: string; patronId?: string; tallaIds?: string[] } {
  const en = new Set(ficha.datos.map((d) => d.clave));
  return {
    ...(en.has("tejido") && anterior.tejido ? { tejidoId: anterior.tejido.id } : {}),
    ...(en.has("patron") && anterior.patron ? { patronId: anterior.patron.id } : {}),
    ...(en.has("tallas") ? { tallaIds: tallasQueSirven(anterior, curva).map((t) => t.id) } : {}),
  };
}

/** Lo que se recuerda al crear una prenda: lo elegido, con sus textos. */
export function recordarPrenda(
  creada: { categoriaId: string; nombre: string; tejidoId: string; patronId: string; tallaIds: readonly string[] },
  vocabulario: { tejidos: readonly { id: string; texto: string }[]; patrones: readonly { id: string; texto: string }[]; tallas: readonly { id: string; valor: string }[] },
): PrendaAnterior {
  const buscar = (lista: readonly { id: string; texto: string }[], id: string) => (id ? (lista.find((x) => x.id === id) ?? null) : null);
  const tallas = new Set(creada.tallaIds);
  return {
    categoriaId: creada.categoriaId,
    nombre: creada.nombre,
    tejido: buscar(vocabulario.tejidos, creada.tejidoId),
    patron: buscar(vocabulario.patrones, creada.patronId),
    tallas: vocabulario.tallas.filter((t) => tallas.has(t.id)),
  };
}

/**
 * La marca del modelo anterior que se ofrece al agregar otro: solo si la persona todavía no eligió una y la marca sigue entre las que el combo
 * ofrece (con un proveedor elegido, el combo no cambia: la marca de otro proveedor también se ofrece, como en el combo). `null` = no se ofrece.
 */
export function marcaDelAnterior(
  anterior: { id: string; nombre: string } | null | undefined,
  marcaElegida: string,
  marcas: readonly { id: string; nombre: string }[],
): { id: string; nombre: string } | null {
  if (!anterior || marcaElegida) return null;
  const viva = marcas.find((m) => m.id === anterior.id);
  return viva ? { id: viva.id, nombre: viva.nombre } : null;
}
