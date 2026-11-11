// Contar modelo por modelo (Felipe 2026-11-02, cambia lo de ADR-0393 y ADR-0575): a la izquierda cada categoría una sola vez, aunque venga de
// varios proveedores o marcas; al abrirla, sus modelos uno por uno; y el Dial cuenta el modelo que se eligió. Lo de la categoría sale de sumar.
//
// Por dentro nada cambia: la base guarda una fila por línea de la compra y `agruparLineas` sigue juntando por proveedor + categoría + marca,
// así que Cerrar, el Podio y los reclamos no se enteran. «Categoría» aquí es solo una vista sobre esos grupos: cada modelo pertenece a UN grupo,
// y al contarlo se escribe en la línea de ese grupo. Por eso juntar «Vestidos» de dos proveedores no mezcla lo que le toca a cada uno.
//
// Lo contado de un modelo es lo que ya existía como «lo separado» de esa prenda (`Separado`): contar un modelo es identificarlo. Lo de la categoría
// que todavía no es de ningún modelo (lo contado antes de esto, o un envío sin modelos anotados) sigue siendo «sin identificar» y sigue frenando
// el paso a «Cerrar», igual que antes.

import { existentesParecidos } from "./atributo-parecido";
import {
  anotadasDelGrupo,
  lineaDeLaPrenda,
  repartirSeparado,
  sinIdentificarDelGrupo,
  idCampoIdentificar,
  type GrupoDeLineas,
  type Reparto,
} from "./recepcion-grupos-reglas";
import {
  cambiarCantidadNuevaDescrita,
  cambiarCantidadPrenda,
  costoDePrendaEnLinea,
  ID_CAMPO_AGREGAR,
  marcaDeLinea,
  prendasAnotadasDe,
  quitarPrenda,
  SEPARADO_VACIO,
  separarAnotada,
  SIN_MARCA,
  sumarPrenda,
  textoPrendas,
  TOPES_CONTEO,
  totalSeparado,
  type LineaParaContar,
  type PrendaAnotada,
  type Separado,
} from "./recepcion-conteo-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { compararTallas } from "./tallas";

const normaliza = (d: string): string => d.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

// ---- Los modelos de un grupo --------------------------------------------------------------------------------------------------------

// «contado»: se agregó a una categoría donde Compras dijo cuántas pero no qué modelos: no estaba anotado, pero tampoco está de más; lo que cuadra es la categoría.
export type EstadoModelo = "por-contar" | "a-medias" | "cuadra" | "sobran" | "no-llego" | "fuera" | "contado";

export type ModeloDelConteo = {
  /** Única dentro de su grupo: la prenda del catálogo, o el nombre si se anotó solo por nombre. */
  clave: string;
  nombre: string;
  /** La del catálogo; `null` si solo tiene nombre (se guarda como «nueva» con su descripción). */
  productoId: string | null;
  codigo: string | null;
  /** Cuántas se anotaron al comprar; `null` si no estaba anotada (llegó y no venía en la compra). */
  esperadas: number | null;
  /** Cuántas se contaron de este modelo, con lo que ya entró al stock. */
  contadas: number;
  /** De esas, las que ya entraron al stock en un envío reabierto: no se vuelven a contar y lo contado no baja de ahí. */
  enStock: number;
  /** ¿Ya se contó, aunque sea para decir que no llegó ninguna? */
  contado: boolean;
  estado: EstadoModelo;
  /** Sus tallas y colores, si ya se pusieron. */
  conTallas: boolean;
  anotada: PrendaAnotada | null;
  /** Lo que lo describe, para no confundirlo con otro parecido. */
  nota: string | null;
  /** Su nombre es provisional («Blusa 1»): contado, no deja cerrar el envío. */
  porDefecto: boolean;
};

const claveDeAnotada = (a: PrendaAnotada): string => a.productoId ?? `nombre:${normaliza(a.nombre)}`;

/** Las líneas de la compra que anotaron este modelo (casi siempre una; la misma prenda comprada dos veces, dos). */
export const lineasDelModelo = (g: GrupoDeLineas, m: Pick<ModeloDelConteo, "clave">): LineaParaContar[] =>
  g.lineas.filter((l) => prendasAnotadasDe(l).some((a) => claveDeAnotada(a) === m.clave));

function estadoDe(esperadas: number | null, contadas: number, contado: boolean, ceroEsNoLlego: boolean): EstadoModelo {
  if (esperadas == null) return "fuera";
  if (contadas === 0) return contado && ceroEsNoLlego ? "no-llego" : "por-contar";
  if (contadas < esperadas) return "a-medias";
  return contadas === esperadas ? "cuadra" : "sobran";
}

/** Compras dijo cuántas pero no qué modelos (o solo de una parte): los modelos se agregan al contar y lo que cuadra es la categoría, contra lo que dijeron. */
export function cuadraEnLaCategoria(g: GrupoDeLineas): boolean {
  return g.dijeron != null && g.dijeron > anotadasDelGrupo(g).reduce((a, x) => a + x.prenda.cantidad, 0);
}

