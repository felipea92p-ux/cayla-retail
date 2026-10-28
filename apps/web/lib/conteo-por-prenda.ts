// «Por prenda» en «Abrir un conteo» (Inventario ▸ Conteo, 2026-10-01). Sin React ni red.
//
// CONTRATO
//   PROMETE: dadas las prendas registradas en la sede, devuelve las del LUGAR que se va a contar (piso, almacén o toda la
//            ubicación) y las que coinciden con lo escrito, con las MISMAS reglas del buscador de Existencias
//            (`filtro-busqueda-especial.ts`: varias palabras en cualquier orden, sin tildes, color y talla reconocidos).
//   ASUME:   que la base cuenta una variante en un lugar cuando tiene stock allí: es la condición de la foto de `abrir_conteo`
//            (`having sum(cantidad) > 0` por sububicación). Una prenda sin stock en ese lugar no se ofrece: contarla sería un
//            hallazgo («apareció donde no estaba»), y eso ya se hace escaneando durante el conteo.
//   NO HACE: no habla de cantidades (el inicio solo dice «variantes», nunca cuántas unidades espera CAYLA) y no decide cómo se
//            guarda la elección: hoy viaja como `?variantes=` y acota la LISTA de contar (ADR-0241); el conteo que abre la base
//            sigue siendo el del lugar completo. Que «por prenda» sea un alcance de la base es una decisión pendiente (backlog).

import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial, type IndiceBusquedaEspecial } from "./filtro-busqueda-especial";
import type { FilaStock } from "./inventario-v2";

/** Una prenda (variante: modelo · color · talla) que se puede ofrecer para contar, sin cantidades. */
export type PrendaDelLugar = {
  varianteId: string;
  productoId: string;
  referencia: string;
  /** El código de la etiqueta (`variantes.codigo`, o el sku legado si falta): lo que se ve y lo que se escanea. */
  sku: string;
  codigosBarras: string[];
  color: string | null;
  colorHex: string | null;
  talla: string | null;
  categoria: string | null;
  /** Prefijo y familia de su categoría: de ahí sale el ícono de la prenda sin foto (`SinFoto`, 2026-10-04). Opcionales. */
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  fotoUrl: string | null;
  /** Dónde tiene stock (> 0). En una sede que no separa piso y almacén (el Taller) solo cuenta `enUbicacion`. */
  enPiso: boolean;
  enAlmacen: boolean;
  enUbicacion: boolean;
};

/** El lugar de un conteo, tal como se pregunta: el piso, el almacén, o toda la ubicación (la sede que no los separa). */
export type LugarDeConteo = "piso_venta" | "almacen_tienda" | "toda";

/**
 * Cuántas prendas caben en un conteo «por prenda». La elección viaja por la URL (`?variantes=id,id,…`, 37 caracteres cada una):
 * 100 son ~3,7 KB, lejos del tope de los navegadores. Para más de eso se cuenta una categoría o todo el lugar.
 */
export const MAX_PRENDAS_POR_CONTEO = 100;

/** Cuántos resultados se dibujan de golpe: unas decenas se leen; un modelo con muchos colores y tallas pide «Ver más». */
export const RESULTADOS_POR_PAGINA = 40;

/** Una fila de stock de la sede, reducida a lo que el buscador necesita (y a nada más: sin cantidades ni apartados). */
export function prendaDelLugarDesdeStock(f: FilaStock): PrendaDelLugar {
  return {
    varianteId: f.varianteId,
    productoId: f.productoId,
    referencia: f.referencia,
    sku: f.sku,
    codigosBarras: f.codigosBarras,
    color: f.color,
    colorHex: f.colorHex,
    talla: f.talla,
    categoria: f.categoria,
    categoriaPrefijo: f.categoriaPrefijo ?? null,
    categoriaFamilia: f.categoriaFamilia ?? null,
    fotoUrl: f.fotoUrl,
    enPiso: (f.piso ?? 0) > 0,
    enAlmacen: (f.almacen ?? 0) > 0,
    enUbicacion: f.total > 0,
  };
}

/** Las prendas con stock en el lugar que se va a contar. */
export function prendasDelLugar(prendas: readonly PrendaDelLugar[], lugar: LugarDeConteo): PrendaDelLugar[] {
  return prendas.filter((p) => (lugar === "piso_venta" ? p.enPiso : lugar === "almacen_tienda" ? p.enAlmacen : p.enUbicacion));
}

/** Prepara las prendas para buscarlas: se hace una vez por lista, no en cada tecla. */
export function indiceDePrendas(prendas: readonly PrendaDelLugar[]): IndiceBusquedaEspecial<PrendaDelLugar> {
  return crearIndiceBusquedaEspecial(prendas, (p) => ({
    nombre: p.referencia,
    sku: p.sku,
    codigosBarras: p.codigosBarras,
    color: p.color,
    talla: p.talla,
    categoria: p.categoria,
  }));
}

/**
 * Las prendas que coinciden con lo escrito, las que mejor coinciden primero y las tallas de un modelo juntas — como en
 * Existencias. Sin texto no se ofrece nada: una lista de cientos de variantes no ayuda a elegir una.
 */
export function buscarPrendas(indice: IndiceBusquedaEspecial<PrendaDelLugar>, consulta: string): PrendaDelLugar[] {
  if (consulta.trim() === "") return [];
  return filtrarConBusquedaEspecial(indice, consulta, {}, { ordenar: "relevancia", grupo: (p) => p.productoId }).filas;
}

/**
 * Suma `nuevas` a lo ya elegido, sin repetir y sin pasar del tope. `sobraron` cuenta las que no entraron por el tope: la pantalla
 * lo dice en vez de callarlo.
 */
export function sumarElegidas(actuales: readonly string[], nuevas: readonly string[], tope: number = MAX_PRENDAS_POR_CONTEO): { elegidas: string[]; sobraron: number } {
  const elegidas = [...actuales];
  const ya = new Set(elegidas);
  let sobraron = 0;
  for (const id of nuevas) {
    if (ya.has(id)) continue;
    if (elegidas.length >= tope) {
      sobraron++;
      continue;
    }
    ya.add(id);
    elegidas.push(id);
  }
  return { elegidas, sobraron };
}

/** Lo elegido que sigue siendo válido tras cambiar de lugar, y lo que ya no: una prenda del almacén no está en el piso. */
export function podarElegidas(elegidas: readonly string[], disponibles: ReadonlySet<string>): { quedan: string[]; quitadas: string[] } {
  const quedan: string[] = [];
  const quitadas: string[] = [];
  for (const id of elegidas) (disponibles.has(id) ? quedan : quitadas).push(id);
  return { quedan, quitadas };
}

/** «1 prenda» / «12 prendas». */
export function textoPrendas(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;
}

/** Cómo se nombra una prenda elegida en una ficha: «Blusa Aurora · Rosado · M». */
export function nombreDePrenda(p: Pick<PrendaDelLugar, "referencia" | "color" | "talla">): string {
  return [p.referencia, p.color, p.talla].filter(Boolean).join(" · ");
}
