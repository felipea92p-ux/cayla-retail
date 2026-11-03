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

import {
  anotadasDelGrupo,
  repartirSeparado,
  sinIdentificarDelGrupo,
  idCampoIdentificar,
  type GrupoDeLineas,
  type Reparto,
} from "./recepcion-grupos-reglas";
import {
  cambiarCantidadNuevaDescrita,
  cambiarCantidadPrenda,
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

const normaliza = (d: string): string => d.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

// ---- Los modelos de un grupo --------------------------------------------------------------------------------------------------------

export type EstadoModelo = "por-contar" | "a-medias" | "cuadra" | "sobran" | "no-llego" | "fuera";

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

/** Los modelos de un grupo, en el orden de la compra y después lo que llegó sin estar anotado. */
export function modelosDelGrupo(g: GrupoDeLineas): ModeloDelConteo[] {
  // Lo que ya entró al stock al cerrar sale de lo separado: al reabrir, lo de cada modelo es lo de su línea. Sin esto decía «Por contar» y «Llegaron las 48» las volvía a contar.
  const enStockDe = (clave: string): number => lineasDelModelo(g, { clave }).reduce((a, l) => a + (l.conteo?.enStock ?? 0), 0);
  const stockDeModelos = anotadasDelGrupo(g).reduce((a, { prenda }) => a + enStockDe(claveDeAnotada(prenda)), 0);
  // Un 0 solo es «no llegó» si de verdad se sabe: con un número suelto de antes por repartir (o con algo en el stock que no es de ningún modelo), todavía no se dijo nada.
  const ceroEsNoLlego = sinIdentificarDelGrupo(g) === 0 && g.enStock === stockDeModelos;
  const usadasCatalogo = new Set<string>();
  const usadasNombre = new Set<string>();
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
    };
  });
  for (const p of g.separado.prendas) {
    if (usadasCatalogo.has(p.productoId) || p.cantidad <= 0) continue;
    filas.push({
      clave: p.productoId,
      nombre: p.nombre ?? p.codigo ?? "Prenda del catálogo",
      productoId: p.productoId,
      codigo: p.codigo,
      esperadas: null,
      contadas: p.cantidad,
      enStock: 0,
      contado: true,
      estado: "fuera",
      conTallas: !!p.variantes,
      anotada: null,
    });
  }
  for (const n of g.separado.nuevas) {
    if (!n.descripcion || n.cantidad <= 0 || usadasNombre.has(normaliza(n.descripcion))) continue;
    usadasNombre.add(normaliza(n.descripcion));
    filas.push({
      clave: `nombre:${normaliza(n.descripcion)}`,
      nombre: n.descripcion,
      productoId: null,
      codigo: null,
      esperadas: null,
      contadas: n.cantidad,
      enStock: 0,
      contado: true,
      estado: "fuera",
      conTallas: false,
      anotada: null,
    });
  }
  return filas;
}

// ---- Las paradas: lo que el Dial puede contar ---------------------------------------------------------------------------------------

/** Lo que el Dial cuenta en un momento: un modelo o, si no hay con qué separarlo, el total del grupo (`modelo: null`). */
export type ParadaDelConteo = { clave: string; grupo: GrupoDeLineas; modelo: ModeloDelConteo | null };

const paradaDe = (grupo: GrupoDeLineas, modelo: ModeloDelConteo | null): ParadaDelConteo => ({ clave: `${grupo.clave}::${modelo?.clave ?? "*"}`, grupo, modelo });

/** La llave de la parada de un modelo que quizá todavía no existe (el que se acaba de agregar). */
export const claveDeParada = (grupo: Pick<GrupoDeLineas, "clave">, modeloClave: string): string => `${grupo.clave}::${modeloClave}`;

/** La llave del grupo de una parada (la de un `extra:n` deja viva esa línea aunque esté en 0). */
export const grupoDeLaClave = (claveParada: string): string => claveParada.split("::")[0];