/** Los modelos de un grupo, en el orden de la compra y después lo que llegó sin estar anotado. */
export function modelosDelGrupo(g: GrupoDeLineas): ModeloDelConteo[] {
  // Lo que ya entró al stock al cerrar sale de lo separado: al reabrir, lo de cada modelo es lo de su línea. Sin esto decía «Por contar» y «Llegaron las 48» las volvía a contar.
  const enStockDe = (clave: string): number => lineasDelModelo(g, { clave }).reduce((a, l) => a + (l.conteo?.enStock ?? 0), 0);
  const stockDeModelos = anotadasDelGrupo(g).reduce((a, { prenda }) => a + enStockDe(claveDeAnotada(prenda)), 0);
  // Un 0 solo es «no llegó» si de verdad se sabe: con un número suelto de antes por repartir (o con algo en el stock que no es de ningún modelo), todavía no se dijo nada.
  const ceroEsNoLlego = sinIdentificarDelGrupo(g) === 0 && g.enStock === stockDeModelos;
  const usadasCatalogo = new Set<string>();
  const usadasNombre = new Set<string>();
  const llegoSinNombre = cuadraEnLaCategoria(g) ? "contado" : "fuera";
  const filas: ModeloDelConteo[] = anotadasDelGrupo(g).map(({ prenda }) => {
    const clave = claveDeAnotada(prenda);
    let productoId = prenda.productoId;
    let contadas = 0;
    let conTallas = false;
    if (prenda.productoId) {
      usadasCatalogo.add(prenda.productoId);
      const sep = g.separado.prendas.find((p) => p.productoId === prenda.productoId);
      contadas = sep?.cantidad ?? 0;
      conTallas = !!sep?.variantes;
    } else {
      const k = normaliza(prenda.nombre);
      usadasNombre.add(k);
      // Anotada solo por nombre y luego creada en el catálogo con ese nombre («Crear ahora»): sigue siendo este modelo, ahora con su prenda.
      const creada = g.separado.prendas.find((p) => p.nombre && normaliza(p.nombre) === k && !usadasCatalogo.has(p.productoId));
      if (creada) {
        usadasCatalogo.add(creada.productoId);
        productoId = creada.productoId;
        contadas = creada.cantidad;
        conTallas = !!creada.variantes;
      } else {
        contadas = g.separado.nuevas.filter((n) => n.descripcion && normaliza(n.descripcion) === k).reduce((a, n) => a + n.cantidad, 0);
      }
    }
    const lineas = lineasDelModelo(g, { clave });
    const enStock = enStockDe(clave);
    const total = contadas + enStock;
    const contado = total > 0 || (lineas.length > 0 && lineas.every((l) => l.conteo !== null));
    return {
      clave,
      nombre: prenda.nombre,
      productoId,
      codigo: prenda.codigo,
      esperadas: prenda.cantidad,
      contadas: total,
      enStock,
      contado,
      estado: estadoDe(prenda.cantidad, total, contado, ceroEsNoLlego),
      // Lo que ya entró al stock ya tiene sus tallas: solo falta decirlas de lo que queda.
      conTallas: contadas > 0 ? conTallas : enStock > 0,
      anotada: prenda,
      nota: null,
      porDefecto: false,
    };
  });
  for (const p of g.separado.prendas) {
    if (usadasCatalogo.has(p.productoId)) continue;
    filas.push({
      clave: p.productoId,
      nombre: p.nombre ?? p.codigo ?? "Prenda del catálogo",
      productoId: p.productoId,
      codigo: p.codigo,
      esperadas: null,
      contadas: p.cantidad,
      enStock: 0,
      contado: p.cantidad > 0,
      // Lo agregado en 0 todavía no se cuenta (ADR-0604, act. 2026-11-03).
      estado: p.cantidad > 0 ? llegoSinNombre : "por-contar",
      conTallas: !!p.variantes,
      anotada: null,
      nota: null,
      porDefecto: false,
    });
  }
  for (const n of g.separado.nuevas) {
    if (!n.descripcion || usadasNombre.has(normaliza(n.descripcion))) continue;
    usadasNombre.add(normaliza(n.descripcion));
    filas.push({
      clave: `nombre:${normaliza(n.descripcion)}`,
      nombre: n.descripcion,
      productoId: null,
      codigo: null,
      esperadas: null,
      contadas: n.cantidad,
      enStock: 0,
      contado: n.cantidad > 0,
      estado: n.cantidad > 0 ? llegoSinNombre : "por-contar",
      conTallas: false,
      anotada: null,
      nota: n.nota ?? null,
      porDefecto: !!n.porDefecto,
    });
  }
  return filas;
}

// ---- Las paradas: lo que el Dial puede contar ---------------------------------------------------------------------------------------

/** Lo que el Dial cuenta en un momento: un modelo o, de un conteo de antes, lo contado sin modelo (`modelo: null`). */
export type ParadaDelConteo = { clave: string; grupo: GrupoDeLineas; modelo: ModeloDelConteo | null };

const paradaDe = (grupo: GrupoDeLineas, modelo: ModeloDelConteo | null): ParadaDelConteo => ({ clave: `${grupo.clave}::${modelo?.clave ?? "*"}`, grupo, modelo });

/** La llave de la parada de un modelo que quizá todavía no existe (el que se acaba de agregar). */
export const claveDeParada = (grupo: Pick<GrupoDeLineas, "clave">, modeloClave: string): string => `${grupo.clave}::${modeloClave}`;

/** La llave del grupo de una parada (la de un `extra:n` deja viva esa línea aunque esté en 0). */
export const grupoDeLaClave = (claveParada: string): string => claveParada.split("::")[0];

/**
 * ¿Queda algo contado sin modelo y sin un modelo al que atribuírselo? Ya no se cuenta un total (Felipe 2026-11-03: «Total de Blusas» confundía): todo se cuenta por modelo. Esta fila existe solo para
 * un número suelto de antes, de un envío que ya venía contándose así; dice «Sin identificar» y no deja cerrar hasta decir de qué modelo son.
 */
export function hayQueIdentificar(g: GrupoDeLineas): boolean {
  if (sinIdentificarDelGrupo(g) === 0) return false;
  const anotadas = anotadasDelGrupo(g);
  return anotadas.length === 0 || (g.dijeron ?? 0) > anotadas.reduce((a, x) => a + x.prenda.cantidad, 0);
}

export const paradasDelGrupo = (g: GrupoDeLineas): ParadaDelConteo[] => [...(hayQueIdentificar(g) ? [paradaDe(g, null)] : []), ...modelosDelGrupo(g).map((m) => paradaDe(g, m))];

export const paradaContada = (p: ParadaDelConteo): boolean => (p.modelo ? p.modelo.contado : p.grupo.principal.linea ? p.grupo.contado : p.grupo.contadas > 0);

/** Las líneas de lo que se cuenta: las del modelo, o todas las del grupo. Lo que se anotó después, sin línea propia, cae en las del grupo. */
export function lineasDeLaParada(p: ParadaDelConteo): LineaParaContar[] {
  const delModelo = p.modelo ? lineasDelModelo(p.grupo, p.modelo) : [];
  return delModelo.length > 0 ? delModelo : p.grupo.lineas;
}

/** Lo que dice la fila o la placa de una parada: el modelo, o lo contado que todavía no es de ninguno. */
export const nombreDeParada = (p: ParadaDelConteo): string => p.modelo?.nombre ?? "Sin identificar";

/**
 * Cuánto cuesta cada prenda de lo que se cuenta, para verlo arriba, junto a su nombre (Felipe 2026-11-03: quien recibe lo ve): el costo propio de la prenda, o el de su línea, lo mismo con lo que
 * abre Cerrar. La misma prenda comprada dos veces, o un total de varias líneas, puede tener más de uno. Un costo en 0 es que nadie lo dijo (lo que no viene de ninguna orden): no se muestra.
 */
export function costoDeLaParada(p: ParadaDelConteo): { desde: number; hasta: number } | null {
  const m = p.modelo;
  const nuevaDescrita = m && !m.productoId ? m.nombre : null;
  const lineas = !m ? p.grupo.lineas : lineasDelModelo(p.grupo, m).length > 0 ? lineasDelModelo(p.grupo, m) : [lineaDeLaPrenda(p.grupo, m.productoId ? { productoId: m.productoId } : { descripcion: m.nombre })];
  const costos = lineas.map((l) => costoDePrendaEnLinea(l, m?.productoId ?? null, nuevaDescrita)).filter((c): c is number => c != null && c > 0);
  return costos.length > 0 ? { desde: Math.min(...costos), hasta: Math.max(...costos) } : null;
}

const conSoles = (n: number): string => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «S/ 25.00», o «S/ 20.00 a S/ 25.00» si tiene más de uno. */
export const textoDeCosto = (c: { desde: number; hasta: number }): string => (c.desde === c.hasta ? conSoles(c.desde) : `${conSoles(c.desde)} a ${conSoles(c.hasta)}`);

