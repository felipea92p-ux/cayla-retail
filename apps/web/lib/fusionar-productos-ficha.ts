// La hoja «Fusionar productos repetidos», dirección B «La ficha que se arma» (Felipe 2026-11-13; ficha al milímetro en
// `docs/milimetro/fusionar-productos.md`): lo que se dibuja a partir del plan de la base y del detalle de cada ficha, sin React.
// No decide nada de negocio: qué se muda y qué se junta lo dice `fn_fusion_productos_plan` (ADR-0650); aquí solo se acomoda
// para verlo.

import { compararTallas } from "./tallas";
import {
  camposAElegir,
  fuenteDe,
  valorDeCampo,
  type CampoFusion,
  type Elecciones,
  type PlanFusion,
  type ProductoPlan,
} from "./fusionar-productos-reglas";

// ---------------------------------------------------------------------------------------------------------------------
// Orden fijo (decisión 3 del rediseño): las fichas se ven en el orden en que se agregaron, y elegir cuál queda no las mueve.
// ---------------------------------------------------------------------------------------------------------------------

/** Los productos del plan en el orden en que se agregaron a la hoja (`ids`). El plan pone primero al que queda: si la hoja
 *  dibujara ese orden, las tarjetas saltarían de lugar al elegir (lo que Felipe vio el 2026-11-13). */
export function ordenFijo<T extends { id: string }>(ids: string[], productos: T[]): T[] {
  const lugar = new Map(ids.map((id, i) => [id, i]));
  return [...productos].sort((a, b) => (lugar.get(a.id) ?? Infinity) - (lugar.get(b.id) ?? Infinity));
}

// ---------------------------------------------------------------------------------------------------------------------
// El detalle de cada ficha: sus tallas y colores, y su stock en cada sede (`fn_existencias`, la única cifra de stock, ADR-0270).
// ---------------------------------------------------------------------------------------------------------------------

export type VarianteDetalle = {
  varianteId: string;
  productoId: string;
  colorCodigo: string | null;
  color: string;
  colorHex: string | null;
  talla: string | null;
  /** Ni retirada ni ya fusionada en otra: la que se vende y se dibuja. */
  vigente: boolean;
};

export type ExistenciaDetalle = {
  varianteId: string;
  ubicacionId: string;
  fisico: number;
  apartado: number;
  danado: number;
  almacen: number;
};

export type SedeDetalle = { id: string; nombre: string; tipo: string };

export type DetalleFusion = { variantes: VarianteDetalle[]; existencias: ExistenciaDetalle[]; sedes: SedeDetalle[] };

export type StockDeSede = { ubicacionId: string; sede: string; total: number; detalle: string | null };

const ORDEN_TIPO: Record<string, number> = { tienda: 0, almacen: 1, taller: 2 };

