// Corregir un gasto de Finanzas sin anularlo (ADR-0588, `20261031151000_gastos_corregir_categoria_y_que_fue.sql`): solo su categoría y su «qué fue»,
// que no mueven plata. Lo puro de la hoja: qué cambia, qué falta, cómo se dice el botón y el rastro. La base vuelve a exigir todo (`corregir_gasto`).
import type { CambioHecho } from "./corregir-compra-reglas";
import { MAX_DESCRIPCION_GASTO } from "./finanzas-topes";
import type { CategoriaGasto, GastoFila } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";

export const RPC_CORREGIR_GASTO_FINANZAS = "corregir_gasto";
export const RPC_CORRECCIONES_DE_GASTO = "fn_correcciones_de_gasto";

/** Las categorías del viaje de compra no se eligen ni se corrigen aquí: su IGV vive sin comprobante y se corrigen en Compras. */
const DEL_VIAJE: readonly string[] = ["traer_mercaderia", "viaje_compra"];

/** Por qué este gasto no se corrige desde Gastos, o `null` si sí. Lo demás (mes cerrado, rendición, comisión) lo dice la base al guardar. */
export function porQueNoSeCorrige(g: Pick<GastoFila, "estado" | "categoria">): string | null {
  if (g.estado === "anulado") return "Está anulado: ya no se corrige.";
  if (DEL_VIAJE.includes(g.categoria)) return "Es un gasto del viaje de compra: se corrige en Compras.";
  return null;
}

/** Las categorías que se pueden elegir al corregir: todas las de la lista menos las del viaje. */
export function categoriasParaCorregir(categorias: readonly CategoriaGasto[]): CategoriaGasto[] {
  return categorias.filter((c) => !DEL_VIAJE.includes(c.codigo));
}

export type BorradorCorreccion = { categoria: string; descripcion: string };

export function borradorDe(g: Pick<GastoFila, "categoria" | "descripcion">): BorradorCorreccion {
  return { categoria: g.categoria, descripcion: g.descripcion };
}

/** Lo que falta para poder guardar (las mismas reglas que la base), o `null`. */
export function problemaDeLaCorreccion(b: BorradorCorreccion): string | null {
  if (!b.categoria) return "Elige la categoría.";
  const d = b.descripcion.trim();
  if (!d) return "Escribe qué se pagó.";
  if (d.length > MAX_DESCRIPCION_GASTO) return `Qué se pagó cabe en ${MAX_DESCRIPCION_GASTO} letras.`;
  return null;
}

export type CambioDeCorreccion = { campo: "categoria" | "descripcion"; antes: string; despues: string };

/** Lo que cambia, en el orden de la hoja (antes → ahora). La categoría va por su nombre; espacios de más no cuentan como cambio. */
export function cambiosDeLaCorreccion(
  g: Pick<GastoFila, "categoria" | "categoriaNombre" | "descripcion">,
  b: BorradorCorreccion,
  categorias: readonly CategoriaGasto[],
): CambioDeCorreccion[] {
  const cambios: CambioDeCorreccion[] = [];
  if (b.categoria && b.categoria !== g.categoria) {
    cambios.push({ campo: "categoria", antes: g.categoriaNombre, despues: categorias.find((c) => c.codigo === b.categoria)?.nombre ?? b.categoria });
  }
  const d = b.descripcion.trim();
  if (d && d !== g.descripcion.trim()) cambios.push({ campo: "descripcion", antes: g.descripcion, despues: d });
  return cambios;
}

/** «Guardar 1 cambio» / «Guardar 2 cambios»; sin cambios, «Guardar» (y el botón se apaga). */
export function textoGuardarCorreccion(n: number): string {
  if (n <= 0) return "Guardar";
  return `Guardar ${n} ${n === 1 ? "cambio" : "cambios"}`;
}

const NOMBRE_DEL_DATO: Record<string, string> = { categoria: "En qué", descripcion: "Qué fue" };

/** Un cambio en una frase, para la hoja y para el rastro: «En qué: Limpieza → Bolsas y empaque». */
export function textoDeCambioDeGasto(c: Pick<CambioHecho, "campo" | "antes" | "despues">): string {
  return `${NOMBRE_DEL_DATO[c.campo] ?? c.campo}: ${c.antes ?? "nada"} → ${c.despues ?? "nada"}`;
}

/** Lo que dice el aviso al guardar: dónde cuenta ahora si cambió la categoría. */
export function detalleDelGuardado(cambios: readonly CambioDeCorreccion[]): string | undefined {
  const cat = cambios.find((c) => c.campo === "categoria");
  return cat ? `Ahora cuenta en «${cat.despues}».` : undefined;
}

/**
 * La guía de foco de la hoja (ADR-0284): los dos datos vienen llenos del gasto, así que lo que de verdad falta es CAMBIAR algo (es lo que apaga
 * «Guardar»), y el responsable. Sale de lo mismo que bloquea guardar: `problemaDeLaCorreccion` y `cambiosDeLaCorreccion`.
 */
export function camposDeLaCorreccion(
  b: BorradorCorreccion,
  cambios: readonly CambioDeCorreccion[],
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const d = b.descripcion.trim();
  return [
    { id: "categoria", nombre: "En qué", requerido: true, hecho: Boolean(b.categoria), pendiente: "Elige en qué se gastó." },
    {
      id: "descripcion",
      nombre: "Qué fue",
      requerido: true,
      hecho: Boolean(d) && d.length <= MAX_DESCRIPCION_GASTO,
      pendiente: d ? `Qué se pagó cabe en ${MAX_DESCRIPCION_GASTO} letras.` : "Escribe qué se pagó.",
    },
    { id: "cambio", nombre: "Un cambio", requerido: true, hecho: cambios.length > 0, pendiente: "Cambia la categoría o qué fue." },
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién corrige." },
  ];
}