/** La parada en la que se está: la que se eligió; si ya no está (se quitó ese modelo, o la esconde el filtro), otra de su grupo; si no, la primera sin contar. */
export function paradaEnFoco(paradas: readonly ParadaDelConteo[], foco: string | null): ParadaDelConteo | null {
  if (foco) {
    const exacta = paradas.find((p) => p.clave === foco);
    if (exacta) return exacta;
    const delGrupo = paradas.find((p) => p.grupo.clave === grupoDeLaClave(foco));
    if (delGrupo) return delGrupo;
  }
  return paradas.find((p) => !paradaContada(p)) ?? paradas[0] ?? null;
}

// ---- Las categorías: cada una una sola vez ---------------------------------------------------------------------------------------------

export type CategoriaDelEnvio = {
  /** La categoría; lo que no tiene categoría va solo. */
  clave: string;
  categoria: LineaParaContar["categoria"];
  grupos: GrupoDeLineas[];
  paradas: ParadaDelConteo[];
  /** `null` si nada de ella venía en la guía. */
  dijeron: number | null;
  contadas: number;
  /** ¿Se empezó a contar? */
  hayConteo: boolean;
  /** Todo contado, aunque falte decir qué prenda es alguna: recién ahí la diferencia con lo que dijeron es un resultado. */
  contada: boolean;
  /** Todo contado y todas las prendas identificadas. */
  hecha: boolean;
  /** Viene de más de un proveedor o marca: cada fila tiene que decir de cuál. */
  variosOrigenes: boolean;
};

/** La llave de la categoría de un grupo: lo que no tiene categoría va solo. */
export const claveDeCategoria = (g: Pick<GrupoDeLineas, "clave" | "principal">): string => g.principal.categoria?.id ?? g.clave;

/**
 * ¿La categoría se ve abierta? Lo normal es la de lo que se cuenta y, si se está leyendo la lista (buscando o filtrando por estado), todas. La persona la pudo dejar al revés a mano (`alternada`):
 * abrir otra para mirarla no cambia lo que se cuenta (Felipe 2026-11-03; a la prueba ciega la sorprendió que cambiara).
 */
export const categoriaAbierta = (deLoQueSeCuenta: boolean, leyendo: boolean, alternada: boolean): boolean => (deLoQueSeCuenta || leyendo) !== alternada;

/** Las categorías del envío sin repetir, en el orden en que aparece la primera línea de cada una. */
export function categoriasDelEnvio(grupos: readonly GrupoDeLineas[]): CategoriaDelEnvio[] {
  const porCategoria = new Map<string, GrupoDeLineas[]>();
  for (const g of grupos) {
    const k = claveDeCategoria(g);
    const ya = porCategoria.get(k);
    if (ya) ya.push(g);
    else porCategoria.set(k, [g]);
  }
  return [...porCategoria.entries()].map(([clave, gs]) => {
    const contados = gs.every((g) => (g.principal.linea ? g.contado : g.contadas > 0));
    return {
      clave,
      categoria: gs[0].principal.categoria,
      grupos: gs,
      paradas: gs.flatMap(paradasDelGrupo),
      dijeron: gs.every((g) => g.dijeron == null) ? null : gs.reduce((a, g) => a + (g.dijeron ?? 0), 0),
      contadas: gs.reduce((a, g) => a + g.contadas, 0),
      hayConteo: gs.some((g) => g.lineas.some((l) => l.conteo !== null)),
      contada: contados,
      hecha: contados && gs.every((g) => sinIdentificarDelGrupo(g) === 0),
      variosOrigenes: gs.length > 1,
    };
  });
}

/** Una prenda que ya entró al stock en un cierre anterior o en una tanda, con su categoría y lo que entró de cada talla y color. */
export type YaEnStock = {
  prenda: string;
  /** El nombre de su categoría, como lo manda la base; `null` si un recibido viejo no la trae. */
  categoria: string | null;
  cantidad: number;
  /** Las columnas de la matriz, en el orden de la curva (S · M · L, 28 · 30 · 32); `null` = sin talla. */
  tallas: (string | null)[];
  /** Las filas: cada color, en el orden en que llegó, con lo que entró de cada talla (en el orden de `tallas`). `null` = sin color. */
  colores: { color: string | null; porTalla: number[]; total: number }[];
};

/**
 * Lo que un cierre anterior ya metió al stock, por prenda (Felipe 2026-11-03). Al reabrir, lo separado queda vacío: sin esto, esas prendas desaparecían de
 * la lista y parecía que hubiera que volver a contarlas. Se ven con candado; lo que ya es un modelo de la lista con su cifra en el stock no se repite.
 * Desde el 2026-11-07 (Felipe, maqueta «A · Matriz») trae su categoría y las tallas como datos: antes era una frase («28 Azul denim: 2 · 28 Celeste: 2 · …»)
 * en una lista suelta al pie, fuera de su categoría.
 */
export function yaEnStockDelEnvio(
  recibidos: readonly { prenda: string | null; cantidad: number; talla?: string | null; color?: string | null; categoria?: string | null }[] | null,
  modelos: readonly Pick<ModeloDelConteo, "nombre" | "enStock">[] = [],
): YaEnStock[] {
  const yaSeVen = new Set(modelos.filter((m) => m.enStock > 0).map((m) => normaliza(m.nombre)));
  type Fila = { prenda: string; categoria: string | null; cantidad: number; tallas: Set<string | null>; colores: Map<string | null, Map<string | null, number>> };
  const porPrenda = new Map<string, Fila>();
  for (const r of recibidos ?? []) {
    const nombre = r.prenda?.trim();
    if (!nombre || r.cantidad <= 0 || yaSeVen.has(normaliza(nombre))) continue;
    const categoria = r.categoria?.trim() || null;
    // La misma prenda en dos categorías son dos filas: cada una va a la suya.
    const clave = `${normaliza(categoria ?? "")}|${normaliza(nombre)}`;
    const fila = porPrenda.get(clave) ?? { prenda: nombre, categoria, cantidad: 0, tallas: new Set(), colores: new Map() };
    fila.cantidad += r.cantidad;
    const talla = r.talla?.trim() || null;
    const color = r.color?.trim() || null;
    fila.tallas.add(talla);
    const delColor = fila.colores.get(color) ?? new Map<string | null, number>();
    delColor.set(talla, (delColor.get(talla) ?? 0) + r.cantidad);
    fila.colores.set(color, delColor);
    porPrenda.set(clave, fila);
  }
  return [...porPrenda.values()]
    .map((f) => {
      // Sin talla va al final, como «Única».
      const tallas = [...f.tallas].sort((a, b) => (a == null ? 1 : b == null ? -1 : compararTallas(a, b)));
      const colores = [...f.colores].map(([color, n]) => {
        const porTalla = tallas.map((t) => n.get(t) ?? 0);
        return { color, porTalla, total: porTalla.reduce((a, x) => a + x, 0) };
      });
      return { prenda: f.prenda, categoria: f.categoria, cantidad: f.cantidad, tallas, colores };
    })
    .sort((a, b) => a.prenda.localeCompare(b.prenda, "es"));
}

/** Cuántas tallas distintas entraron: «12 en stock · 3 tallas». */
export const tallasDeYaEnStock = (y: Pick<YaEnStock, "tallas">): number => y.tallas.length;

