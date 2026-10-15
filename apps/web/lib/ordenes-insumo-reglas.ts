// Órdenes de insumos del Taller (ADR-0362, fase 7 · actividad 2): las reglas puras de la lista, de la orden abierta y de la cuenta de
// cada línea. Se importa desde el servidor y desde el cliente, y se prueba sola (`ordenes-insumo-reglas.test.ts`).
//
//   PROMETE: cómo se escribe el número («OI-000012»); cómo se dicen las cantidades, POR UNIDAD («12.5 metros · 4 conos»: sumar metros
//   con conos no dice nada, por eso la base las devuelve separadas); la cuenta de una línea EXACTA como la base —importe =
//   round(cantidad × precio, 2), el descuento en % sobre ese importe redondeado a céntimos, subtotal = importe − descuento—, en enteros
//   (cantidad en milésimas, precio en diezmilésimas, plata en céntimos) para que 0.1 + 0.2 no sea 0.30000000000000004; leer lo que
//   devuelven `fn_ordenes_insumo` y `fn_orden_insumo` sin confiar en su forma (la web puede publicarse antes que la migración: una fila
//   rara se descarta, no tumba la pantalla); y los filtros de la lista, que viven en la URL.
//   NO HACE: no habla con la base (`ordenes-insumo.ts`) ni decide permisos: los decide cada función, con el módulo `ordenes_insumos`.
//
// Es la gemela de `ordenes-compra-reglas.ts` (la orden de tienda, fase 1): lo que dice lo mismo —el estado, el motivo de una anulación,
// qué decir si se corta la señal, la página de 50— se toma de allá; lo que cambia —el insumo con su unidad, la cantidad con tres
// decimales, el precio con cuatro, un solo destino que es el Taller— vive aquí.

import { soles } from "./compras-reglas";
import { leerNumero, type Lectura } from "./orden-compra-alta";
import { ESTADO_ORDEN, paginaDeOrdenes, type EstadoOrdenCompra } from "./ordenes-compra-reglas";

export { ESTADO_ORDEN, paginaDeOrdenes };

/** La raíz de las pantallas: `/ordenes-insumos` (no cuelga de `/produccion`, cuyo layout pide el módulo de producción: decisión 47). */
export const RUTA_ORDENES_INSUMO = "/ordenes-insumos";

export const RPC_LISTA_ORDENES_INSUMO = "fn_ordenes_insumo";
export const RPC_DETALLE_ORDEN_INSUMO = "fn_orden_insumo";
/** Lo que el formulario ofrece elegir (proveedores del Taller activos, insumos sin archivar, talleres), sin datos bancarios. Empieza
 *  con `fn_`: lectura, no abre el loader (`espera-reglas.ts`). */
export const RPC_OPCIONES_ORDEN_INSUMO = "fn_orden_insumo_opciones";
/** Vista previa del número de la próxima orden (no lo gasta). */
export const RPC_SIGUIENTE_ORDEN_INSUMO = "fn_ordenes_insumo_siguiente";
export const RPC_CREAR_ORDEN_INSUMO = "crear_orden_insumo";
export const RPC_EDITAR_ORDEN_INSUMO = "editar_orden_insumo";
export const RPC_ANULAR_ORDEN_INSUMO = "anular_orden_insumo";
/** El papel del proveedor de una orden de insumos (fase 7 parte 2 · actividad 1, 20261015020000). */
export const RPC_REGISTRAR_COMPROBANTE_ORDEN_INSUMO = "registrar_comprobante_orden_insumo";

/** La base reconoció el mismo id con OTRO pedido: la orden ya se había guardado con lo de antes (`crear_orden_insumo`). */
export const HINT_INSUMO_YA_GUARDADA = "orden_insumo_ya_guardada";

export type EstadoOrdenInsumo = EstadoOrdenCompra;
const ESTADOS: readonly EstadoOrdenInsumo[] = ["generada", "anulada"];