const plural = (n: number, una: string, varias: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? una : varias}`;

/** Las sedes que se comparan: las que tienen stock de CUALQUIERA de las fichas, en un orden fijo (tiendas, almacén, Taller; y
 *  por nombre). Todas las columnas usan la misma lista: así la misma fila es la misma sede en las tres. */
export function sedesAComparar(detalle: DetalleFusion): SedeDetalle[] {
  const conStock = new Set(detalle.existencias.filter((e) => e.fisico > 0).map((e) => e.ubicacionId));
  return detalle.sedes
    .filter((s) => conStock.has(s.id))
    .sort((a, b) => (ORDEN_TIPO[a.tipo] ?? 9) - (ORDEN_TIPO[b.tipo] ?? 9) || a.nombre.localeCompare(b.nombre, "es"));
}

/** El stock de una ficha en cada sede de `sedes` (cero donde no tiene), con lo que no está para vender dicho aparte. */
export function stockPorSede(productoId: string, detalle: DetalleFusion, sedes: SedeDetalle[]): StockDeSede[] {
  const suyas = new Set(detalle.variantes.filter((v) => v.productoId === productoId).map((v) => v.varianteId));
  return sedes.map((s) => {
    const filas = detalle.existencias.filter((e) => e.ubicacionId === s.id && suyas.has(e.varianteId));
    const suma = (k: "fisico" | "apartado" | "danado" | "almacen") => filas.reduce((t, e) => t + e[k], 0);
    const partes = [
      suma("almacen") > 0 ? `${suma("almacen").toLocaleString("es-PE")} en almacén` : null,
      suma("apartado") > 0 ? plural(suma("apartado"), "apartada", "apartadas") : null,
      suma("danado") > 0 ? plural(suma("danado"), "dañada", "dañadas") : null,
    ].filter(Boolean);
    return { ubicacionId: s.id, sede: s.nombre, total: suma("fisico"), detalle: partes.length > 0 ? partes.join(" · ") : null };
  });
}

/** La medida de las barras de stock: la mayor sede de TODAS las fichas, para que una barra igual sea la misma cantidad en
 *  cualquier columna (`grafico.escala`). Nunca 0, para no dividir por cero. */
export function escalaDeStock(columnas: StockDeSede[][]): number {
  return Math.max(1, ...columnas.flat().map((s) => s.total));
}

export type TallasDeFicha = { colores: { color: string; colorHex: string | null; tallas: string[] }[] };

/** Las tallas y colores vigentes de una ficha, para la hoja de comparar: color por color, sus tallas en orden. */
export function tallasDeFicha(productoId: string, detalle: DetalleFusion): TallasDeFicha {
  const porColor = new Map<string, { color: string; colorHex: string | null; tallas: string[] }>();
  for (const v of detalle.variantes) {
    if (v.productoId !== productoId || !v.vigente) continue;
    const clave = v.colorCodigo ?? "";
    const c = porColor.get(clave) ?? { color: v.color, colorHex: v.colorHex, tallas: [] };
    if (!c.tallas.includes(v.talla ?? "Única")) c.tallas.push(v.talla ?? "Única");
    porColor.set(clave, c);
  }
  return {
    colores: [...porColor.values()]
      .sort((a, b) => a.color.localeCompare(b.color, "es"))
      .map((c) => ({ ...c, tallas: c.tallas.sort(compararTallas) })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// La matriz color × talla de la ficha final (decisión 7): qué ya estaba, qué pasa y qué se junta.
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoCelda = "ya" | "pasa" | "junta";

export type CeldaMatriz = {
  estado: EstadoCelda;
  /** Lo que la que queda ya tiene en esa talla y color. */
  antes: number;
  /** Lo que llega de las repetidas. */
  llega: number;
};

export type MatrizFinal = {
  colores: { clave: string; color: string; colorHex: string | null }[];
  tallas: string[];
  /** Por `clave del color|talla`; sin entrada, esa talla y color no existe en la ficha final. */
  celdas: Record<string, CeldaMatriz>;
  cuenta: { ya: number; pasa: number; junta: number };
};

const claveCelda = (colorCodigo: string | null, talla: string | null) => `${colorCodigo ?? ""}|${talla ?? "Única"}`;

export function celdaDe(m: MatrizFinal, colorClave: string, talla: string): CeldaMatriz | null {
  return m.celdas[`${colorClave}|${talla}`] ?? null;
}

/**
 * La ficha final talla por talla. Las de la que queda salen del detalle (el plan no las manda: no cambian); las de las repetidas,
 * del plan, que dice si cada una se muda («pasa») o se junta con otra («se junta», +N). Una talla retirada se muda igual, pero
 * no se dibuja: no se vende. El stock que llega es el del plan (el mismo número que mueve la fusión).
 */
export function matrizFinal(
  plan: Pick<PlanFusion, "variantes">,
  quedaId: string,
  detalle: DetalleFusion,
  /** Las que salen de la venta al fusionar (20261113175000): ni ellas ni lo que se les junta se dibujan. */
  retiradas: ReadonlySet<string> = new Set(),
): MatrizFinal {
  const fisicoDe = new Map<string, number>();
  for (const e of detalle.existencias) fisicoDe.set(e.varianteId, (fisicoDe.get(e.varianteId) ?? 0) + e.fisico);

  const colores = new Map<string, { clave: string; color: string; colorHex: string | null }>();
  const tallas = new Set<string>();
  const celdas: Record<string, CeldaMatriz> = {};
  const anotar = (colorCodigo: string | null, color: string, colorHex: string | null, talla: string | null) => {
    const clave = colorCodigo ?? "";
    if (!colores.has(clave)) colores.set(clave, { clave, color, colorHex });
    tallas.add(talla ?? "Única");
    return claveCelda(colorCodigo, talla);
  };

  for (const v of detalle.variantes) {
    if (v.productoId !== quedaId || !v.vigente || retiradas.has(v.varianteId)) continue;
    const k = anotar(v.colorCodigo, v.color, v.colorHex, v.talla);
    const c = celdas[k] ?? { estado: "ya", antes: 0, llega: 0 };
    celdas[k] = { ...c, antes: c.antes + (fisicoDe.get(v.varianteId) ?? 0) };
  }
  for (const v of plan.variantes) {
    if (!v.activa || v.productoId === quedaId || retiradas.has(v.varianteId) || (v.conVarianteId && retiradas.has(v.conVarianteId))) continue;
    const k = anotar(v.colorCodigo, v.color, v.colorHex, v.talla);
    const c = celdas[k];
    if (!c) celdas[k] = { estado: "pasa", antes: 0, llega: v.stock };
    else celdas[k] = { estado: c.estado === "pasa" ? "pasa" : "junta", antes: c.antes, llega: c.llega + v.stock };
  }

  const valores = Object.values(celdas);
  return {
    // Por nombre: el orden en que llegan las filas de la base no dice nada, y así la misma prenda se lee igual cada vez.
    colores: [...colores.values()].sort((a, b) => a.color.localeCompare(b.color, "es")),
    tallas: [...tallas].sort(compararTallas),
    celdas,
    cuenta: {
      ya: valores.filter((c) => c.estado === "ya").length,
      pasa: valores.filter((c) => c.estado === "pasa").length,
      junta: valores.filter((c) => c.estado === "junta").length,
    },
  };
}

/** La frase bajo la matriz, en palabras de tienda: «2 tallas pasan · 2 se juntan (+3 prendas)». Null si no cambia nada. */
export function fraseDeLaMatriz(m: MatrizFinal): string | null {
  const llegan = Object.values(m.celdas)
    .filter((c) => c.estado === "junta")
    .reduce((t, c) => t + c.llega, 0);
  const partes = [
    m.cuenta.pasa > 0 ? `${plural(m.cuenta.pasa, "talla pasa", "tallas pasan")} tal cual` : null,
    m.cuenta.junta > 0
      ? `${plural(m.cuenta.junta, "talla se junta", "tallas se juntan")}${llegan > 0 ? ` (+${plural(llegan, "prenda", "prendas")})` : ""}`
      : null,
  ].filter(Boolean);
  return partes.length > 0 ? `${partes.join(" · ")}.` : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// «Así va a quedar»: la ficha final, dato por dato, con lo elegido.
// ---------------------------------------------------------------------------------------------------------------------

export type DatoFinal = {
  campo: CampoFusion | "precio" | "costo";
  valor: string;
  /** El valor viene de otra ficha, no de la que queda: se marca (y se voltea una vez al cambiar). */
  deOtra: boolean;
};

export type FichaFinal = {
  referencia: string;
  /** El nombre viene de otra ficha. */
  referenciaDeOtra: boolean;
  codigo: string | null;
  categoria: ProductoPlan["categoria"];
  fotoUrl: string | null;
  datos: DatoFinal[];
  unidadesVendidas: number;
  stock: number;
};

/** Los datos que dice la ficha final, en el orden en que se leen. Siempre los mismos (no solo los que difieren): la ficha se
 *  lee entera; lo que difiere y se eligió de otra va marcado. El costo, solo si la cuenta lo ve. */
const DATOS_DE_LA_FICHA: (CampoFusion | "precio" | "costo")[] = ["categoria", "marca_proveedor", "precio", "costo", "tejido", "patron", "temporada"];

export function fichaFinal(
  plan: Pick<PlanFusion, "productos" | "diferencias">,
  quedaId: string,
  elecciones: Elecciones,
  fotosQueQuedan: string[],
): FichaFinal | null {
  const queda = plan.productos.find((p) => p.id === quedaId);
  if (!queda) return null;
  const elegibles = new Set(camposAElegir(plan.diferencias));
  const deDonde = (campo: CampoFusion | "precio" | "costo"): ProductoPlan => {
    if (!elegibles.has(campo)) return queda;
    const id =
      campo === "precio"
        ? fuenteDe(elecciones.precioDe, "precio", plan.diferencias, quedaId)
        : campo === "costo"
          ? fuenteDe(elecciones.costoDe, "costo", plan.diferencias, quedaId)
          : (elecciones.campos[campo] ?? quedaId);
    return plan.productos.find((p) => p.id === id) ?? queda;
  };
  const dato = (campo: CampoFusion | "precio" | "costo"): DatoFinal => {
    const de = deDonde(campo);
    return { campo, valor: valorDeCampo(de, campo), deOtra: de.id !== queda.id && valorDeCampo(de, campo) !== valorDeCampo(queda, campo) };
  };
  const fotos = plan.productos.flatMap((p) => p.fotos);
  const principal = fotos.find((f) => f.id === fotosQueQuedan[0]) ?? null;
  const nombre = deDonde("referencia");
  return {
    referencia: nombre.referencia,
    referenciaDeOtra: nombre.referencia !== queda.referencia,
    codigo: queda.codigo,
    categoria: deDonde("categoria").categoria,
    fotoUrl: principal?.url ?? null,
    datos: DATOS_DE_LA_FICHA.filter((c) => c !== "costo" || queda.costo !== null || elegibles.has("costo")).map(dato),
    unidadesVendidas: plan.productos.reduce((t, p) => t + p.unidadesVendidas, 0),
    stock: plan.productos.reduce((t, p) => t + p.stock, 0),
  };
}