/** Lo que entró de cada talla, sumando los colores: el pie de la matriz. */
export const totalesPorTalla = (y: Pick<YaEnStock, "tallas" | "colores">): number[] => y.tallas.map((_, i) => y.colores.reduce((a, c) => a + c.porTalla[i], 0));

/**
 * Lo que ya entró, cada cosa en su categoría (Felipe 2026-11-07). Se busca por el NOMBRE de la categoría (el recibido no trae su id) entre todas las del envío,
 * no solo las que el filtro deja a la vista: así una categoría escondida por el filtro no hace que lo suyo parezca «sin categoría». Lo que no encuentra la suya
 * (un recibido viejo sin categoría, o una que ya no está en el envío) va en `sueltos`, al pie: nunca se pierde.
 *
 * Con el filtro: buscando por texto, solo lo que coincide (prenda, categoría), y si coincide una prenda de una categoría que el filtro escondía, esa categoría
 * vuelve a la lista (para que «Falda Jean» se encuentre y se corrija). Con «Re stock», «Producto nuevo» o un estado del resumen puestos, lo que ya entró no se
 * muestra: esas listas son de lo que se está contando.
 */
export function categoriasConLoQueYaEntro<T extends Pick<YaEnStock, "prenda" | "categoria">>(
  visibles: readonly CategoriaDelEnvio[],
  todas: readonly CategoriaDelEnvio[],
  ya: readonly T[],
  filtro: Pick<FiltroDelConteo, "tipo" | "estado" | "texto">,
): { categorias: CategoriaDelEnvio[]; porCategoria: ReadonlyMap<string, T[]>; sueltos: T[] } {
  const porCategoria = new Map<string, T[]>();
  if (filtro.tipo || filtro.estado) return { categorias: [...visibles], porCategoria, sueltos: [] };
  const texto = sinTildes(filtro.texto).trim().toLocaleLowerCase("es");
  const pasa = (y: T) => !texto || sinTildes(`${y.prenda} ${y.categoria ?? ""}`).toLocaleLowerCase("es").includes(texto);
  const claveDelNombre = new Map<string, string>();
  for (const c of todas) if (c.categoria?.nombre) claveDelNombre.set(normaliza(c.categoria.nombre), c.clave);
  const sueltos: T[] = [];
  for (const y of ya) {
    if (!pasa(y)) continue;
    const clave = y.categoria ? claveDelNombre.get(normaliza(y.categoria)) : undefined;
    if (!clave) {
      sueltos.push(y);
      continue;
    }
    const lista = porCategoria.get(clave) ?? [];
    lista.push(y);
    porCategoria.set(clave, lista);
  }
  const aLaVista = new Set(visibles.map((c) => c.clave));
  // La que vuelve por lo que ya entró, en su lugar del orden de todas y sin sus modelos (no coinciden con lo buscado).
  const categorias = todas.filter((c) => aLaVista.has(c.clave) || porCategoria.has(c.clave)).map((c) => visibles.find((v) => v.clave === c.clave) ?? { ...c, paradas: [] });
  // Si el filtro de proveedor o marca dejó afuera una categoría, lo suyo tampoco se ve (salvo que se esté buscando por texto).
  if (!texto) for (const clave of [...porCategoria.keys()]) if (!aLaVista.has(clave)) porCategoria.delete(clave);
  return { categorias: texto ? categorias : [...visibles], porCategoria, sueltos };
}

/** El modelo de esa categoría que ya se llama así, si hay (sin espacios de más ni mayúsculas): no se anota dos veces, se va a contarlo. */
export const paradaDelNombre = (c: CategoriaDelEnvio, nombre: string): ParadaDelConteo | null => c.paradas.find((p) => p.modelo && normaliza(p.modelo.nombre) === normaliza(nombre)) ?? null;

/** ¿Lleva tacho? Solo lo que agregó quien cuenta. Lo que anotó Compras no se borra: en 0 dice que no llegó y va al reclamo. Lo que ya entró al stock tampoco se quita desde aquí. */
export const modeloSeQuita = (m: Pick<ModeloDelConteo, "anotada" | "enStock">): boolean => !m.anotada && m.enStock === 0;

/** ¿Se puede quitar la categoría entera? Solo si nada de ella venía en la guía de Compras y nada entró al stock (ADR-0605). */
export const sePuedeQuitarCategoria = (c: Pick<CategoriaDelEnvio, "grupos">): boolean => c.grupos.length > 0 && c.grupos.every((g) => !g.principal.linea && g.enStock === 0);

/** El nombre provisional de un modelo que nadie sabe cómo se llama: el primer «Blusa N» libre de la categoría. */
export function nombrePorDefecto(prenda: string, c: Pick<CategoriaDelEnvio, "paradas"> | null): string {
  const usados = new Set((c?.paradas ?? []).map((p) => (p.modelo ? normaliza(p.modelo.nombre) : "")));
  let n = 1;
  while (usados.has(normaliza(`${prenda} ${n}`))) n += 1;
  return `${prenda} ${n}`;
}

/** La marca que se sugiere para otro modelo: la de la categoría, si toda es de una sola. Con varias, o sin marca, no se adivina. */
export function marcaSugeridaDelModelo(c: CategoriaDelEnvio): string {
  const marcas = new Set(c.grupos.map((g) => g.principal.marca?.id ?? ""));
  return marcas.size === 1 ? ([...marcas][0] ?? "") : "";
}

/** Un número como se lee en pantalla: 12,000. */
export const conMiles = (n: number): string => n.toLocaleString("es-PE");

/** Una diferencia, con su signo: +3, −20, 0. */
export const conSigno = (n: number): string => (n > 0 ? `+${conMiles(n)}` : n < 0 ? `−${conMiles(-n)}` : "0");

/** La línea bajo el nombre: «13 de 15 · 3 modelos», «sin contar · 1 modelo», «3 contadas» (sin aviso). Corta: con miles no cabría más. */
export function resumenDeCategoria(c: CategoriaDelEnvio): string {
  // Con guía, la categoría cuadra contra lo que dijeron (Felipe 2026-11-03).
  if (c.dijeron != null) {
    if (!c.hayConteo) return `Dijeron ${conMiles(c.dijeron)} · sin contar`;
    const dif = c.contadas - c.dijeron;
    return `Dijeron ${conMiles(c.dijeron)} · Contaste ${conMiles(c.contadas)} · ${dif === 0 ? "Cuadra" : dif < 0 ? `Faltan ${conMiles(-dif)}` : `Sobran ${conMiles(dif)}`}`;
  }
  const n = c.paradas.filter((p) => p.modelo).length;
  const conteo = !c.hayConteo ? "sin contar" : `${conMiles(c.contadas)} ${c.contadas === 1 ? "contada" : "contadas"}`;
  return n > 0 ? `${conteo} · ${n} ${n === 1 ? "modelo" : "modelos"}` : conteo;
}

/** «Confecciones del Sur · CAYLA»: de dónde viene un grupo, para cuando la categoría junta varios. */
export const origenDelGrupo = (g: GrupoDeLineas): string => [g.principal.proveedor?.nombre, g.principal.categoria ? marcaDeLinea(g.principal).nombre : null].filter(Boolean).join(" · ");

// ---- El orden por cantidad ----------------------------------------------------------------------------------------------------------