/** El número como se dice y se imprime: «OI-000012». El prefijo es presentación; la base guarda solo el número (decisión 28). */
export function numeroOrdenInsumo(numero: number): string {
  return `OI-${String(Math.max(0, Math.trunc(numero))).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Las unidades del insumo (`insumos.unidad_medida`)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Singular y plural de cada unidad del catálogo de insumos, como los dice la base al rechazar una cantidad. */
const NOMBRE_UNIDAD: Record<string, [uno: string, varios: string]> = {
  metro: ["metro", "metros"],
  kilo: ["kilo", "kilos"],
  cono: ["cono", "conos"],
  unidad: ["unidad", "unidades"],
  par: ["par", "pares"],
  docena: ["docena", "docenas"],
};
/** El orden en que se leen las cantidades de una orden: lo que se mide (tela) primero, después lo que se cuenta (avíos). */
const ORDEN_UNIDADES = ["metro", "kilo", "cono", "unidad", "par", "docena"];

/** «metro» o «metros» según la cantidad; sin cantidad, el plural («Cantidad en metros»). Una unidad nueva del catálogo se dice tal cual. */
export function nombreUnidad(unidad: string, cantidad?: number | null): string {
  const nombres = NOMBRE_UNIDAD[unidad];
  if (!nombres) return unidad;
  return cantidad === 1 ? nombres[0] : nombres[1];
}

/** Una cantidad como se lee: hasta tres decimales, los ceros de más fuera («12.5», «1,000»). */
export function cifraDeCantidad(cantidad: number): string {
  return cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

/** «12.5 metros», «1 cono». */
export function cantidadConUnidad(cantidad: number, unidad: string): string {
  return `${cifraDeCantidad(cantidad)} ${nombreUnidad(unidad, cantidad)}`;
}

export type CantidadPorUnidad = { unidad: string; cantidad: number };

/** Las cantidades en el orden en que se dicen: metros y kilos, después conos, unidades, pares y docenas; una unidad nueva, al final. */
export function ordenarCantidades(pares: readonly CantidadPorUnidad[]): CantidadPorUnidad[] {
  const lugar = (u: string) => (ORDEN_UNIDADES.includes(u) ? ORDEN_UNIDADES.indexOf(u) : ORDEN_UNIDADES.length);
  return [...pares].sort((a, b) => lugar(a.unidad) - lugar(b.unidad) || a.unidad.localeCompare(b.unidad));
}

/** Lee `cantidades` de la base (`{"metro": 12.5, "cono": 4}`) en el orden en que se dicen. Lo que no es una cifra se descarta. */
export function leerCantidades(data: unknown): CantidadPorUnidad[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return ordenarCantidades(
    Object.entries(data as Record<string, unknown>)
      .map(([unidad, v]) => ({ unidad, cantidad: cifra(v) }))
      .filter((p): p is CantidadPorUnidad => p.cantidad !== null && p.cantidad > 0),
  );
}

/** «12.5 metros · 4 conos»: cada unidad con lo suyo, nunca sumadas. Sin líneas, «—». */
export function textoCantidades(cantidades: readonly CantidadPorUnidad[]): string {
  return cantidades.length ? cantidades.map((c) => cantidadConUnidad(c.cantidad, c.unidad)).join(" · ") : "—";
}

/** El precio de una unidad: con 2 decimales si no trae más («S/ 25.50»); con los 4 si los usa («S/ 0.0350», un botón). */
export function precioUnitarioTexto(precio: number): string {
  const diezmilesimas = Math.round(precio * 10_000);
  if (diezmilesimas % 100 === 0) return soles(diezmilesimas / 10_000);
  return `S/\u00a0${(diezmilesimas / 10_000).toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La cuenta de una línea, exacta como la base (`orden_insumo_items.subtotal` y `fn_orden_insumo_descuento`)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que la base acepta (`fn_orden_insumo_validar`). */
export const TOPES_INSUMO = {
  lineas: 100,
  /** 99 999.999 en la unidad del insumo, en milésimas. */
  cantidadMilesimas: 99_999_999,
  /** S/ 99 999.9999, en diezmilésimas. */
  precioDiezmilesimas: 999_999_999,
  descripcion: 200,
  nota: 500,
} as const;
export const DECIMALES_CANTIDAD = 3;
export const DECIMALES_PRECIO = 4;

/** Medio hacia arriba de un cociente de enteros positivos (lo que hace `round` de Postgres con un `numeric` positivo). */
function redondearCociente(n: bigint, d: bigint): number {
  const dos = BigInt(2);
  return Number((dos * n + d) / (dos * d));
}

/**
 * El importe de una línea en céntimos: `round(cantidad × precio, 2)` de la base. La cantidad llega en milésimas y el precio en
 * diezmilésimas, así que su producto es el importe × 10⁷: se divide entre 10⁵ y se redondea. 1000 botones a S/ 0.0350 son S/ 35.00
 * (no S/ 40.00, que es lo que daría un precio de dos decimales). En BigInt: el producto pasa de 2⁵³ con los topes.
 */
export function importeCentimos(cantidadMilesimas: number, precioDiezmilesimas: number): number {
  return redondearCociente(BigInt(cantidadMilesimas) * BigInt(precioDiezmilesimas), BigInt(100_000));
}

/**
 * El descuento en % de una línea, en céntimos: `round(importe × pct / 100, 2)` sobre el IMPORTE ya redondeado (lo que dice el papel),
 * como `fn_orden_insumo_descuento` y el candado `orden_insumo_items_descuento_cuadra`. El % llega escalado × 10 000 (cuatro decimales).
 * 12.5 m a S/ 13.3333 son S/ 166.67, y el 15 % es S/ 25.00 (no S/ 25.0005).
 */
export function descuentoPorPctCentimos(importe: number, pctEscalado: number): number {
  return redondearCociente(BigInt(importe) * BigInt(pctEscalado), BigInt(1_000_000));
}

/** Cómo se escribió el descuento de una línea: en porcentaje o en soles. El otro se calcula. */
export type ModoDescuento = "pct" | "soles";

const MILES_CON_PUNTO = /^[1-9]\d{0,2}\.\d{3}$/;
const limpio = (texto: string) => texto.replace(/\s+/g, "").replace(/^s\//i, "");

/**
 * «1.000», «1.500», «12.500» en una caja que admite tres o cuatro decimales: en el Perú así se escribe también «mil» o «mil quinientos».
 * Con la orden de tienda (`leerNumero`, cero o dos decimales) el cero de más ya delataba la duda; aquí caben tres, así que se mira el
 * cero del final: quien quiso uno y medio escribe «1.5», no «1.500». Si la lectura en miles no cabe en la caja (`tope`, en la escala de
 * la caja), no hay duda. Con cifras distintas de cero al final («12.505») vale lo escrito: tres decimales de verdad.
 */
function esMilesConPunto(texto: string, decimales: number, tope: number): boolean {
  const t = limpio(texto);
  if (!MILES_CON_PUNTO.test(t) || !t.endsWith("0")) return false;
  return Number(t.replace(".", "")) * 10 ** decimales <= tope;
}

/** La cantidad de una línea, escalada a milésimas. «1.500» (¿mil quinientos o uno y medio?) no se adivina: es `ambiguo`. */
export function leerCantidadInsumo(texto: string): Lectura {
  if (esMilesConPunto(texto, DECIMALES_CANTIDAD, TOPES_INSUMO.cantidadMilesimas)) return { tipo: "mal", motivo: "ambiguo" };
  return leerNumero(texto, DECIMALES_CANTIDAD);
}

/** El precio de una unidad, escalado a diezmilésimas. «1.500» (¿S/ 1500 o S/ 1.50?) no se adivina: es `ambiguo`. */
export function leerPrecioInsumo(texto: string): Lectura {
  if (esMilesConPunto(texto, DECIMALES_PRECIO, TOPES_INSUMO.precioDiezmilesimas)) return { tipo: "mal", motivo: "ambiguo" };
  return leerNumero(texto, DECIMALES_PRECIO);
}

/** La frase para quien escribió miles con punto en la cantidad: las dos lecturas, con la unidad, y cómo escribir la que quiso. */
export function dudaDeCantidadInsumo(texto: string, unidad: string): string {
  const t = limpio(texto);
  const miles = t.replace(".", "");
  const decimal = t.replace(/0+$/, "").replace(/\.$/, "");
  return `¿«${t}» son ${miles} ${nombreUnidad(unidad, Number(miles))} o ${decimal} ${nombreUnidad(unidad, Number(decimal))}? Escríbelo sin punto (${miles}) o así: ${decimal}.`;
}

/** Lo mismo con el precio: «¿«1.500» es S/ 1500 o S/ 1.50? …». */
export function dudaDePrecioInsumo(texto: string): string {
  const t = limpio(texto);
  const miles = t.replace(".", "");
  const decimal = t.slice(0, -1); // «1.500» → «1.50»: el cero de más
  return `¿«${t}» es S/\u00a0${miles} o S/\u00a0${decimal}? Escríbelo sin punto (${miles}) o con dos decimales (${decimal}).`;
}

/** Lo que se tipeó en una línea, para la cuenta. */
export type LineaParaCuenta = { cantidad: string; precio: string; descuento: string; modoDescuento: ModoDescuento };

export type CuentaLinea = {
  /** En milésimas de la unidad del insumo, o null si no se entiende o falta. */
  cantidadMilesimas: number | null;
  /** En diezmilésimas de sol, o null. */
  precioDiezmilesimas: number | null;
  /** `round(cantidad × precio, 2)` en céntimos, o null si falta la cantidad o el precio. */
  importeCentimos: number | null;
  descuentoCentimos: number;
  /** El porcentaje equivalente (× 10 000), para mostrar el otro lado del descuento; null sin importe. */
  pctEscalado: number | null;
  /** Importe − descuento, nunca menos de cero en pantalla (si el descuento se pasa, la guía lo frena antes de guardar). */
  subtotalCentimos: number | null;
};

/** La cuenta de una línea con las reglas de la base. */
export function calcularLineaInsumo(l: LineaParaCuenta): CuentaLinea {
  const cant = leerCantidadInsumo(l.cantidad);
  const precio = leerPrecioInsumo(l.precio);
  const cantidadMilesimas = cant.tipo === "ok" ? cant.escalado : null;
  const precioDiezmilesimas = precio.tipo === "ok" ? precio.escalado : null;
  const importe = cantidadMilesimas != null && precioDiezmilesimas != null ? importeCentimos(cantidadMilesimas, precioDiezmilesimas) : null;
  let descuentoCentimos = 0;
  let pctEscalado: number | null = null;
  if (importe != null) {
    if (l.modoDescuento === "pct") {
      const p = leerNumero(l.descuento, 4);
      pctEscalado = p.tipo === "ok" ? p.escalado : 0;
      descuentoCentimos = p.tipo === "ok" ? descuentoPorPctCentimos(importe, p.escalado) : 0;
    } else {
      const s = leerNumero(l.descuento, 2);
      descuentoCentimos = s.tipo === "ok" ? s.escalado : 0;
      pctEscalado = importe > 0 ? Math.round((descuentoCentimos * 1_000_000) / importe) : 0;
    }
  }
  const subtotalCentimos = importe != null ? Math.max(0, importe - descuentoCentimos) : null;
  return { cantidadMilesimas, precioDiezmilesimas, importeCentimos: importe, descuentoCentimos, pctEscalado, subtotalCentimos };
}

/** El total de la orden en céntimos: la suma de los subtotales (lo que todavía no se puede calcular no suma). */
export function totalCentimosInsumo(lineas: readonly LineaParaCuenta[]): number {
  return lineas.reduce((acc, l) => acc + (calcularLineaInsumo(l).subtotalCentimos ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Leer lo que devuelve la base
// ---------------------------------------------------------------------------------------------------------------------------------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
function cifra(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export type OrdenInsumoFila = {
  id: string;
  numero: number;
  estado: EstadoOrdenInsumo;
  proveedorId: string;
  proveedorNombre: string;
  destinoId: string | null;
  destinoNombre: string | null;
  fechaEmision: string;
  fechaEntregaEstimada: string | null;
  lineas: number;
  cantidades: CantidadPorUnidad[];
  total: number;
  creadaPorNombre: string | null;
  creadaEn: string;
};

/** Lee una fila de `fn_ordenes_insumo`; `null` si le falta algo que la lista necesita (se descarta, no se inventa). */
export function leerFilaOrdenInsumo(f: unknown): OrdenInsumoFila | null {
  if (!f || typeof f !== "object") return null;
  const r = f as Record<string, unknown>;
  const id = texto(r.id);
  const numero = cifra(r.numero);
  const estado = ESTADOS.find((e) => e === r.estado);
  const proveedorId = texto(r.proveedor_id);
  const proveedorNombre = texto(r.proveedor_nombre);
  const fechaEmision = texto(r.fecha_emision);
  const creadaEn = texto(r.creada_en);
  if (!id || numero == null || !estado || !proveedorId || !proveedorNombre || !fechaEmision || !creadaEn) return null;
  return {
    id,
    numero,
    estado,
    proveedorId,
    proveedorNombre,
    destinoId: texto(r.ubicacion_destino_id),
    destinoNombre: texto(r.destino_nombre),
    fechaEmision,
    fechaEntregaEstimada: texto(r.fecha_entrega_estimada),
    lineas: cifra(r.lineas) ?? 0,
    cantidades: leerCantidades(r.cantidades),
    total: cifra(r.total) ?? 0,
    creadaPorNombre: texto(r.creada_por_nombre),
    creadaEn,
  };
}

export function leerFilasOrdenesInsumo(data: unknown): OrdenInsumoFila[] {
  return Array.isArray(data) ? data.map(leerFilaOrdenInsumo).filter((f): f is OrdenInsumoFila => f !== null) : [];
}

export type LineaOrdenInsumo = {
  posicion: number;
  insumoId: string;
  insumo: string;
  codigo: string | null;
  /** `tela` o `avio`. */
  tipo: string | null;
  /** La unidad de la orden: la copió la base al guardar la línea. */
  unidadMedida: string;
  /** La unidad del insumo HOY: si difiere, alguien la cambió después de hacer la orden (`fn_orden_insumo_foto`). */
  unidadActual: string | null;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  descuentoPct: number | null;
  subtotal: number;
};

/** Lo que la orden decía antes de una edición (`orden_insumo_versiones`): lo justo para contarlo en la orden abierta. */
export type VersionOrdenInsumo = {
  version: number;
  reemplazadaPor: string | null;
  reemplazadaEn: string | null;
  proveedor: string | null;
  fechaEntregaEstimada: string | null;
  lineas: LineaOrdenInsumo[];
  total: number;
};

/** Lo facturado de una línea de la orden (fase 7 parte 2): lo que dicen sus papeles vigentes, en la unidad de la línea. */
export type FacturadoDeLinea = { posicion: number; itemId: string; facturado: number };

/** Un papel del proveedor de la orden (fase 7 parte 2), vigente o anulado. «Sin comprobante» trae su número interno SC-…. */
export type PapelDeOrdenInsumo = {
  id: string;
  tipo: string;
  documento: string;
  fechaEmision: string | null;
  condicion: string | null;
  fechaVencimiento: string | null;
  total: number;
  estado: "vigente" | "anulada";
};

export type DetalleOrdenInsumo = {
  id: string;
  numero: number;
  estado: EstadoOrdenInsumo;
  proveedor: { id: string; nombre: string; ruc: string | null; rubro: string | null };
  destino: { id: string; nombre: string };
  fechaEmision: string;
  fechaEntregaEstimada: string | null;
  nota: string | null;
  creadaPor: string | null;
  creadaEn: string;
  actualizadaPor: string | null;
  actualizadaEn: string | null;
  version: number;
  anuladaPor: string | null;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  lineas: LineaOrdenInsumo[];
  cantidades: CantidadPorUnidad[];
  total: number;
  /** De la más vieja a la más nueva; vacía si nunca se editó. */
  versiones: VersionOrdenInsumo[];
  /** Lo facturado de cada línea, por posición (vacío si la base todavía no lo trae). */
  facturacion: FacturadoDeLinea[];
  /** Sus papeles, del más nuevo al más viejo. */
  comprobantes: PapelDeOrdenInsumo[];
  /** El plazo de crédito del proveedor, para sugerir el vencimiento del papel; null si su ficha no lo dice. */
  plazoCreditoDias: number | null;
};

function leerLineas(data: unknown): LineaOrdenInsumo[] {
  return (Array.isArray(data) ? data : [])
    .map((l): LineaOrdenInsumo | null => {
      if (!l || typeof l !== "object") return null;
      const r = l as Record<string, unknown>;
      const posicion = cifra(r.posicion);
      const insumoId = texto(r.insumo_id);
      const insumo = texto(r.insumo);
      const unidadMedida = texto(r.unidad_medida);
      const cantidad = cifra(r.cantidad);
      const precioUnitario = cifra(r.precio_unitario);
      const subtotal = cifra(r.subtotal);
      if (posicion == null || !insumoId || !insumo || !unidadMedida || cantidad == null || precioUnitario == null || subtotal == null) return null;
      return {
        posicion,
        insumoId,
        insumo,
        codigo: texto(r.codigo),
        tipo: texto(r.tipo),
        unidadMedida,
        unidadActual: texto(r.unidad_actual),
        descripcion: texto(r.descripcion),
        cantidad,
        precioUnitario,
        descuento: cifra(r.descuento) ?? 0,
        descuentoPct: cifra(r.descuento_pct),
        subtotal,
      };
    })
    .filter((l): l is LineaOrdenInsumo => l !== null);
}

function leerVersiones(data: unknown): VersionOrdenInsumo[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((v): VersionOrdenInsumo | null => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const version = cifra(r.version);
      if (version == null) return null;
      const datos = r.datos && typeof r.datos === "object" && !Array.isArray(r.datos) ? (r.datos as Record<string, unknown>) : {};
      const proveedor = datos.proveedor && typeof datos.proveedor === "object" ? texto((datos.proveedor as Record<string, unknown>).nombre) : null;
      return {
        version,
        reemplazadaPor: texto(r.reemplazada_por),
        reemplazadaEn: texto(r.reemplazada_en),
        proveedor,
        fechaEntregaEstimada: texto(datos.fecha_entrega_estimada),
        lineas: leerLineas(datos.lineas),
        total: cifra(datos.total) ?? 0,
      };
    })
    .filter((v): v is VersionOrdenInsumo => v !== null)
    .sort((a, b) => a.version - b.version);
}

function leerFacturacion(data: unknown): FacturadoDeLinea[] {
  return (Array.isArray(data) ? data : [])
    .map((f): FacturadoDeLinea | null => {
      if (!f || typeof f !== "object") return null;
      const r = f as Record<string, unknown>;
      const posicion = cifra(r.posicion);
      const itemId = texto(r.item_id);
      const facturado = cifra(r.facturado);
      return posicion == null || !itemId || facturado == null ? null : { posicion, itemId, facturado };
    })
    .filter((f): f is FacturadoDeLinea => f !== null);
}

function leerPapeles(data: unknown): PapelDeOrdenInsumo[] {
  return (Array.isArray(data) ? data : [])
    .map((c): PapelDeOrdenInsumo | null => {
      if (!c || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const id = texto(r.id);
      const tipo = texto(r.tipo);
      const documento = texto(r.documento);
      const estado = r.estado === "vigente" || r.estado === "anulada" ? r.estado : null;
      if (!id || !tipo || !documento || !estado) return null;
      return {
        id,
        tipo,
        documento,
        fechaEmision: texto(r.fecha_emision),
        condicion: texto(r.condicion),
        fechaVencimiento: texto(r.fecha_vencimiento),
        total: cifra(r.total) ?? 0,
        estado,
      };
    })
    .filter((c): c is PapelDeOrdenInsumo => c !== null);
}

/** Lee `fn_orden_insumo`; null si no llegó una orden (no existe, o la respuesta no se entiende). Una línea rara se descarta. */
export function leerDetalleOrdenInsumo(data: unknown): DetalleOrdenInsumo | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const id = texto(d.id);
  const numero = cifra(d.numero);
  const estado = ESTADOS.find((e) => e === d.estado);
  const proveedor = d.proveedor && typeof d.proveedor === "object" ? (d.proveedor as Record<string, unknown>) : null;
  const destino = d.destino && typeof d.destino === "object" ? (d.destino as Record<string, unknown>) : null;
  const proveedorId = proveedor ? texto(proveedor.id) : null;
  const proveedorNombre = proveedor ? texto(proveedor.nombre) : null;
  const destinoId = destino ? texto(destino.id) : null;
  const destinoNombre = destino ? texto(destino.nombre) : null;
  const fechaEmision = texto(d.fecha_emision);
  const creadaEn = texto(d.creada_en);
  if (!id || numero == null || !estado || !proveedorId || !proveedorNombre || !destinoId || !destinoNombre || !fechaEmision || !creadaEn) return null;
  return {
    id,
    numero,
    estado,
    proveedor: { id: proveedorId, nombre: proveedorNombre, ruc: proveedor ? texto(proveedor.ruc) : null, rubro: proveedor ? texto(proveedor.rubro) : null },
    destino: { id: destinoId, nombre: destinoNombre },
    fechaEmision,
    fechaEntregaEstimada: texto(d.fecha_entrega_estimada),
    nota: texto(d.nota),
    creadaPor: texto(d.creada_por),
    creadaEn,
    actualizadaPor: texto(d.actualizada_por),
    actualizadaEn: texto(d.actualizada_en),
    version: cifra(d.version) ?? 1,
    anuladaPor: texto(d.anulada_por),
    anuladaEn: texto(d.anulada_en),
    motivoAnulacion: texto(d.motivo_anulacion),
    lineas: leerLineas(d.lineas),
    cantidades: leerCantidades(d.cantidades),
    total: cifra(d.total) ?? 0,
    versiones: leerVersiones(d.versiones),
    facturacion: leerFacturacion(d.facturacion),
    comprobantes: leerPapeles(d.comprobantes),
    plazoCreditoDias: cifra(d.plazo_credito_dias),
  };
}

/**
 * «Editar» y «Anular orden»: lo mismo que rechazan `editar_orden_insumo` y `anular_orden_insumo` (que siguen siendo el candado). Solo una
 * generada; y con papel (fase 7 parte 2): una orden que tuvo papel —aunque se haya anulado— ya no se edita (editar borra sus líneas, y
 * las del comprobante del Taller no se tocan), y con su papel VIGENTE tampoco se anula (primero se anula el papel).
 */
export const puedeEditarOrdenInsumo = (d: Pick<DetalleOrdenInsumo, "estado" | "comprobantes">): boolean =>
  d.estado === "generada" && d.comprobantes.length === 0;
export const puedeAnularOrdenInsumo = (d: Pick<DetalleOrdenInsumo, "estado" | "comprobantes">): boolean =>
  d.estado === "generada" && !d.comprobantes.some((c) => c.estado === "vigente");
/** «Registrar comprobante»: una orden generada (la base no le registra papel a una anulada). */
export const puedeRegistrarComprobanteInsumo = (d: Pick<DetalleOrdenInsumo, "estado">): boolean => d.estado === "generada";

/** Las líneas cuya unidad cambió desde que se hizo la orden (alguien cambió la del insumo en el catálogo). */
export function lineasConUnidadCambiada(d: Pick<DetalleOrdenInsumo, "lineas">): LineaOrdenInsumo[] {
  return d.lineas.filter((l) => l.unidadActual != null && l.unidadActual !== l.unidadMedida);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que el formulario ofrece elegir (`fn_orden_insumo_opciones`)
// ---------------------------------------------------------------------------------------------------------------------------------

export type ProveedorTaller = { id: string; nombre: string; ruc: string | null; rubro: string | null };
export type InsumoOpcion = { id: string; codigo: string; nombre: string; tipo: string | null; unidadMedida: string; proveedorId: string | null };
export type TallerOpcion = { id: string; nombre: string };
export type OpcionesOrdenInsumo = { proveedores: ProveedorTaller[]; insumos: InsumoOpcion[]; talleres: TallerOpcion[] };

/** Lo que «Nueva orden de insumos» y «Editar» leen de la base (`getDatosNuevaOrdenInsumo`). */
export type DatosOrdenInsumo = OpcionesOrdenInsumo & {
  /** El número que le tocaría; null si la vista previa no respondió (se numera igual al guardar). */
  siguiente: number | null;
  falla: string | null;
};

/** Lee `fn_orden_insumo_opciones`; `null` si la respuesta no se entiende (la función no existe todavía, o devolvió otra cosa). */
export function leerOpcionesOrdenInsumo(data: unknown): OpcionesOrdenInsumo | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.proveedores) || !Array.isArray(d.insumos) || !Array.isArray(d.talleres)) return null;
  const filas = (xs: unknown[]) => xs.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  return {
    proveedores: filas(d.proveedores).flatMap((p) => {
      const id = texto(p.id);
      const nombre = texto(p.nombre);
      return id && nombre ? [{ id, nombre, ruc: texto(p.ruc), rubro: texto(p.rubro) }] : [];
    }),
    insumos: filas(d.insumos).flatMap((i) => {
      const id = texto(i.id);
      const codigo = texto(i.codigo);
      const nombre = texto(i.nombre);
      const unidadMedida = texto(i.unidad_medida);
      return id && codigo && nombre && unidadMedida ? [{ id, codigo, nombre, tipo: texto(i.tipo), unidadMedida, proveedorId: texto(i.proveedor_id) }] : [];
    }),
    talleres: filas(d.talleres).flatMap((t) => {
      const id = texto(t.id);
      const nombre = texto(t.nombre);
      return id && nombre ? [{ id, nombre }] : [];
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La lista: qué se está mirando (todo vive en la URL: el enlace se comparte y «atrás» vuelve al filtro anterior)
// ---------------------------------------------------------------------------------------------------------------------------------

export const TAMANO_PAGINA_ORDENES_INSUMO = 50;

/** Lo que dice la URL de la lista. `cursor` es la página: el número de la última orden de la página anterior. */
export type ParamsListaInsumo = { estado?: string; q?: string; cursor?: string; recien?: string };

export type FiltrosListaInsumo = {
  estado: EstadoOrdenInsumo | null;
  q: string;
  /** La página: las órdenes de número menor a este. */
  antesDe: number | null;
};

export function filtrosDeListaInsumo(p: ParamsListaInsumo): FiltrosListaInsumo {
  const antes = p.cursor && /^\d{1,9}$/.test(p.cursor) ? Number(p.cursor) : null;
  return {
    estado: ESTADOS.find((e) => e === p.estado) ?? null,
    q: (p.q ?? "").trim().slice(0, 80),
    antesDe: antes && antes > 0 ? antes : null,
  };
}

/** Los argumentos de `fn_ordenes_insumo` para estos filtros. Pide UNA de más: si llega, hay otra página. */
export function argsListaInsumo(f: FiltrosListaInsumo): {
  p_estado: string | null;
  p_proveedor_id: string | null;
  p_busqueda: string | null;
  p_limite: number;
  p_antes_de: number | null;
} {
  return { p_estado: f.estado, p_proveedor_id: null, p_busqueda: f.q || null, p_limite: TAMANO_PAGINA_ORDENES_INSUMO + 1, p_antes_de: f.antesDe };
}

/** Los filtros puestos como parámetros de la URL, sin la página (la paginación les suma su `cursor`). */
export function paramsDeListaInsumo(f: FiltrosListaInsumo): Record<string, string | undefined> {
  return { estado: f.estado ?? undefined, q: f.q || undefined };
}

/** La URL de la lista con estos filtros y los cambios pedidos. Cambiar un filtro vuelve a la primera página. */
export function hrefListaInsumo(f: FiltrosListaInsumo, cambios: Partial<FiltrosListaInsumo> = {}): string {
  const n = { ...f, antesDe: null, ...cambios };
  const q = new URLSearchParams();
  if (n.estado) q.set("estado", n.estado);
  if (n.q) q.set("q", n.q);
  if (n.antesDe) q.set("cursor", String(n.antesDe));
  const s = q.toString();
  return s ? `${RUTA_ORDENES_INSUMO}?${s}` : RUTA_ORDENES_INSUMO;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A dónde vuelve la pantalla después de guardar una orden: a la lista, con ella marcada «Recién guardada». */
export function hrefOrdenInsumoGuardada(id: string): string {
  return ES_UUID.test(id) ? `${RUTA_ORDENES_INSUMO}?recien=${id}` : RUTA_ORDENES_INSUMO;
}

/** La orden recién guardada que la lista marca, si la URL trae una válida. */
export function recienDeInsumo(p: ParamsListaInsumo): string | null {
  return p.recien && ES_UUID.test(p.recien) ? p.recien.toLowerCase() : null;
}

/** Lo que dice la lista cuando con estos filtros no queda ninguna orden: qué pasó, en palabras de tienda, y qué filtro se puede quitar.
 *  La búsqueda no va entre los filtros: se borra con su propio botón. */
export function vacioDeListaInsumo(f: FiltrosListaInsumo): { titulo: string; frase: string; filtros: { texto: string; href: string }[] } {
  const filtros = f.estado ? [{ texto: f.estado === "generada" ? "Generadas" : "Anuladas", href: hrefListaInsumo(f, { estado: null }) }] : [];
  if (f.q) {
    return {
      titulo: `Ninguna orden coincide con «${f.q}»`,
      frase: "Busca por el número de la orden, el proveedor o el insumo (su nombre o su código).",
      filtros,
    };
  }
  return {
    titulo: f.estado === "anulada" ? "No hay ninguna orden anulada" : f.estado === "generada" ? "No hay ninguna orden generada" : "No hay órdenes en esta página",
    frase: f.estado ? "Quita el filtro para ver todas." : "Vuelve al inicio de la lista.",
    filtros,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Las cifras de arriba: salen de las órdenes generadas (una anulada no suma)
// ---------------------------------------------------------------------------------------------------------------------------------

export type CifrasOrdenesInsumo = {
  /** Cuántas órdenes generadas hay y cuánto suman. */
  generadas: number;
  monto: number;
  /** Las generadas cuya entrega estimada cae desde hoy y hasta dentro de 7 días, y la más próxima. */
  entregaEnLaSemana: number;
  proximaEntrega: string | null;
};

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Las cifras de la lista a partir de las órdenes generadas (`hoy` en `aaaa-mm-dd`, hora de Lima). Una anulada no cuenta aunque llegue. */
export function cifrasDeOrdenesInsumo(filas: readonly Pick<OrdenInsumoFila, "estado" | "total" | "fechaEntregaEstimada">[], hoy: string): CifrasOrdenesInsumo {
  const generadas = filas.filter((f) => f.estado === "generada");
  const hasta = sumarDias(hoy, 7);
  const pronto = generadas
    .map((f) => f.fechaEntregaEstimada?.slice(0, 10) ?? null)
    .filter((e): e is string => e !== null && e >= hoy && e <= hasta)
    .sort();
  // La suma en céntimos: los totales llegan con dos decimales y sumarlos como flotantes acumula el error de 0.1 + 0.2.
  const centimos = generadas.reduce((acc, f) => acc + Math.round(f.total * 100), 0);
  return { generadas: generadas.length, monto: centimos / 100, entregaEnLaSemana: pronto.length, proximaEntrega: pronto[0] ?? null };
}
