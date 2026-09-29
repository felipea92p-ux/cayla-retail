// Registro de pantallas del Responsive Quality Gate — ver `responsive/README.md`, sección
// «Cómo registrar una pantalla».
//
// Importa a mano cada archivo de pantalla (nada de escanear el filesystem: así un error de
// sintaxis en una pantalla nueva se ve al importar, no a mitad de una corrida) y arma el mapa
// id → pantalla y módulo → ids que usa el CLI para resolver `pnpm responsive:check <lo que sea>`.

/**
 * @typedef {object} Escenario
 * @property {string} id
 * @property {string} nombre
 * @property {(pagina: import('playwright').Page, ctx: { viewport: {id:string,w:number,h:number}, pantalla: Pantalla, escenario: Escenario }) => Promise<void>} [preparar]
 * @property {string[]} [elementosClave]   selectores extra a inspeccionar, solo en este escenario
 * @property {string[]} [exclusiones]      selectores a ignorar, solo en este escenario
 * @property {string} [ambito]             selector que acota QUÉ subárbol se inspecciona
 * @property {string} [limite]             selector cuyo rect reemplaza al viewport como límite
 */

/**
 * @typedef {object} Pantalla
 * @property {string} id             único, `modulo.pantalla` (p.ej. "inventario.existencias")
 * @property {string} nombre         para el reporte
 * @property {string} modulo         agrupa pantallas (ver MODULOS más abajo)
 * @property {string} ruta           ruta de Next.js, sin baseURL (p.ej. "/inventario")
 * @property {unknown} [viewports]   ver `resolverViewports` en matriz-viewports.mjs — por defecto, la matriz completa
 * @property {Escenario[]} [escenarios] por defecto, un único escenario "inicial" sin interacción
 * @property {string[]} [elementosClave] selectores extra en TODOS los escenarios de esta pantalla
 * @property {string[]} [exclusiones]    selectores a ignorar en TODOS los escenarios de esta pantalla
 * @property {string} [ambito]
 * @property {string} [limite]
 */

import pantallaConteo from "./inventario.conteo.mjs";
import pantallaExistencias from "./inventario.existencias.mjs";
import pantallaTraslados from "./inventario.traslados.mjs";
import pantallaVender from "./vender.mjs";

/** @type {Pantalla[]} */
export const TODAS_LAS_PANTALLAS = [pantallaExistencias, pantallaTraslados, pantallaConteo, pantallaVender];

export const PANTALLAS_POR_ID = new Map(TODAS_LAS_PANTALLAS.map((p) => [p.id, p]));

/** módulo → ids de pantalla que lo componen, en el orden en que se registraron. */
export const MODULOS = TODAS_LAS_PANTALLAS.reduce((mapa, p) => {
  if (!mapa.has(p.modulo)) mapa.set(p.modulo, []);
  mapa.get(p.modulo).push(p.id);
  return mapa;
}, new Map());

/**
 * Resuelve la selección del CLI a una lista de pantallas a correr.
 * @param {{ ids?: string[], modulo?: string, todas?: boolean }} seleccion
 * @returns {Pantalla[]}
 */
export function resolverSeleccion({ ids, modulo, todas }) {
  if (todas) return TODAS_LAS_PANTALLAS;

  if (modulo) {
    const idsDelModulo = MODULOS.get(modulo);
    if (!idsDelModulo) {
      throw new Error(`responsive: no existe el módulo "${modulo}". Módulos registrados: ${[...MODULOS.keys()].join(", ")}`);
    }
    return idsDelModulo.map((id) => PANTALLAS_POR_ID.get(id));
  }

  if (!ids || !ids.length) {
    throw new Error("responsive: no diste ninguna pantalla, módulo (--module) ni 'all'. Ver responsive/README.md.");
  }
  return ids.map((id) => {
    const pantalla = PANTALLAS_POR_ID.get(id) ?? buscarPorNombreCorto(id);
    if (!pantalla) {
      throw new Error(`responsive: no existe la pantalla "${id}". Pantallas registradas: ${[...PANTALLAS_POR_ID.keys()].join(", ")}`);
    }
    return pantalla;
  });
}

/** Permite pedir "existencias" en vez del id completo "inventario.existencias" cuando no hay ambigüedad. */
function buscarPorNombreCorto(nombreCorto) {
  const candidatos = TODAS_LAS_PANTALLAS.filter((p) => p.id.endsWith(`.${nombreCorto}`) || p.id === nombreCorto);
  return candidatos.length === 1 ? candidatos[0] : undefined;
}