/** Cómo se ven las categorías y sus modelos: como vienen en la compra (`null`) o por cantidad, de menos a más (`asc`) o de más a menos (`desc`). */
export type OrdenDelConteo = "asc" | "desc" | null;

/**
 * La cantidad con la que se ordena: lo que anotó Compras, que no cambia mientras se cuenta (por lo contado, la fila se movería bajo el dedo de quien
 * cuenta). Lo que Compras no anotó (un envío sin aviso, lo de fuera de la guía) va por lo contado.
 */
const cantidadDeParada = (p: ParadaDelConteo): number => (p.modelo ? (p.modelo.esperadas ?? p.modelo.contadas) : (p.grupo.dijeron ?? p.grupo.contadas));
const cantidadDeCategoria = (c: CategoriaDelEnvio): number => c.dijeron ?? c.contadas;

/** Las categorías y, dentro de cada una, sus modelos, en ese orden. Con la misma cantidad queda el orden de la compra (`sort` es estable). */
export function categoriasEnOrden(categorias: readonly CategoriaDelEnvio[], orden: OrdenDelConteo): readonly CategoriaDelEnvio[] {
  if (!orden) return categorias;
  const signo = orden === "asc" ? 1 : -1;
  return categorias
    .map((c) => ({ ...c, paradas: [...c.paradas].sort((a, b) => signo * (cantidadDeParada(a) - cantidadDeParada(b))) }))
    .sort((a, b) => signo * (cantidadDeCategoria(a) - cantidadDeCategoria(b)));
}

// ---- Re stock, Producto nuevo y los estados del resumen (Felipe 2026-11-02, maqueta del boceto) --------------------------------------------

/**
 * Re stock o Producto nuevo no se le pregunta a nadie: lo dice lo que anotó Compras. Un modelo anotado con su prenda del catálogo es re stock; uno anotado solo por su nombre es nuevo,
 * también después de crearlo al recibir. Lo que no estaba anotado lo dice su prenda. Lo que se cuenta como un total, sin modelo, no es ninguno de los dos.
 */
export type TipoDeModelo = "restock" | "nuevo";
export function tipoDeParada(p: Pick<ParadaDelConteo, "modelo">): TipoDeModelo | null {
  if (!p.modelo) return null;
  return (p.modelo.anotada ? p.modelo.anotada.productoId : p.modelo.productoId) ? "restock" : "nuevo";
}

/** Las filas del resumen. Las tres primeras reparten todas las paradas; «despues» se mira aparte (lo que ya se contó y aún no tiene tallas). */
export type EstadoDelResumen = "cuadran" | "diferencia" | "por-contar" | "despues";

export function estadoDeParada(p: ParadaDelConteo): Exclude<EstadoDelResumen, "despues"> {
  if (p.modelo?.estado === "contado") return p.grupo.dijeron === p.grupo.contadas ? "cuadran" : "diferencia";
  if (p.modelo) return p.modelo.estado === "por-contar" ? "por-contar" : p.modelo.estado === "cuadra" ? "cuadran" : "diferencia";
  if (!paradaContada(p)) return "por-contar";
  return p.grupo.dijeron == null || p.grupo.dijeron === p.grupo.contadas ? "cuadran" : "diferencia";
}

/** Lo contado que queda sin tallas. Lo que la persona pidió hacer ahora (`enAhora`) no es «para después»: ese dice «Faltan tallas». */
export const tallasParaDespues = (p: ParadaDelConteo, enAhora?: ReadonlySet<string>): boolean => !!p.modelo && p.modelo.contadas > 0 && !p.modelo.conTallas && !enAhora?.has(p.clave);

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "");

const pasaLaParada = (p: ParadaDelConteo, f: FiltroDelConteo, retener: string | null, enAhora?: ReadonlySet<string>): boolean => {
  // Lo que se está contando no se va de la lista bajo el dedo: con «Por contar» puesto, sumarle una lo sacaría del filtro. Se va al pasar al siguiente.
  if (p.clave !== retener) {
    if (f.tipo && tipoDeParada(p) !== f.tipo) return false;
    if (f.estado && (f.estado === "despues" ? !tallasParaDespues(p, enAhora) : estadoDeParada(p) !== f.estado)) return false;
  }
  const texto = sinTildes(f.texto).trim().toLocaleLowerCase("es");
  if (!texto) return true;
  const donde = [nombreDeParada(p), p.modelo?.codigo, p.grupo.principal.proveedor?.nombre, p.grupo.principal.marca?.nombre, p.grupo.principal.categoria?.nombre].filter(Boolean).join(" ");
  return sinTildes(donde).toLocaleLowerCase("es").includes(texto);
};

/** Con un total en la lista, sus modelos ya están adentro: se suma uno u otro, nunca los dos. */
const sinContarDosVeces = (paradas: readonly ParadaDelConteo[]): ParadaDelConteo[] => {
  const conTotal = new Set(paradas.filter((p) => !p.modelo).map((p) => p.grupo.clave));
  return paradas.filter((p) => !p.modelo || !conTotal.has(p.grupo.clave));
};
const dijeronDe = (p: ParadaDelConteo): number | null => (p.modelo ? p.modelo.esperadas : p.grupo.dijeron);
const contadasDeParada = (p: ParadaDelConteo): number => (p.modelo ? p.modelo.contadas : p.grupo.contadas);

/** La categoría con solo esas paradas: sus cifras pasan a ser las de lo que se ve. */
function conSoloEstas(c: CategoriaDelEnvio, paradas: ParadaDelConteo[]): CategoriaDelEnvio {
  const sumables = sinContarDosVeces(paradas);
  const contada = paradas.every(paradaContada);
  return {
    ...c,
    paradas,
    dijeron: sumables.every((p) => dijeronDe(p) == null) ? null : sumables.reduce((a, p) => a + (dijeronDe(p) ?? 0), 0),
    contadas: sumables.reduce((a, p) => a + contadasDeParada(p), 0),
    hayConteo: paradas.some(paradaContada),
    contada,
    hecha: contada && c.hecha,
  };
}

/** Lo que se ve en la lista: por proveedor y marca se filtran los grupos; por tipo, estado y búsqueda, las paradas de adentro. Una categoría sin nada que mostrar no sale. */
export function categoriasDelFiltro(grupos: readonly GrupoDeLineas[], f: FiltroDelConteo, retener: string | null = null, enAhora?: ReadonlySet<string>): CategoriaDelEnvio[] {
  const categorias = categoriasDelEnvio(gruposDelFiltro(grupos, f));
  if (!f.tipo && !f.estado && !f.texto.trim()) return categorias;
  return categorias.map((c) => conSoloEstas(c, c.paradas.filter((p) => pasaLaParada(p, f, retener, enAhora)))).filter((c) => c.paradas.length > 0);
}

/** Lo que el filtro deja cuando la persona lo cambia: si lo que se contaba ya no se ve, se pasa a lo primero sin contar de lo que se ve. Sin nada a la vista, se queda donde está. La búsqueda no pasa por aquí: lo que se cuenta no cambia mientras se teclea. */
export function focoTrasElFiltro(categorias: readonly CategoriaDelEnvio[], foco: string | null): string | null {
  const lista = categorias.flatMap((c) => c.paradas);
  if (lista.length === 0 || lista.some((p) => p.clave === foco)) return foco;
  return (lista.find((p) => !paradaContada(p)) ?? lista[0]).clave;
}

