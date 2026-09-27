// Lo que se deriva de lo que la colaboradora elige en el paso «Reemplazo» de Cambios — puro, sin React ni
// `createClient`, para poder probarlo solo (`cambio-reemplazo-reglas.test.ts`). Vivía dentro de
// `components/CambioReemplazo.tsx`, que es cliente y trae imports con `@/` que las pruebas no resuelven: lo
// que decía «apartada» o «no queda» ahí no tenía forma de probarse. El componente solo dibuja lo que sale de aquí.

import type { OpcionCombo } from "@/components/ui/ComboBuscable";
import type { LineaVentaReciente } from "./ventas-v2";
import { condicionForzada, unidadesDisponibles, varianteLegible, type CondicionCambio, type MetodoDiferencia, type MotivoCambio } from "./cambios-reglas";
import { compararTallas } from "./tallas";
import { textoOtrasSedes, type SedeConStock } from "./stock-por-sede";
import { sinStockPorApartado, textoSinStock } from "./vender-reglas";

export type VarianteCatalogo = {
  varianteId: string;
  productoId: string;
  sku: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number;
  /** Piso de ESTA sede: lo único que `registrar_cambio` deja entregar. */
  stockAqui: number;
  /** Lo apartado para clientas en ese mismo piso: con `stockAqui` en 0, es «apartada para una clienta» y no «no queda». */
  apartadoAqui: number;
  /** Dónde más hay — «no queda L aquí, pero hay 2 en Trujillo». */
  stockOtrasSedes: SedeConStock[];
};

/** Lo que la colaboradora va eligiendo en el paso "Reemplazo". Nada viene elegido a
 *  ciegas (ADR-0044): solo la PRENDA arranca en la que compró — la mayoría de cambios
 *  son "la misma, otra talla o color". El método arranca en efectivo como siempre: si
 *  debe arrancar vacío es parte de la decisión de dinero pendiente (no se tocó). */
export type Seleccion = {
  motivo: MotivoCambio | null;
  productoId: string;
  talla: string | null;
  color: string | null;
  condicionElegida: CondicionCambio;
  cantidad: number;
  metodo: MetodoDiferencia;
};

export function seleccionInicial(linea: LineaVentaReciente): Seleccion {
  return {
    motivo: null,
    productoId: linea.productoId,
    talla: null,
    color: null,
    condicionElegida: "vendible",
    cantidad: Math.min(1, unidadesDisponibles(linea)),
    metodo: "efectivo",
  };
}

export function agruparCatalogo(catalogo: readonly VarianteCatalogo[]): Map<string, VarianteCatalogo[]> {
  const mapa = new Map<string, VarianteCatalogo[]>();
  for (const v of catalogo) {
    const lista = mapa.get(v.productoId) ?? [];
    lista.push(v);
    mapa.set(v.productoId, lista);
  }
  return mapa;
}

/** La que compró va primero y siempre (aunque hoy no quede ninguna aquí: así se ve
 *  dónde más hay); de las demás, solo las que tienen algo que entregar en esta sede. */
