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
  separarAnotada,
  SIN_MARCA,
  sumarPrenda,
  textoPrendas,
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
  /** Cuántas se contaron de este modelo. */
  contadas: number;
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
  // Un 0 solo es «no llegó» si de verdad se sabe: con un número suelto de antes por repartir (o con algo ya en el stock), todavía no se dijo nada.
  const ceroEsNoLlego = sinIdentificarDelGrupo(g) === 0 && g.enStock === 0;
  const usadasCatalogo = new Set<string>();
  const usadasNombre = new Set<string>();
  const filas: ModeloDelConteo[] = anotadasDelGrupo(g).map(({ prenda }) => {
    const clave = claveDeAnotada(prenda);
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
      contadas = g.separado.nuevas.filter((n) => n.descripcion && normaliza(n.descripcion) === k).reduce((a, n) => a + n.cantidad, 0);
    }
    const lineas = lineasDelModelo(g, { clave });
    const contado = contadas > 0 || (lineas.length > 0 && lineas.every((l) => l.conteo !== null));
    return {
      clave,
      nombre: prenda.nombre,
      productoId: prenda.productoId,
      codigo: prenda.codigo,
      esperadas: prenda.cantidad,
      contadas,
      contado,
      estado: estadoDe(prenda.cantidad, contadas, contado, ceroEsNoLlego),
      conTallas,
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
      hecha: contados && gs.every((g) => sinIdentificarDelGrupo(g) === 0),
      variosOrigenes: gs.length > 1,
    };
  });
}

/** La línea bajo el nombre: «13 de 15 contadas · 3 modelos», «sin contar · 1 modelo», «3 contadas» (sin aviso). */
export function resumenDeCategoria(c: CategoriaDelEnvio): string {
  const n = c.paradas.filter((p) => p.modelo).length;
  const conteo = !c.hayConteo ? "sin contar" : c.dijeron != null ? `${c.contadas} de ${c.dijeron} contadas` : `${c.contadas} ${c.contadas === 1 ? "contada" : "contadas"}`;
  return n > 0 ? `${conteo} · ${n} ${n === 1 ? "modelo" : "modelos"}` : conteo;
}

/** «Confecciones del Sur · CAYLA»: de dónde viene un grupo, para cuando la categoría junta varios. */
export const origenDelGrupo = (g: GrupoDeLineas): string => [g.principal.proveedor?.nombre, g.principal.categoria ? marcaDeLinea(g.principal).nombre : null].filter(Boolean).join(" · ");

// ---- El filtro por proveedor y marca ------------------------------------------------------------------------------------------------

export type FiltroDelConteo = { proveedorId: string | null; marcaId: string | null };
export const SIN_FILTRO: FiltroDelConteo = { proveedorId: null, marcaId: null };

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

/** Lo separado con este modelo en `n`. En 0 sale de lo separado, sin volverse «nuevas sin describir»: se dijo que no llegó, no que falta nombrarla. */
export function cantidadDeModelo(s: Separado, m: ModeloDelConteo, n: number): Separado {
  const c = Math.max(0, Math.trunc(n));
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
 * La persona dejó este modelo en `n`. Lo contado del grupo sigue a los modelos: si baja un modelo, baja el total; si sube, primero se usa lo que
 * estaba contado sin saber qué era (de un conteo de antes) y recién después sube el total. Solo se guarda lo que cambia y la línea de este
 * modelo: las demás líneas sin contar siguen «sin contar», para que la guía siga pidiendo cada modelo.
 */
export function repartirModelo(g: GrupoDeLineas, m: ModeloDelConteo, n: number): Reparto {
  const nuevo = cantidadDeModelo(g.separado, m, n);
  const antes = totalSeparado(g.separado);
  const despues = totalSeparado(nuevo);
  const piso = g.enStock + despues;
  const total = despues >= antes ? Math.max(g.contadas, piso) : Math.max(piso, g.contadas - (antes - despues));
  const r = repartirSeparado(g, nuevo, total);
  const deEste = new Set(lineasDelModelo(g, m).map((l) => l.clave));
  return {
    ...r,
    cambios: r.cambios.filter((c) => c.linea.conteo !== null || deEste.has(c.clave) || c.contadas > 0 || totalSeparado(c.separado) > 0),
  };
}

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
  return categorias.flatMap((c) =>
    c.grupos.flatMap((g) => {
      const nombre = c.categoria?.nombre ?? "esta categoría";
      const campos: CampoDeGuia[] = [];
      for (const p of paradasDelGrupo(g)) {
        if (p.modelo ? p.modelo.estado === "fuera" : !g.principal.linea) continue;
        const quien = nombreDeParada(p);
        campos.push({ id: idCampoParada(p), nombre: quien, requerido: true, hecho: paradaContada(p), pendiente: `Cuenta ${quien} y deja cuántas llegaron.` });
      }
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
      return campos;
    }),
  );
}