/**
 * Al final de la lista, lo que sigue es lo que quedó sin contar (ADR-0645): el contador ya no cierra el conteo («Revisar y cerrar» vive solo en la lista), lleva a lo
 * pendiente. Busca desde lo que se cuenta hacia adelante y da la vuelta; lo que se está contando no cuenta como pendiente.
 */
export function siguientePendiente(paradas: readonly ParadaDelConteo[], clave: string | null): ParadaDelConteo | null {
  const i = paradas.findIndex((p) => p.clave === clave);
  const enOrden = i < 0 ? paradas : [...paradas.slice(i + 1), ...paradas.slice(0, i)];
  return enOrden.find((p) => !paradaContada(p)) ?? null;
}

/** Un doble clic en «Listo, siguiente» saltaba un modelo sin que nadie lo notara (chaos DC-01, 2026-11-02): el segundo toque, tan seguido, no cuenta. */
export const esToqueRepetido = (anterior: number, ahora: number): boolean => ahora - anterior < 350;

/** Quién va antes y después en la lista que se ve. Si lo que se cuenta salió de la lista, lo que sigue es lo primero que queda. */
export function vecinosDeLaParada(paradas: readonly ParadaDelConteo[], clave: string | null): { anterior: ParadaDelConteo | null; siguiente: ParadaDelConteo | null } {
  const i = paradas.findIndex((p) => p.clave === clave);
  if (i < 0) return { anterior: null, siguiente: paradas[0] ?? null };
  return { anterior: paradas[i - 1] ?? null, siguiente: paradas[i + 1] ?? null };
}

export type CifrasDelResumen = {
  /** Lo que agregó quien cuenta y sigue en 0: al cerrar no se pide, se descarta. */
  agregadosEnCero: number;
  /** `null` en un envío sin aviso: no hay con qué comparar. */
  dijeron: number | null;
  contadas: number;
  /** De lo ya contado: lo que falta contar no es todavía un faltante. */
  diferencia: number;
  /** Cuánto lleva del total, de 0 a 100 o más. `null` sin lo que dijeron. */
  avance: number | null;
  estados: Record<EstadoDelResumen, number>;
  tipos: Record<TipoDeModelo, { modelos: number; contados: number }>;
};

/** Lo que dice el resumen de la derecha, de TODO el envío: los filtros solo deciden qué se ve a la izquierda. */
export function cifrasDelResumen(categorias: readonly CategoriaDelEnvio[], enAhora?: ReadonlySet<string>): CifrasDelResumen {
  const paradas = categorias.flatMap((c) => c.paradas);
  const grupos = categorias.flatMap((c) => c.grupos);
  const dijeron = grupos.every((g) => g.dijeron == null) ? null : grupos.reduce((a, g) => a + (g.dijeron ?? 0), 0);
  const contadas = grupos.reduce((a, g) => a + g.contadas, 0);
  const estados: Record<EstadoDelResumen, number> = { cuadran: 0, diferencia: 0, "por-contar": 0, despues: 0 };
  const tipos: CifrasDelResumen["tipos"] = { restock: { modelos: 0, contados: 0 }, nuevo: { modelos: 0, contados: 0 } };
  for (const p of paradas) {
    estados[estadoDeParada(p)] += 1;
    if (tallasParaDespues(p, enAhora)) estados.despues += 1;
    const tipo = tipoDeParada(p);
    if (!tipo) continue;
    tipos[tipo].modelos += 1;
    if (paradaContada(p)) tipos[tipo].contados += 1;
  }
  return {
    agregadosEnCero: paradas.filter((p) => p.modelo && !p.modelo.anotada && p.modelo.contadas === 0).length,
    dijeron,
    contadas,
    diferencia: grupos.reduce((a, g) => a + diferenciaDelGrupo(g, paradas.filter((p) => p.grupo.clave === g.clave)), 0),
    avance: dijeron == null ? null : dijeron > 0 ? (contadas / dijeron) * 100 : contadas > 0 ? 100 : 0,
    estados,
    tipos,
  };
}

/** Lo contado contra lo que dijeron, solo de lo ya contado. Lo contado que no es de ningún modelo (un número suelto de antes) también cuenta. */
function diferenciaDelGrupo(g: GrupoDeLineas, paradas: readonly ParadaDelConteo[]): number {
  const total = paradas.find((p) => !p.modelo);
  if (total) return paradaContada(total) ? g.contadas - (g.dijeron ?? 0) : 0;
  // Lo que cuadra es la categoría: contra lo que dijeron, en cuanto se empezó a contar.
  if (cuadraEnLaCategoria(g)) return g.contadas > 0 || paradas.some(paradaContada) ? g.contadas - (g.dijeron ?? 0) : 0;
  const deModelos = paradas.reduce((a, p) => a + (p.modelo?.contadas ?? 0), 0);
  return g.contadas - deModelos + paradas.filter(paradaContada).reduce((a, p) => a + contadasDeParada(p) - (dijeronDe(p) ?? 0), 0);
}

/** Cuánto lleva una categoría de lo que dijeron, de 0 a 100 o más. Sin lo que dijeron, llena en cuanto se contó algo. */
export function avanceDeCategoria(c: Pick<CategoriaDelEnvio, "dijeron" | "contadas">): number {
  return c.dijeron ? (c.contadas / c.dijeron) * 100 : c.contadas > 0 ? 100 : 0;
}

/**
 * La línea de arriba de la lista (ADR-0645): qué falta por contar o cómo quedó todo. Reemplaza al resumen de la derecha, que nadie leía. Sin nada que
 * contar todavía no dice nada.
 */
export function fraseDelAvance(c: CifrasDelResumen): { texto: string; tono: "verde" | "ambar" | null } | null {
  const porContar = c.estados["por-contar"];
  if (c.estados.cuadran + c.estados.diferencia + porContar === 0) return null;
  if (porContar > 0) return { texto: porContar === 1 ? "Falta 1 por contar" : `Faltan ${conMiles(porContar)} por contar`, tono: null };
  if (c.dijeron != null && c.diferencia !== 0) return { texto: `Todo contado · diferencia ${conSigno(c.diferencia)}`, tono: "ambar" };
  return { texto: "Todo contado", tono: "verde" };
}

// ---- El filtro por proveedor y marca ------------------------------------------------------------------------------------------------

export type FiltroDelConteo = {
  proveedorId: string | null;
  marcaId: string | null;
  /** Re stock o Producto nuevo: las tarjetas de arriba. */
  tipo: TipoDeModelo | null;
  /** Una fila del resumen («Con diferencia», «Por contar»…). */
  estado: EstadoDelResumen | null;
  /** Lo que se busca: modelo, código, proveedor o marca. */
  texto: string;
};
export const SIN_FILTRO: FiltroDelConteo = { proveedorId: null, marcaId: null, tipo: null, estado: null, texto: "" };
export const hayFiltro = (f: FiltroDelConteo): boolean => !!(f.proveedorId || f.marcaId || f.tipo || f.estado || f.texto.trim());
/** Cuántos filtros hay puestos: lo que dice el botón «Filtros» (ADR-0645). Lo que se busca se ve en su caja y el orden no esconde nada: no cuentan. */
export const filtrosPuestos = (f: FiltroDelConteo): number => [f.proveedorId, f.marcaId, f.tipo, f.estado].filter(Boolean).length;

