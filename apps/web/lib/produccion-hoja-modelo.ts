// «Ver el modelo»: la hoja de un modelo del Resumen de Producción (tarea #8 del análisis docs/pantallas/produccion.md). Puro: sin Supabase ni React.
//
// CONTRATO
//   PROMETE: armar, para un modelo, lo que Felipe pidió ver junto a su foto: por color y talla, cuánto se vendió en los últimos `DIAS_RITMO_RECIENTE` días y
//            qué se vendió y ya no hay en tiendas, con totales por talla, por color y del modelo, y la foto de cada color cuando el catálogo la tiene. El stock
//            va como dato secundario (con ~1,2 unidades por variante casi no discrimina; lo que orienta es lo vendido).
//   ASUME:   las variantes que ya trae `FilaModelo` (talla, color, ventas netas de la red, stock en tiendas); un color o una talla que la variante no tiene
//            se dice «Sin color» / «Sin talla», nunca se inventa uno.
//   NO HACE: no ordena los colores por lo que vendieron (conteos, no rankings: con 2 ventas por celda un ranking es ruido, ADR-0346) ni decide qué
//            fabricar (eso es el estado del modelo y «Nueva orden»); no lee la base ni dibuja nada.

import type { FilaModelo } from "./produccion-decisiones";
import { sugerenciaDeOrden, urlTrasladarModelo } from "./produccion-decisiones";
import { DIAS_OBJETIVO_PRODUCCION } from "./produccion-decision-reglas";
import { compararTallas } from "./tallas";

export const SIN_TALLA = "Sin talla";
export const SIN_COLOR = "Sin color";

/** Un color del modelo tal como lo conoce el catálogo: su nombre, su hex (si lo tiene) y la foto de ese color (si la tiene). */
export type ColorParaHoja = { nombre: string; hex: string | null; fotoUrl: string | null };

/** Una talla y color: lo vendido en la ventana y lo que queda en tiendas. Si «se vendió y ya no hay» no se manda: sale de estas dos cifras (`seVendioYYaNoHay`), y no pesa en cada celda de cada modelo. */
export type CeldaDeHoja = { ventas: number; stock: number };

export type TotalDeHoja = { ventas: number; stock: number };

export type ColorDeHoja = ColorParaHoja & TotalDeHoja & {
  /** Una por talla de `HojaDeModelo.tallas`, en el mismo orden; `null` = ese color no se hace en esa talla. */
  celdas: (CeldaDeHoja | null)[];
};

/** Todo lo que la hoja de un modelo necesita: la fila del Resumen (sin sus variantes) y la matriz ya armada. */
export type HojaDeModelo = Omit<FilaModelo, "variantes"> & {
  /** En orden de curva (XS · S · M · L, 28 · 30); «Sin talla» al final. */
  tallas: string[];
  /** Por nombre, «Sin color» al final. */
  colores: ColorDeHoja[];
  porTalla: TotalDeHoja[];
  total: TotalDeHoja;
  /** A Mover mercadería con el Taller de origen y lo que se traslada puesto; `null` si no hay nada que trasladar o no se conoce el Taller. */
  hrefTrasladar: string | null;
  /** Hay una cantidad sugerida que decir (hay base y algo que fabricar): «Abrir orden sugerida» lleva la orden con la matriz ya llena; si no, «Abrir orden» la abre vacía. */
  sugerida: boolean;
};

const suma = (a: TotalDeHoja, c: CeldaDeHoja): TotalDeHoja => ({ ventas: a.ventas + c.ventas, stock: a.stock + c.stock });
const vacio = (): TotalDeHoja => ({ ventas: 0, stock: 0 });

/** Ordena etiquetas dejando `ultima` al final. */
function ordenar(etiquetas: Iterable<string>, ultima: string, comparar: (a: string, b: string) => number): string[] {
  return [...new Set(etiquetas)].sort((a, b) => (a === ultima ? 1 : b === ultima ? -1 : comparar(a, b)));
}

export function hojaDelModelo(fila: FilaModelo, coloresDelCatalogo: readonly ColorParaHoja[] = [], tallerId: string | null = null): HojaDeModelo {
  const { variantes, ...resto } = fila;
  const tallas = ordenar(variantes.map((v) => v.talla ?? SIN_TALLA), SIN_TALLA, compararTallas);
  const nombresDeColor = ordenar(variantes.map((v) => v.color ?? SIN_COLOR), SIN_COLOR, (a, b) => a.localeCompare(b, "es"));
  const delCatalogo = new Map(coloresDelCatalogo.map((c) => [c.nombre, c]));

  const porClave = new Map<string, CeldaDeHoja>();
  const hexDeLaVariante = new Map<string, string | null>();
  for (const v of variantes) {
    const color = v.color ?? SIN_COLOR;
    const clave = `${color}\u0000${v.talla ?? SIN_TALLA}`;
    const previa = porClave.get(clave);
    porClave.set(clave, { ventas: (previa?.ventas ?? 0) + v.ventasNetas, stock: (previa?.stock ?? 0) + v.stockRed });
    if (!hexDeLaVariante.has(color)) hexDeLaVariante.set(color, v.colorHex);
  }

  const colores: ColorDeHoja[] = nombresDeColor.map((nombre) => {
    const celdas = tallas.map((t) => porClave.get(`${nombre}\u0000${t}`) ?? null);
    const t = celdas.reduce<TotalDeHoja>((a, c) => (c ? suma(a, c) : a), vacio());
    const c = delCatalogo.get(nombre);
    return { nombre, hex: c?.hex ?? hexDeLaVariante.get(nombre) ?? null, fotoUrl: c?.fotoUrl ?? null, ...t, celdas };
  });
  const porTalla = tallas.map((_, i) => colores.reduce<TotalDeHoja>((a, c) => (c.celdas[i] ? suma(a, c.celdas[i]!) : a), vacio()));
  const total = porTalla.reduce<TotalDeHoja>((a, t) => ({ ventas: a.ventas + t.ventas, stock: a.stock + t.stock }), vacio());

  return { ...resto, tallas, colores, porTalla, total, hrefTrasladar: urlTrasladarModelo(fila, tallerId), sugerida: sugerenciaDeOrden(fila) !== null };
}

/**
 * Lo que falta para cubrir `dias` días de venta, dicho para quien decide: cuánto, qué parte ya está hecha en el Taller y qué parte hay que fabricar. `null` si no falta nada
 * (o no hay ritmo medido con qué decirlo). Es la misma cifra que sugiere «Nueva orden» (`repartirFalta`).
 */
export function fraseDeLaFalta(h: Pick<HojaDeModelo, "trasladar" | "producir" | "enProduccion">, dias: number = DIAS_OBJETIVO_PRODUCCION): string | null {
  const falta = h.trasladar + h.producir;
  if (falta <= 0) return null;
  const partes = [
    h.trasladar > 0 ? `${h.trasladar} ${h.trasladar === 1 ? "ya está en el Taller y se traslada" : "ya están en el Taller y se trasladan"}` : null,
    h.producir > 0 ? `${h.producir} ${h.producir === 1 ? "hay que fabricarla" : "hay que fabricarlas"}` : null,
  ].filter(Boolean);
  const cuentan = h.enProduccion === 0 ? "" : h.enProduccion === 1 ? " Ya cuenta 1 de una orden abierta." : ` Ya cuentan las ${h.enProduccion} de las órdenes abiertas.`;
  return `Para cubrir ${dias} días de venta ${falta === 1 ? "falta 1" : `faltan ${falta}`}: ${partes.join("; ")}.${cuentan}`;
}
