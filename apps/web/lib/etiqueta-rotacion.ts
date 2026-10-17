// La lectura de las etiquetas de Rotación (Nuevo, Top ventas, Últimas unidades, Para liquidar; actividad 6 de ADR-0441): cuántas
// unidades quedan de sus prendas y cuántas se vendieron en 30 días, en todas las tiendas, y qué parte de lo vendido salió sin
// registrar. Las cuatro dicen algo que el ERP ya mide (cuánto queda, cuánto se vende) y se marcan a mano: al lado de lo marcado, lo
// que dicen los datos, para que una persona decida. Sugerir (qué prendas deberían llevarla) es la actividad 8, con las reglas de Felipe.
//
// CONTRATO
//   PROMETE: suma, por talla y color, lo libre en piso y almacén y lo vendido en 30 días de cada tienda tal como lo cuenta Análisis
//            (`fn_analisis_sede`: sin lo cambiado ni lo devuelto, sin la prenda centinela); una prenda que la lectura no trae vale 0.
//   ASUME:   las filas llegan ya leídas (`getPrendasPorSede`); lo vendido sin registrar, contado aparte (`leerVendidoSinRegistrar`).
//   NO HACE: no lee la base ni decide qué prenda debería llevar la etiqueta; no inventa una cifra si no hay lectura.

/** Los días de ventas que cuenta la lectura: los mismos 30 de Análisis (`VENTANA_VENTAS`, `vendidas_30`). */
export const DIAS_ROTACION = 30;

export type RotacionTalla = { stock: number; vendidas: number };

/** Lo que viaja del servidor a la pantalla (serializable): `getLecturaRotacion` en `etiqueta-rotacion-datos.ts`. */
export type LecturaRotacion = {
  porTalla: Record<string, RotacionTalla>;
  /** Unidades vendidas en 30 días que dicen qué prenda fueron. */
  registradas: number;
  /** Las que salieron sin registrar en esos días; `null` si quien mira no ve todas las tiendas o no se pudo leer. */
  sinRegistrar: number | null;
};

/** Lo que trae `fn_analisis_sede` de cada talla, en cada tienda. */
type FilaDeSede = { varianteId: string; piso: number; almacen: number; vendidas30: number };

/** Suma las tiendas: una talla con unidades en Trujillo y en Lima queda con las de las dos. */
export function juntarTiendas(porSede: Record<string, readonly FilaDeSede[]>): Map<string, RotacionTalla> {
  const suma = new Map<string, RotacionTalla>();
  for (const filas of Object.values(porSede)) {
    for (const f of filas) {
      const antes = suma.get(f.varianteId) ?? { stock: 0, vendidas: 0 };
      suma.set(f.varianteId, { stock: antes.stock + Math.max(0, f.piso) + Math.max(0, f.almacen), vendidas: antes.vendidas + Math.max(0, f.vendidas30) });
    }
  }
  return suma;
}

export type RotacionEtiqueta = { tallas: number; unidades: number; vendidas: number; agotadas: number };

/** Lo de las prendas a la venta que lleva una etiqueta (a mano o por su categoría): cuántas unidades quedan, cuántas se vendieron y
 *  cuántas de sus tallas ya no tienen ninguna. */
export function rotacionDeEtiqueta(
  aLaVenta: readonly { id: string; categoriaId: string | null }[],
  categoriaIds: ReadonlySet<string>,
  manuales: ReadonlySet<string>,
  porTalla: ReadonlyMap<string, RotacionTalla>,
): RotacionEtiqueta {
  const r: RotacionEtiqueta = { tallas: 0, unidades: 0, vendidas: 0, agotadas: 0 };
  for (const p of aLaVenta) {
    if (!manuales.has(p.id) && !(p.categoriaId !== null && categoriaIds.has(p.categoriaId))) continue;
    const t = porTalla.get(p.id) ?? { stock: 0, vendidas: 0 };
    r.tallas++;
    r.unidades += t.stock;
    r.vendidas += t.vendidas;
    if (t.stock === 0) r.agotadas++;
  }
  return r;
}

const unidades = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;

/** La línea de la tarjeta, en unidades (lo que se decide en Rotación), no en tallas: «Quedan 1 unidad · 7 vendidas en 30 días · 3
 *  tallas agotadas». `null` sin prendas: la tarjeta ya dice «Sin prendas a la venta». */
export function textoRotacion(r: RotacionEtiqueta): string | null {
  if (r.tallas === 0) return null;
  const quedan = r.unidades === 0 ? "No queda ninguna unidad" : `${r.unidades === 1 ? "Queda" : "Quedan"} ${unidades(r.unidades)}`;
  const vendidas = r.vendidas === 0 ? `ninguna vendida en ${DIAS_ROTACION} días` : `${r.vendidas.toLocaleString("es-PE")} ${r.vendidas === 1 ? "vendida" : "vendidas"} en ${DIAS_ROTACION} días`;
  const agotadas = r.agotadas > 0 && r.unidades > 0 ? ` · ${r.agotadas} ${r.agotadas === 1 ? "talla agotada" : "tallas agotadas"}` : "";
  return `${quedan} · ${vendidas}${agotadas}`;
}

/** La nota sobre las tarjetas de Rotación: con cuántos datos se juzga. Si 6 de cada 10 prendas vendidas salieron sin decir cuál
 *  fueron (producción, 2026-10-17), «Top ventas» y «Para liquidar» miran solo una parte; hay que decirlo. `null` si todo lo vendido
 *  dice qué prenda fue, o si no se pudo saber (`sinRegistrar` null). */
export function notaSinRegistrar(registradas: number, sinRegistrar: number | null): string | null {
  if (sinRegistrar === null || sinRegistrar <= 0) return null;
  const total = registradas + sinRegistrar;
  return `En ${DIAS_ROTACION} días se vendieron ${unidades(total)} y ${sinRegistrar.toLocaleString("es-PE")} salieron sin registrar qué prenda eran: las cifras de abajo solo ven ${registradas === 1 ? "la registrada" : `las ${registradas.toLocaleString("es-PE")} registradas`}.`;
}