/** El valor de «proveedor por confirmar» en el filtro. */
export const SIN_PROVEEDOR = "sin-proveedor";

const proveedorIdDe = (g: GrupoDeLineas): string => g.principal.proveedor?.id ?? SIN_PROVEEDOR;
const marcaIdDe = (g: GrupoDeLineas): string => g.principal.marca?.id ?? SIN_MARCA;
const pasaProveedor = (g: GrupoDeLineas, f: FiltroDelConteo) => !f.proveedorId || proveedorIdDe(g) === f.proveedorId;
const pasaMarca = (g: GrupoDeLineas, f: FiltroDelConteo) => !f.marcaId || marcaIdDe(g) === f.marcaId;

export const gruposDelFiltro = (grupos: readonly GrupoDeLineas[], f: FiltroDelConteo): GrupoDeLineas[] => grupos.filter((g) => pasaProveedor(g, f) && pasaMarca(g, f));

export type OpcionDelFiltro = { valor: string; etiqueta: string };

const sinRepetir = (opciones: readonly OpcionDelFiltro[]): OpcionDelFiltro[] => [...new Map(opciones.map((o) => [o.valor, o])).values()];

/**
 * Qué se puede elegir: cada filtro ofrece lo que queda con el otro puesto, para que nunca se llegue a una lista vacía por combinarlos. Con un
 * solo proveedor o una sola marca en todo el envío, ese filtro no se dibuja: no hay nada que filtrar (`hayQue*`).
 */
export function opcionesDelFiltro(grupos: readonly GrupoDeLineas[], f: FiltroDelConteo) {
  const proveedores = sinRepetir(grupos.filter((g) => pasaMarca(g, f)).map((g) => ({ valor: proveedorIdDe(g), etiqueta: g.principal.proveedor?.nombre ?? "Por confirmar" })));
  const marcas = sinRepetir(grupos.filter((g) => pasaProveedor(g, f)).map((g) => ({ valor: marcaIdDe(g), etiqueta: marcaDeLinea(g.principal).nombre })));
  return {
    proveedores,
    marcas,
    hayQueFiltrarProveedor: new Set(grupos.map(proveedorIdDe)).size > 1,
    hayQueFiltrarMarca: new Set(grupos.map(marcaIdDe)).size > 1,
  };
}

// ---- Contar un modelo -----------------------------------------------------------------------------------------------------------------

/**
 * Lo separado con este modelo en `n`. En 0 sale de lo separado, sin volverse «nuevas sin describir»: se dijo que no llegó, no que falta nombrarla. `n` es todo lo que llegó del modelo:
 * en un envío reabierto, lo que ya entró al stock no vuelve a lo separado (si volviera, entraría otra vez al cerrar).
 */
export function cantidadDeModelo(s: Separado, m: ModeloDelConteo, n: number): Separado {
  const c = Math.max(0, Math.min(TOPES_CONTEO.contadas, Math.trunc(n)) - m.enStock);
  // Lo que agregó quien cuenta sigue en la lista aunque vuelva a 0: se quita con su tacho. Lo que anotó Compras sigue por lo que anotó.
  if (c === 0 && !m.anotada) {
    return {
      prendas: s.prendas.map((p) => (m.productoId && p.productoId === m.productoId ? { ...p, cantidad: 0, variantes: null } : p)),
      nuevas: s.nuevas.map((x) => (!m.productoId && x.descripcion && normaliza(x.descripcion) === normaliza(m.nombre) ? { ...x, cantidad: 0 } : x)),
    };
  }
  if (m.productoId) {
    if (c === 0) return quitarPrenda(s, m.productoId);
    return s.prendas.some((p) => p.productoId === m.productoId)
      ? cambiarCantidadPrenda(s, m.productoId, c)
      : sumarPrenda(s, { productoId: m.productoId, nombre: m.nombre, codigo: m.codigo }, c);
  }
  const k = normaliza(m.nombre);
  const ya = s.nuevas.find((x) => x.descripcion && normaliza(x.descripcion) === k);
  if (c === 0) return ya ? { ...s, nuevas: s.nuevas.filter((x) => x !== ya) } : s;
  if (ya?.descripcion) return cambiarCantidadNuevaDescrita(s, ya.descripcion, c);
  return separarAnotada(s, { productoId: null, nombre: m.nombre, codigo: null, cantidad: c }, c);
}

/**
 * Lo separado cambió: lo contado del grupo lo sigue. Si baja, baja el total; si sube, primero se usa lo que estaba contado sin saber qué era (de un
 * conteo de antes) y recién después sube el total. Solo se guarda lo que cambia y las líneas de `lineasDeEsto`: las demás líneas sin contar siguen
 * «sin contar», para que la guía siga pidiendo cada modelo.
 */
function repartirCambio(g: GrupoDeLineas, nuevo: Separado, lineasDeEsto: ReadonlySet<string>): Reparto {
  const antes = totalSeparado(g.separado);
  const despues = totalSeparado(nuevo);
  const piso = g.enStock + despues;
  const total = despues >= antes ? Math.max(g.contadas, piso) : Math.max(piso, g.contadas - (antes - despues));
  const r = repartirSeparado(g, nuevo, total);
  return {
    ...r,
    // Un modelo en 0 también se guarda: si no, se perdería al recargar.
    cambios: r.cambios.filter((c) => c.linea.conteo !== null || lineasDeEsto.has(c.clave) || c.contadas > 0 || c.separado.prendas.length + c.separado.nuevas.length > 0),
  };
}

/**
 * La misma prenda comprada en dos líneas es un solo modelo para quien cuenta, pero cada línea tiene lo que dijo. Lo contado se reparte en el orden
 * de la compra hasta lo que dijo cada una, y lo que sobra va a la última. Sin esto una quedaba con todo y la otra en 0, y «Cerrar» pedía explicar un
 * faltante y un sobrante que no existen, aunque el modelo cuadrara.
 */