/**
 * ¿Hace falta contar el grupo como un total? Cuando la compra no anotó qué prendas eran (un envío sin aviso, lo de fuera de la guía) o anotó solo
 * parte de lo que salió: ahí no hay modelo que elegir para lo demás, y se cuenta como siempre, primero el número y luego quién es cada una.
 */
export function necesitaTotal(g: GrupoDeLineas): boolean {
  const anotadas = anotadasDelGrupo(g);
  if (anotadas.length === 0) return true;
  return (g.dijeron ?? 0) > anotadas.reduce((a, x) => a + x.prenda.cantidad, 0);
}

export const paradasDelGrupo = (g: GrupoDeLineas): ParadaDelConteo[] => [...(necesitaTotal(g) ? [paradaDe(g, null)] : []), ...modelosDelGrupo(g).map((m) => paradaDe(g, m))];

export const paradaContada = (p: ParadaDelConteo): boolean => (p.modelo ? p.modelo.contado : p.grupo.principal.linea ? p.grupo.contado : p.grupo.contadas > 0);

/** Las líneas de lo que se cuenta: las del modelo, o todas las del grupo. Lo que se anotó después, sin línea propia, cae en las del grupo. */
export function lineasDeLaParada(p: ParadaDelConteo): LineaParaContar[] {
  const delModelo = p.modelo ? lineasDelModelo(p.grupo, p.modelo) : [];
  return delModelo.length > 0 ? delModelo : p.grupo.lineas;
}

/** Lo que dice la fila o la placa de una parada: el modelo, o «Total de Vestidos». */
export const nombreDeParada = (p: ParadaDelConteo): string => p.modelo?.nombre ?? `Total de ${p.grupo.principal.categoria?.nombre ?? "la categoría"}`;

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

