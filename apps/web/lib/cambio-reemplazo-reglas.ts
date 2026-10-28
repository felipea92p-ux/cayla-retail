// Lo que se deriva de lo que la colaboradora elige en el paso «Reemplazo» de Cambios — puro, sin React ni
// `createClient`, para poder probarlo solo (`cambio-reemplazo-reglas.test.ts`). Vivía dentro de
// `components/CambioReemplazo.tsx`, que es cliente y trae imports con `@/` que las pruebas no resuelven: lo
// que decía «apartada» o «no queda» ahí no tenía forma de probarse. El componente solo dibuja lo que sale de aquí.

import type { OpcionCombo } from "@/components/ui/ComboBuscable";
import type { LineaVentaReciente } from "./ventas-v2";
import { condicionForzada, unidadesDisponibles, varianteLegible, type CondicionCambio, type MetodoDiferencia, type MotivoCambio, type Validacion } from "./cambios-reglas";
import { resolverCodigoV2 } from "./buscar-prenda-v2";
import { compararTallas } from "./tallas";
import { soles } from "./compras-reglas";
import { valorPagado } from "./devoluciones-reglas";
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
  /** El precio en ESTA tienda (su precio propio, si tiene; si no, el de la prenda). */
  precio: number;
  /** El precio de la prenda (`variantes.precio`) y los precios propios de cada tienda (ubicación → precio): con ellos, un cambio de
   *  talla o color de la misma prenda se cobra al precio de la tienda donde se compró (Felipe 2026-10-10). Sin ellos, `precio`. */
  precioPrenda?: number;
  preciosPorTienda?: Readonly<Record<string, number>>;
  /** Piso de ESTA sede: lo único que `registrar_cambio` deja entregar. */
  stockAqui: number;
  /** Lo apartado para clientas en ese mismo piso: con `stockAqui` en 0, es «apartada para un cliente» y no «no queda». */
  apartadoAqui: number;
  /** Dónde más hay — «no queda L aquí, pero hay 2 en Trujillo». */
  stockOtrasSedes: SedeConStock[];
  /** Los códigos de etiqueta y de fábrica: lo que lee la pistola o la cámara para elegir la prenda sin buscarla. */
  codigosBarras: string[];
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
  /** Las OTRAS prendas que se lleva en el mismo cambio (ADR-0470). Opcional: un cambio armado antes de existir esto, y guardado por
   *  `TrabajoPorSede`, no lo trae; se lee con `extrasDe`. */
  extras?: PrendaExtra[];
};

/** Una prenda MÁS que se lleva la clienta en el mismo cambio: devuelve una y se lleva varias (el body de S/ 45.90 por dos Top Rib).
 *  Cada una se elige como la primera (prenda, talla y color) y trae su propia cantidad. */
export type PrendaExtra = { id: string; productoId: string; talla: string | null; color: string | null; cantidad: number };

/** La base acepta hasta 10 prendas distintas en un cambio (`registrar_cambio_varias`); la primera cuenta como una. */
export const MAX_PRENDAS_EXTRA = 9;

export function extrasDe(s: Pick<Seleccion, "extras">): readonly PrendaExtra[] {
  return s.extras ?? [];
}

/** Una prenda extra recién agregada: nada elegido a ciegas (ADR-0044), una unidad. */
export function prendaExtraNueva(id: string): PrendaExtra {
  return { id, productoId: "", talla: null, color: null, cantidad: 1 };
}