export function opcionesDePrenda(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>): OpcionCombo<string>[] {
  const otras = [...porProducto.entries()]
    .filter(([id, vs]) => id !== linea.productoId && vs.some((v) => v.stockAqui > 0))
    .map(([id, vs]) => ({ valor: id, texto: vs[0]!.referencia, detalle: `desde S/ ${Math.min(...vs.map((v) => v.precio)).toFixed(2)}` }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  return [{ valor: linea.productoId, texto: linea.referencia, detalle: "la que compró" }, ...otras];
}

/** Todo lo que se deriva de la selección, calculado UNA vez: el formulario, la
 *  comparación, las validaciones y la confirmación leen lo mismo. */
export function derivarReemplazo(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>, s: Seleccion) {
  const variantes = porProducto.get(s.productoId) ?? [];
  const tallas = [...new Set(variantes.map((v) => v.talla).filter((t): t is string => t !== null))].sort(compararTallas);
  const colores = [...new Map(variantes.filter((v) => v.color).map((v) => [v.color!, v.colorHex])).entries()];
  // Con una sola opción no hay decisión que tomar: se completa sola.
  const tallaEfectiva = s.talla ?? (tallas.length === 1 ? tallas[0]! : null);
  const colorEfectivo = s.color ?? (colores.length === 1 ? colores[0]![0] : null);
  const eligioTodo = (tallas.length === 0 || tallaEfectiva !== null) && (colores.length === 0 || colorEfectivo !== null);
  const varianteNueva = eligioTodo
    ? (variantes.find((v) => (tallas.length === 0 || v.talla === tallaEfectiva) && (colores.length === 0 || v.color === colorEfectivo)) ?? null)
    : null;
  const condicionFija = condicionForzada(s.motivo);
  // Cómo se nombra lo que se lleva en los avisos y en la validación: «Negro · Talla L». Una prenda sin talla ni color
  // (un accesorio) se nombra por su referencia — sin ese respaldo el aviso quedaba « está apartada…», sin sujeto. Es la
  // del producto ELEGIDO (`variantes`, todas comparten referencia), no la de la línea: puede haber elegido otra prenda.
  const descripcionNueva = varianteLegible({ talla: tallaEfectiva, color: colorEfectivo }) || (variantes[0]?.referencia ?? linea.referencia);
  const otrasSedes = varianteNueva ? textoOtrasSedes(varianteNueva.stockOtrasSedes) : null;
  // «apartada para una clienta» si la prenda elegida no se entrega porque lo que queda en el piso es de otra; si no, null.
  const textoApartada = varianteNueva !== null && sinStockPorApartado(varianteNueva) ? textoSinStock(varianteNueva) : null;
  return {
    esLaMisma: s.productoId === linea.productoId,
    tallas,
    colores,
    tallaEfectiva,
    colorEfectivo,
    hayAqui: (t: string | null, c: string | null) =>
      variantes.some((v) => (t === null || v.talla === t) && (c === null || v.color === c) && v.stockAqui > 0),
    /** Cuántas hay en el piso de esta sede de esa talla y color (para decirlo bajo cada talla). */
    stockAqui: (t: string | null, c: string | null) =>
      variantes.filter((v) => (t === null || v.talla === t) && (c === null || v.color === c)).reduce((suma, v) => suma + Math.max(0, v.stockAqui), 0),
    /** Lo que se dice de una talla y color sin nada libre en el piso (se llama cuando `hayAqui` es falso):
     *  «apartada para una clienta» si lo que queda está apartado, y si no, «no queda aquí». Con talla o color sin fijar
     *  suma lo apartado de todas las que cubre. */
    sinStockTexto: (t: string | null, c: string | null) =>
      textoSinStock(
        {
          stockAqui: 0,
          apartadoAqui: variantes
            .filter((v) => (t === null || v.talla === t) && (c === null || v.color === c))
            .reduce((suma, v) => suma + Math.max(0, v.apartadoAqui), 0),
        },
        "no queda aquí",
      ),
    eligioTodo,
    varianteNueva,
    sinStockAqui: varianteNueva !== null && varianteNueva.stockAqui <= 0,
    descripcionNueva,
    otrasSedes,
    /** El aviso bajo la elección cuando la prenda elegida no se puede entregar aquí, o null si sí. Apartada y agotada
     *  cierran igual: dónde más hay, o que no hay en otra sede (lo mismo que dice `validarCambio`). */
    avisoSinStock:
      varianteNueva === null || varianteNueva.stockAqui > 0
        ? null
        : textoApartada
          ? `${descripcionNueva} está ${textoApartada}: no se entrega desde aquí. ${otrasSedes ? `Hay ${otrasSedes}.` : "No hay en otra sede."}`
          : `No queda ${descripcionNueva} aquí${otrasSedes ? ` — hay ${otrasSedes}.` : ", ni en otra sede."}`,
    // Sin prenda nueva elegida no hay diferencia que cobrar (y la caja no se mira).
    diferencia: varianteNueva ? (varianteNueva.precio - linea.precioUnitario) * s.cantidad : 0,
    condicionFija,
    condicion: condicionFija ?? s.condicionElegida,
  };
}

export type Reemplazo = ReturnType<typeof derivarReemplazo>;