/** Las categorías del envío sin repetir, en el orden en que aparece la primera línea de cada una. */
export function categoriasDelEnvio(grupos: readonly GrupoDeLineas[]): CategoriaDelEnvio[] {
  const porCategoria = new Map<string, GrupoDeLineas[]>();
  for (const g of grupos) {
    const k = g.principal.categoria?.id ?? g.clave;
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

/** Un número como se lee en pantalla: 12,000. */
export const conMiles = (n: number): string => n.toLocaleString("es-PE");

/** Una diferencia, con su signo: +3, −20, 0. */
export const conSigno = (n: number): string => (n > 0 ? `+${conMiles(n)}` : n < 0 ? `−${conMiles(-n)}` : "0");

/** La línea bajo el nombre: «13 de 15 · 3 modelos», «sin contar · 1 modelo», «3 contadas» (sin aviso). Corta: con miles no cabría más. */
export function resumenDeCategoria(c: CategoriaDelEnvio): string {
  const n = c.paradas.filter((p) => p.modelo).length;
  const conteo = !c.hayConteo ? "sin contar" : c.dijeron != null ? `${conMiles(c.contadas)} de ${conMiles(c.dijeron)}` : `${conMiles(c.contadas)} ${c.contadas === 1 ? "contada" : "contadas"}`;
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
  if (p.modelo) return p.modelo.estado === "por-contar" ? "por-contar" : p.modelo.estado === "cuadra" ? "cuadran" : "diferencia";
  if (!paradaContada(p)) return "por-contar";
  return p.grupo.dijeron == null || p.grupo.dijeron === p.grupo.contadas ? "cuadran" : "diferencia";
}

/** Lo contado que queda sin tallas. Lo que la persona pidió hacer ahora (`enAhora`) no es «para después»: ese dice «Faltan tallas». */
export const tallasParaDespues = (p: ParadaDelConteo, enAhora?: ReadonlySet<string>): boolean => !!p.modelo && p.modelo.contadas > 0 && !p.modelo.conTallas && !enAhora?.has(p.clave);

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

/** Un doble clic en «Listo, siguiente» saltaba un modelo sin que nadie lo notara (chaos DC-01, 2026-11-02): el segundo toque, tan seguido, no cuenta. */
export const esToqueRepetido = (anterior: number, ahora: number): boolean => ahora - anterior < 350;

/** Quién va antes y después en la lista que se ve. Si lo que se cuenta salió de la lista, lo que sigue es lo primero que queda. */
export function vecinosDeLaParada(paradas: readonly ParadaDelConteo[], clave: string | null): { anterior: ParadaDelConteo | null; siguiente: ParadaDelConteo | null } {
  const i = paradas.findIndex((p) => p.clave === clave);
  if (i < 0) return { anterior: null, siguiente: paradas[0] ?? null };
  return { anterior: paradas[i - 1] ?? null, siguiente: paradas[i + 1] ?? null };
}

export type CifrasDelResumen = {
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
  const deModelos = paradas.reduce((a, p) => a + (p.modelo?.contadas ?? 0), 0);
  return g.contadas - deModelos + paradas.filter(paradaContada).reduce((a, p) => a + contadasDeParada(p) - (dijeronDe(p) ?? 0), 0);
}

/** Cuánto lleva una categoría de lo que dijeron, de 0 a 100 o más. Sin lo que dijeron, llena en cuanto se contó algo. */
export function avanceDeCategoria(c: Pick<CategoriaDelEnvio, "dijeron" | "contadas">): number {
  return c.dijeron ? (c.contadas / c.dijeron) * 100 : c.contadas > 0 ? 100 : 0;
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
    cambios: r.cambios.filter((c) => c.linea.conteo !== null || lineasDeEsto.has(c.clave) || c.contadas > 0 || totalSeparado(c.separado) > 0),
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

// ---- Las prendas que se parecen ---------------------------------------------------------------------------------------------------------

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "");
const palabras = (t: string): string[] =>
  sinTildes(normaliza(t))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);

/**
 * Del catálogo de esa categoría y marca, las que se parecen a lo que se anotó al comprar: por palabras en común, pesando más las del modelo que
 * se está contando (la primera referencia). Sin nada que comparar, las primeras. Las que ya están en la lista no se ofrecen.
 */
export function prendasParecidas<T extends { productoId: string; nombre: string }>(catalogo: readonly T[], referencias: readonly string[], yaEstan: ReadonlySet<string>, max = 4): T[] {
  const libres = catalogo.filter((p) => !yaEstan.has(p.productoId));
  const refs = referencias.map(palabras);
  if (refs.every((r) => r.length === 0)) return libres.slice(0, max);
  const puntaje = (p: T): number => {
    const suyas = new Set(palabras(p.nombre));
    return refs.reduce((total, r, i) => total + r.filter((w) => suyas.has(w)).length * (i === 0 ? 2 : 1), 0);
  };
  return libres
    .map((p) => ({ p, s: puntaje(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.nombre.localeCompare(b.p.nombre, "es"))
    .slice(0, max)
    .map((x) => x.p);
}

// ---- La guía de foco --------------------------------------------------------------------------------------------------------------------

/** La llave del campo de la guía de una parada (`data-campo` de su fila en el acordeón). */
export const idCampoParada = (p: Pick<ParadaDelConteo, "clave">): string => `contar-${p.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;

/**
 * Lo que la guía pide: cada modelo anotado contado (aunque sea para decir que no llegó) y, con lo contado, que no quede ninguna sin saber qué
 * prenda es. Lo primero no frena nada (si un modelo no se contó, al cerrar sale como faltante); lo segundo sí: sin eso no se pasa a «Cerrar».
 */
export function camposDelConteoPorModelo(categorias: readonly CategoriaDelEnvio[]): CampoDeGuia[] {
  if (categorias.length === 0) {
    return [{ id: ID_CAMPO_AGREGAR, nombre: "Lo que llegó", requerido: true, hecho: false, pendiente: "Agrega la primera categoría que llegó y cuéntala." }];
  }
  // En el orden de `c.paradas`: «Falta: …» dice los modelos como se ven en la lista, también si se ordenó por cantidad.
  return categorias.flatMap((c) => {
    const nombre = c.categoria?.nombre ?? "esta categoría";
    const campos: CampoDeGuia[] = [];
    for (const p of c.paradas) {
      if (p.modelo ? p.modelo.estado === "fuera" : !p.grupo.principal.linea) continue;
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