export function seleccionInicial(linea: LineaVentaReciente): Seleccion {
  return {
    motivo: null,
    productoId: linea.productoId,
    talla: null,
    color: null,
    condicionElegida: "vendible",
    cantidad: Math.min(1, unidadesDisponibles(linea)),
    metodo: "efectivo",
    extras: [],
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
 *  dónde más hay); de las demás, solo las que tienen algo que entregar en esta sede, y la ELEGIDA aunque no tenga
 *  (`elegidoId`): una prenda escaneada sin stock aquí tiene que verse en el campo, con su aviso de dónde más hay. */
export function opcionesDePrenda(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>, elegidoId?: string): OpcionCombo<string>[] {
  const otras = [...porProducto.entries()]
    .filter(([id, vs]) => id !== linea.productoId && (id === elegidoId || vs.some((v) => v.stockAqui > 0)))
    .map(([id, vs]) => ({ valor: id, texto: vs[0]!.referencia, detalle: `desde S/\u00a0${Math.min(...vs.map((v) => v.precio)).toFixed(2)}` }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  return [{ valor: linea.productoId, texto: linea.referencia, detalle: "la que compró" }, ...otras];
}

/** Lo que hace una LECTURA (pistola o cámara) en el paso «Reemplazo» (Felipe 2026-10-09: «que se escanee y se seleccione
 *  automáticamente»): la etiqueta dice la prenda exacta, así que deja elegidas la prenda, la talla y el color de una vez.
 *  Mismo reconocimiento que Vender (`resolverCodigoV2`: código de etiqueta o de fábrica, exacto o nada). No decide si se
 *  puede entregar: si no queda en el piso, el paso lo dice igual que si se hubiera elegido a mano (`avisoSinStock`). */
export type LecturaReemplazo =
  | { tipo: "elegida"; cambio: Pick<Seleccion, "productoId" | "talla" | "color">; variante: VarianteCatalogo }
  | { tipo: "no-encontrada"; codigo: string };

export function seleccionDesdeLectura(codigo: string, catalogo: readonly VarianteCatalogo[]): LecturaReemplazo {
  const v = resolverCodigoV2(codigo, catalogo.slice());
  if (!v) return { tipo: "no-encontrada", codigo: codigo.trim() };
  return { tipo: "elegida", cambio: { productoId: v.productoId, talla: v.talla, color: v.color }, variante: v };
}

/**
 * Lo mismo que `fn_precio_para_cambio` en la base (Felipe 2026-10-10, «vale lo que pagó»): la MISMA prenda en otra talla o color se
 * cobra al precio de la tienda donde se compró —comprada en TRU a 69.90 y cambiada de talla en Lima (79.90), no se cobran S/ 10—; otra
 * prenda es una venta nueva aquí: al precio de esta tienda.
 */
export function precioParaCambio(linea: Pick<LineaVentaReciente, "productoId" | "ubicacionVentaId">, v: VarianteCatalogo): number {
  if (v.productoId !== linea.productoId || !linea.ubicacionVentaId) return v.precio;
  return v.preciosPorTienda?.[linea.ubicacionVentaId] ?? v.precioPrenda ?? v.precio;
}

/**
 * Lo que la clienta pagó por UNA unidad de la prenda que devuelve: el precio menos su descuento (la campaña, el club, lo que fuera).
 * Es contra esto —no contra el precio de lista— que se mide la diferencia del cambio (`registrar_cambio`, ADR-0380): pagó S/ 80 por
 * una polera de S/ 100 con campaña y la cambia por otra de S/ 100 → S/ 20 a cobrar. La misma cuenta que el tope de reembolso de
 * Devoluciones (`valorPagado`); no se repite aquí.
 */
export function pagadoPorUnidad(linea: Pick<LineaVentaReciente, "precioUnitario" | "descuentoUnitario">): number {
  return valorPagado(linea, 1);
}

/** «Pagó con S/ 20.00 de descuento (lista S/ 100.00)», o null si la línea no tuvo descuento: la explicación de por qué se compara con
 *  menos que el precio de la etiqueta. */
export function textoPagoConDescuento(linea: Pick<LineaVentaReciente, "precioUnitario" | "descuentoUnitario">): string | null {
  if (!(linea.descuentoUnitario > 0)) return null;
  return `Pagó con ${soles(linea.descuentoUnitario)} de descuento (lista ${soles(linea.precioUnitario)})`;
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
  // «apartada para un cliente» si la prenda elegida no se entrega porque lo que queda en el piso es de otra; si no, null.
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
     *  «apartada para un cliente» si lo que queda está apartado, y si no, «no queda aquí». Con talla o color sin fijar
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
    /** El precio al que se lleva la prenda nueva (`precioParaCambio`): el que se muestra y el de la diferencia. */
    precioNueva: varianteNueva ? precioParaCambio(linea, varianteNueva) : null,
    /** Lo que pagó por cada unidad que devuelve (precio − descuento): lo que se muestra como «precio» de la prenda devuelta. */
    pagadoUnitario: pagadoPorUnidad(linea),
    // Sin prenda nueva elegida no hay diferencia que cobrar (y la caja no se mira). Lo mismo que calcula `registrar_cambio`: la
    // prenda nueva a su precio contra lo que la clienta PAGÓ por la devuelta (ADR-0380), redondeada al céntimo como la base.
    diferencia: varianteNueva ? Math.round((precioParaCambio(linea, varianteNueva) * s.cantidad - valorPagado(linea, s.cantidad)) * 100) / 100 : 0,
    condicionFija,
    condicion: condicionFija ?? s.condicionElegida,
  };
}

export type Reemplazo = ReturnType<typeof derivarReemplazo>;

// ============================================================================
// Una prenda por VARIAS (ADR-0470). Todo lo de abajo es puro: la pantalla solo dibuja lo que sale de aquí, y la base
// (`registrar_cambio_varias`) vuelve a calcular lo mismo antes de guardar.
// ============================================================================

/** Las prendas del catálogo que se ofrecen como OTRA prenda más: las que tienen algo que entregar en esta sede, y la ya elegida aunque no
 *  tenga (para verla en el campo con su aviso). A diferencia de `opcionesDePrenda`, ninguna es «la que compró»: aquí todas valen igual. */
export function opcionesDeOtraPrenda(porProducto: Map<string, VarianteCatalogo[]>, elegidoId?: string): OpcionCombo<string>[] {
  return [...porProducto.entries()]
    .filter(([id, vs]) => id === elegidoId || vs.some((v) => v.stockAqui > 0))
    .map(([id, vs]) => ({ valor: id, texto: vs[0]!.referencia, detalle: `desde S/\u00a0${Math.min(...vs.map((v) => v.precio)).toFixed(2)}` }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
}

/** Lo que se deriva de UNA prenda extra: lo mismo que de la primera (tallas, colores, stock, aviso, precio), contra la misma línea comprada. */
export function derivarExtra(linea: LineaVentaReciente, porProducto: Map<string, VarianteCatalogo[]>, s: Seleccion, extra: PrendaExtra): Reemplazo {
  return derivarReemplazo(linea, porProducto, { ...s, productoId: extra.productoId, talla: extra.talla, color: extra.color, cantidad: extra.cantidad });
}

/** Una prenda que se lleva, ya resuelta a una variante del catálogo: con su cantidad y el precio con que se calcula la diferencia. */
export type SalidaDelCambio = { variante: VarianteCatalogo; cantidad: number; precio: number };

const aCentimos = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que se lleva la clienta y lo que cuesta, calculado UNA vez para el paso «Reemplazo», la confirmación y el guardado: la diferencia es el
 * valor de TODO lo que se lleva (cada prenda a su precio de cambio) menos lo que pagó por lo que devuelve (ADR-0380) — body de S/ 45.90
 * por dos Top Rib de S/ 35.90 son S/ 25.90 a cobrar. Sin extras es exactamente `r.diferencia`: el cambio de una por una no cambia.
 * `faltan`: las prendas extra que todavía no resuelven a una variante (sin ellas la diferencia sería engañosa y el paso frena).
 */
export function totalesDelCambio(linea: LineaVentaReciente, s: Seleccion, r: Reemplazo, extrasR: readonly Reemplazo[]) {
  const extras = extrasDe(s);
  const salidas: SalidaDelCambio[] = [];
  if (r.varianteNueva) salidas.push({ variante: r.varianteNueva, cantidad: s.cantidad, precio: r.precioNueva ?? r.varianteNueva.precio });
  let faltan = 0;
  extrasR.forEach((er, i) => {
    if (er.varianteNueva) salidas.push({ variante: er.varianteNueva, cantidad: extras[i]!.cantidad, precio: er.precioNueva ?? er.varianteNueva.precio });
    else faltan++;
  });
  const valorNuevo = aCentimos(salidas.reduce((suma, x) => suma + x.precio * x.cantidad, 0));
  return {
    salidas,
    faltan,
    valorNuevo,
    esVarias: extras.length > 0,
    // Sin la primera prenda elegida no hay diferencia que cobrar (y la caja no se mira), como en `derivarReemplazo`.
    diferencia: r.varianteNueva ? aCentimos(valorNuevo - valorPagado(linea, s.cantidad)) : 0,
  };
}

export type TotalesDelCambio = ReturnType<typeof totalesDelCambio>;

/** Las prendas como las recibe `registrar_cambio_varias`: la misma prenda repetida se suma en una sola (la base hace lo mismo). */
export function salidasParaBase(salidas: readonly SalidaDelCambio[]): { variante_id: string; cantidad: number }[] {
  const porVariante = new Map<string, number>();
  for (const x of salidas) porVariante.set(x.variante.varianteId, (porVariante.get(x.variante.varianteId) ?? 0) + x.cantidad);
  return [...porVariante].map(([variante_id, cantidad]) => ({ variante_id, cantidad }));
}

/** Lo que se llevó, en una línea para el ticket y los avisos: «Polo Lucía · Negro · Talla M + Polo Lucía · Rosado · Talla S (×2)». */
export function describirSalidas(salidas: readonly SalidaDelCambio[]): string {
  return salidas
    .map((x) => {
      const detalle = varianteLegible(x.variante);
      return `${x.variante.referencia}${detalle ? ` · ${detalle}` : ""}${x.cantidad > 1 ? ` (×${x.cantidad})` : ""}`;
    })
    .join(" + ");
}

/**
 * Las revisiones de las prendas EXTRA, para sumarlas a las de `validarCambio` (que mira la primera). Sin extras no dice nada. Todas llevan la
 * clave «stock»: el foco de «Revisar el cambio» ya sabe llevar a la prenda cuando algo de ahí frena. Cada una refleja una regla que la base ya
 * aplica (sin precio → `cambio_sin_precio`; sin stock → `fn_aplicar_movimiento`): mejor decirlo aquí que con la clienta esperando.
 */
export function validarPrendasExtra(e: {
  extras: readonly PrendaExtra[];
  extrasR: readonly Reemplazo[];
  salidas: readonly SalidaDelCambio[];
  sede: string;
}): Validacion[] {
  if (e.extras.length === 0) return [];
  const lista: Validacion[] = [];
  e.extrasR.forEach((er, i) => {
    const cual = `${i + 2}.ª`;
    const extra = e.extras[i]!;
    if (!extra.productoId) lista.push({ clave: "stock", estado: "pendiente", titulo: `Falta elegir la ${cual} prenda que se lleva` });
    else if (!er.eligioTodo) lista.push({ clave: "stock", estado: "pendiente", titulo: `Falta elegir la talla y el color de la ${cual} prenda` });
    else if (!er.varianteNueva) lista.push({ clave: "stock", estado: "alerta", titulo: `Esa talla y color de la ${cual} prenda no existen en el catálogo` });
    else if (!((er.precioNueva ?? er.varianteNueva.precio) > 0))
      lista.push({
        clave: "stock",
        estado: "alerta",
        titulo: `${er.descripcionNueva} no tiene precio`,
        detalle: "Elige otra prenda, o pide que le pongan precio en su ficha (Catálogo ▸ Productos).",
      });
    else if (er.varianteNueva.stockAqui <= 0)
      lista.push({
        clave: "stock",
        estado: "alerta",
        titulo: er.avisoSinStock ?? `No queda ${er.descripcionNueva} en ${e.sede}`,
        detalle: er.otrasSedes ? `Hay ${er.otrasSedes}.` : undefined,
      });
  });
  if (lista.length > 0) return lista;

  // Todas resueltas y con algo en el piso: falta que alcance para TODAS las unidades pedidas de la misma prenda (la base lo rechaza si no).
  const pedidas = new Map<string, { variante: VarianteCatalogo; cantidad: number }>();
  for (const x of e.salidas) {
    const previa = pedidas.get(x.variante.varianteId);
    pedidas.set(x.variante.varianteId, { variante: x.variante, cantidad: (previa?.cantidad ?? 0) + x.cantidad });
  }
  for (const { variante, cantidad } of pedidas.values()) {
    if (cantidad > variante.stockAqui) {
      const detalle = varianteLegible(variante);
      lista.push({
        clave: "stock",
        estado: "alerta",
        titulo: `Pides ${cantidad} de ${variante.referencia}${detalle ? ` · ${detalle}` : ""} y en el piso de ${e.sede} hay ${variante.stockAqui}`,
      });
    }
  }
  return lista.length > 0 ? lista : [{ clave: "stock", estado: "ok", titulo: "Las otras prendas están disponibles", detalle: `En el piso de ${e.sede}.` }];
}
