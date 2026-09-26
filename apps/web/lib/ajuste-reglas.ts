// Armado de las filas del modal «Ajustar inventario» (AjustarInventarioModal.tsx),
// sin nada de servidor ni de React: lo importan el componente cliente y las pruebas.
//
// Contrato — PROMETE: una fila por variante, con la talla ya como texto («M», «32»),
// puestas en el orden en que se cuenta una curva (S · M · L, 28 · 30 · 32) y con el stock
// de la sede partido en piso y almacén. ASUME: `filas` son las variantes de UN producto
// con el stock ya acotado a UNA sede (el modal se lo pide así a la base).
//
// Por qué vive aparte del componente: `FilaAjuste` es la forma que el select del modal
// tiene que cumplir, y esa comprobación solo la hace el compilador si el resultado de la
// consulta se pasa SIN castear. El modal se rompió sin que nada avisara cuando dejó de
// existir `variantes.talla` (20260917100500, ADR-0095) justamente porque un
// `as unknown as` le tapaba el error a `tsc`: el select seguía pidiendo una columna que
// ya no estaba y solo lo supo la base, en vivo.

import { compararTallas } from "./tallas";

/** Lo mínimo que el modal lee de cada variante. La talla llega anidada porque la columna
 *  de texto ya no existe: hoy es `talla_id` → `tallas.valor` (select `talla:tallas ( valor )`). */
export type FilaAjuste = {
  id: string;
  sku: string | null;
  talla: { valor: string } | null;
  color: { nombre: string | null } | null;
  stock: { cantidad: number; sububicacion_id: string | null }[] | null;
};

export type VarianteAjuste = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  stockPiso: number;
  stockAlmacen: number;
  /** Suma de todas las sububicaciones: es el stock que se ve en una sede que no separa piso de almacén. */
  stockSinDividir: number;
};

// Una variante sin talla va al final: en pantalla se rotula «Única», y `compararTallas`
// ya manda «Única» al final — así «qué se ve» y «dónde queda» no se contradicen.
function compararTallaOpcional(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compararTallas(a, b);
}

export function armarVariantesAjuste(
  filas: FilaAjuste[],
  sububicacionPisoId: string | undefined,
  sububicacionAlmacenId: string | undefined
): VarianteAjuste[] {
  return filas
    .map((v): VarianteAjuste => {
      const porSub = v.stock ?? [];
      return {
        varianteId: v.id,
        sku: v.sku ?? "",
        talla: v.talla?.valor ?? null,
        color: v.color?.nombre ?? null,
        stockPiso: porSub.find((s) => s.sububicacion_id === sububicacionPisoId)?.cantidad ?? 0,
        stockAlmacen: porSub.find((s) => s.sububicacion_id === sububicacionAlmacenId)?.cantidad ?? 0,
        stockSinDividir: porSub.reduce((acc, s) => acc + s.cantidad, 0),
      };
    })
    // `sort` es estable: dentro de una misma talla queda el orden en que llegaron (por SKU,
    // lo pide el modal a la base), así que la lista no cambia de un refresco al siguiente.
    .sort((a, b) => compararTallaOpcional(a.talla, b.talla));
}

// Motivos del ajuste. «Reposición» no se ofrece en el PISO de una tienda que separa piso y almacén: lo que sube del
// almacén se baja (Bajar al piso / Reponer, en Existencias) para que salga del almacén y el reloj de piso de Frescura tenga
// hora de colgado. La base lo rechaza igual (20260926000400, hint reposicion_piso_cerrada); aquí solo se evita el viaje.
export const MOTIVOS_AJUSTE = [
  { valor: "reposicion", texto: "Reposición" },
  { valor: "merma", texto: "Merma" },
  { valor: "conteo_fisico", texto: "Conteo físico" },
  { valor: "otro", texto: "Otro" },
] as const;

export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number]["valor"];

export function reposicionCerrada(ubicado: "piso" | "almacen", separaPisoAlmacen: boolean): boolean {
  return separaPisoAlmacen && ubicado === "piso";
}

export function motivosAjusteDisponibles(
  ubicado: "piso" | "almacen",
  separaPisoAlmacen: boolean
): readonly (typeof MOTIVOS_AJUSTE)[number][] {
  return reposicionCerrada(ubicado, separaPisoAlmacen) ? MOTIVOS_AJUSTE.filter((m) => m.valor !== "reposicion") : MOTIVOS_AJUSTE;
}

export const NOTA_REPOSICION_CERRADA =
  "Para subir prendas del almacén al piso usa «Bajar al piso» o «Reponer», en Existencias: así salen del almacén. Si ninguno te aparece para esta prenda, pídele al líder que active «Bajada al piso» en tu rol. Si al contar encontraste prendas de más en el piso, elige «Conteo físico».";