function partirEntreSusLineas(g: GrupoDeLineas, m: ModeloDelConteo, r: Reparto): Reparto {
  const lineas = lineasDelModelo(g, m);
  if (lineas.length < 2) return r;
  const clave = normaliza(m.nombre);
  const esDelModelo = {
    prenda: (p: Separado["prendas"][number]) => p.productoId === m.productoId,
    nueva: (x: Separado["nuevas"][number]) => !m.productoId && !!x.descripcion && normaliza(x.descripcion) === clave,
  };
  const cuantasEn = (s: Separado) => s.prendas.filter(esDelModelo.prenda).reduce((a, p) => a + p.cantidad, 0) + s.nuevas.filter(esDelModelo.nueva).reduce((a, x) => a + x.cantidad, 0);
  const despues = new Map(g.lineas.map((l) => [l.clave, { linea: l, contadas: l.conteo?.contadas ?? 0, separado: l.conteo?.separado ?? SEPARADO_VACIO }]));
  for (const c of r.cambios) despues.set(c.clave, { linea: c.linea, contadas: c.contadas, separado: c.separado });
  let resto = [...despues.values()].reduce((a, d) => a + cuantasEn(d.separado), 0);
  lineas.forEach((l, i) => {
    const d = despues.get(l.clave);
    if (!d) return;
    const leToca = i === lineas.length - 1 ? resto : Math.min(resto, Math.max(0, (l.dijeron ?? 0) - (l.conteo?.enStock ?? 0)));
    resto -= leToca;
    const sin = { prendas: d.separado.prendas.filter((p) => !esDelModelo.prenda(p)), nuevas: d.separado.nuevas.filter((x) => !esDelModelo.nueva(x)) };
    const con: Separado =
      leToca === 0
        ? sin
        : m.productoId
          ? sumarPrenda(sin, { productoId: m.productoId, nombre: m.nombre, codigo: m.codigo }, leToca)
          : { ...sin, nuevas: [...sin.nuevas, { cantidad: leToca, descripcion: m.nombre }] };
    d.contadas += leToca - cuantasEn(d.separado);
    d.separado = con;
  });
  const deEste = new Set(lineas.map((l) => l.clave));
  const cambios = [...despues.values()]
    .filter(({ linea, contadas, separado }) => deEste.has(linea.clave) || r.cambios.some((c) => c.clave === linea.clave) || contadas !== (linea.conteo?.contadas ?? 0) || JSON.stringify(separado) !== JSON.stringify(linea.conteo?.separado ?? SEPARADO_VACIO))
    .map(({ linea, contadas, separado }) => ({ linea, clave: linea.clave, contadas, separado }));
  return { ...r, cambios };
}

/** Lo separado cambió por lo que se contó de este modelo: `nuevo` ya trae su cantidad (y, si cuadran, sus tallas). */
export const repartirModeloCon = (g: GrupoDeLineas, m: ModeloDelConteo, nuevo: Separado): Reparto => partirEntreSusLineas(g, m, repartirCambio(g, nuevo, new Set(lineasDelModelo(g, m).map((l) => l.clave))));

/** @internal La persona dejó este modelo en `n`: la forma corta con la que las pruebas encadenan toques. La pantalla pasa por `repartirModeloCon`, porque a veces lleva sus tallas. */
export const repartirModelo = (g: GrupoDeLineas, m: ModeloDelConteo, n: number): Reparto => repartirModeloCon(g, m, cantidadDeModelo(g.separado, m, n));

/** Lo separado cambió por otra cosa (llegó una prenda más, se le pusieron tallas, unas sin nombre). */
export const repartirOtroCambio = (g: GrupoDeLineas, nuevo: Separado): Reparto => repartirCambio(g, nuevo, new Set());

/** La llave de modelo de lo que se anota por su nombre (para quedarse en él apenas exista). */
export const claveDeNombre = (nombre: string): string => `nombre:${normaliza(nombre)}`;

// ---- La guía de foco --------------------------------------------------------------------------------------------------------------------

/** La llave del campo de la guía de una parada (`data-campo` de su fila en el acordeón). */
export const idCampoParada = (p: Pick<ParadaDelConteo, "clave">): string => `contar-${p.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;

/**
 * Lo que la guía pide: cada modelo anotado contado (aunque sea para decir que no llegó) y, con lo contado, que no quede ninguna sin saber qué
 * prenda es. Lo primero no frena nada (si un modelo no se contó, al cerrar sale como faltante); lo segundo sí: sin eso no se pasa a «Cerrar».
 */
export const idCampoCategoria = (clave: string): string => `categoria-${clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;

export function camposDelConteoPorModelo(categorias: readonly CategoriaDelEnvio[]): CampoDeGuia[] {
  if (categorias.length === 0) {
    return [{ id: ID_CAMPO_AGREGAR, nombre: "Lo que llegó", requerido: true, hecho: false, pendiente: "Agrega la primera categoría que llegó y cuéntala." }];
  }
  // En el orden de `c.paradas`: «Falta: …» dice los modelos como se ven en la lista, también si se ordenó por cantidad.
  return categorias.flatMap((c) => {
    const nombre = c.categoria?.nombre ?? "esta categoría";
    const campos: CampoDeGuia[] = [];
    // Vino en la guía sin decir qué modelos: lo que falta son sus modelos, con el «+» de la categoría.
    if (c.paradas.length === 0) {
      campos.push({ id: idCampoCategoria(c.clave), nombre: `Los modelos de ${nombre}`, requerido: true, hecho: c.contada, pendiente: `Agrega cada modelo de ${nombre} con el «+» y cuéntalo.` });
    }
    for (const p of c.paradas) {
      if (p.modelo?.porDefecto && p.modelo.contadas > 0) {
        // Conviene, no frena (Felipe 2026-11-03): cierra y queda pendiente; sin nombre no se puede crear ni vender.
        campos.push({ id: idCampoParada(p), nombre: `El nombre de ${p.modelo.nombre}`, requerido: false, sugerido: true, hecho: false, pendiente: `Ponle su nombre a ${p.modelo.nombre}, si ya lo sabes: sin él no se puede vender.` });
        continue;
      }
      if (!p.modelo || p.modelo.estado === "fuera" || p.modelo.estado === "contado") continue;
      const quien = nombreDeParada(p);
      campos.push({ id: idCampoParada(p), nombre: quien, requerido: true, hecho: paradaContada(p), pendiente: `Cuenta ${quien} y deja cuántas llegaron.` });
    }
    for (const g of c.grupos) {
      const sin = sinIdentificarDelGrupo(g);
      if (sin > 0) {
        campos.push({
          id: idCampoIdentificar(g.clave),
          nombre: `Qué ${nombre.toLowerCase()} son`,
          requerido: true,
          hecho: false,
          pendiente: `${sin === 1 ? "Falta" : "Faltan"} ${textoPrendas(sin)} por identificar en ${nombre}: elige el modelo, búscala o anótala como nueva.`,
        });
      }
    }
    return campos;
  });
}

/**
 * Lo que se le muestra a quien agrega un modelo (Felipe 2026-11-03): lo que trae lo escrito, y `pregunta`, la prenda que se llama igual o casi igual. Esa no se deja pasar en silencio:
 * o es esa, o la persona dice que es otra. Cuántas muestra lo decide la pantalla; lo que no se parece no sale (antes salía todo lo que compartía la categoría).
 */
export function parecidasDelNombre<P extends { productoId: string; nombre: string; coincide?: boolean }>(texto: string, prendas: readonly P[]): { aLaVista: P[]; pregunta: P | null } {
  const porNombre = existentesParecidos(texto, prendas.map((p) => ({ id: p.productoId, nombre: p.nombre })));
  const ids = new Set(porNombre.map((c) => c.id));
  return {
    aLaVista: prendas.filter((p) => p.coincide || ids.has(p.productoId)),
    pregunta: prendas.find((p) => p.productoId === porNombre[0]?.id) ?? null,
  };
}
