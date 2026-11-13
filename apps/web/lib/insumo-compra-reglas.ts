import { redondear2, type MetodoPago } from "./comprobantes-produccion-reglas";

// «Llegó una compra» (ADR-0614, actividad 5; nació como P03 del «Análisis del Taller», Felipe 2026-11-02). Puro: sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué falta antes de guardar una compra de insumo con su proveedor y su deuda (proveedor, papel, vencimiento o pago), calcular sus totales como los redondea la base y armar lo que se le
//            manda a `retail.registrar_compra_de_insumos` (que registra factura + un lote por línea en una transacción).
//   ASUME:   es un espejo de lo que ya exige la base (`registrar_comprobante_produccion` y `recibir_comprobante_produccion`): una regla que la base no tenga NO se inventa aquí; la base vuelve a exigir todo.
//   NO HACE: no valida cantidad ni costo (lo hace `ingresoListo`, que ya existe) ni cuentas de pago (las trae `MediosDePago`).

export type TipoPapel = "factura" | "boleta" | "nota_venta";

/** Un medio de pago ya con su monto leído (lo arma `mediosParaRpc`). */
export type MedioDeCompra = { metodo: MetodoPago; monto: number; referencia?: string; cuenta_id?: string };

export type CompraDeInsumo = {
  proveedorId: string;
  tipo: TipoPapel;
  serie: string;
  numero: string;
  /** «Todavía no tengo el papel»: la base la registra como nota de venta provisional (serie S/P). */
  sinPapel: boolean;
  /** «Ya la pagué» (al contado) o «Queda por pagar» (a crédito). */
  pagada: boolean;
  emision: string;
  vence: string;
  lineas: readonly LineaDelLibro[];
  /** Lo que dice el papel, sin IGV (lo escrito en kilos o rollos × su precio). Sin dato, la suma de las líneas. */
  subtotalDelPapel?: number;
  medios: MedioDeCompra[];
};

/** Una línea ya en la unidad del libro (metros, unidades): lo que entra al lote. */
export type LineaDelLibro = {
  insumoId: string;
  cantidad: number;
  /** Por unidad del libro, sin IGV, a 4 decimales. */
  costoUnitario: number;
  codigoLote?: string;
  /** «100 kg × 3.47 m/kg», si se compró en otra unidad. */
  nota?: string;
};

/** Cómo se escribe una línea en la hoja: en la unidad en que se compró. */
export type LineaEscrita = {
  clave: string;
  insumoId: string;
  como: "libro" | "kilo" | "rollo";
  cantidad: string;
  precio: string;
  /** Metros por kilo o por rollo. Sale de la ficha y se corrige si lo medido fue otro. */
  rinde: string;
  codigoLote: string;
};

const IGV_PORCENTAJE = 18;

/** Lo mismo que redondea la base: el subtotal por línea a centavos y el IGV solo en una factura. */
export function totalesDeCompra(cantidad: number, costoUnitario: number, tipo: TipoPapel): { subtotal: number; igv: number; total: number } {
  return totalesDeLineas([{ cantidad, costoUnitario }], tipo);
}

/** Los totales de todas las líneas, como los calcula la base. */
export function totalesDeLineas(lineas: readonly Pick<LineaDelLibro, "cantidad" | "costoUnitario">[], tipo: TipoPapel): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear2(lineas.reduce((s, l) => s + redondear2(l.cantidad * l.costoUnitario), 0));
  const igv = tipo === "factura" ? redondear2((subtotal * IGV_PORCENTAJE) / 100) : 0;
  return { subtotal, igv, total: redondear2(subtotal + igv) };
}

/**
 * Lo que se debe. En una factura manda el papel: 100 kg a S/ 18 son S/ 1,800, aunque en metros, con el costo a 4 decimales, la cuenta dé S/ 1,799.99.
 * Sin IGV, la base exige que el total sea la suma de las líneas: ahí puede quedar un centavo de diferencia con el papel.
 */
export function totalAPagar(c: Pick<CompraDeInsumo, "lineas" | "subtotalDelPapel" | "tipo" | "sinPapel">): number {
  const tipo = c.sinPapel ? "nota_venta" : c.tipo;
  const deLineas = totalesDeLineas(c.lineas, tipo);
  if (tipo !== "factura" || c.subtotalDelPapel === undefined) return deLineas.total;
  return totalesDeCompra(1, c.subtotalDelPapel, "factura").total;
}

/** Emisión + el plazo de crédito del proveedor; sin plazo, 30 días. Fechas `aaaa-mm-dd` (el día de Lima ya viene escrito, sin zonas). */
export function vencimientoPorDefecto(emision: string, plazoDias: number | null): string {
  const [a, m, d] = emision.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + (plazoDias && plazoDias > 0 ? plazoDias : 30)));
  return fecha.toISOString().slice(0, 10);
}

export type ProblemaDeCompra = { campo: "lineas" | "proveedor" | "documento" | "vencimiento" | "pago"; texto: string };

/** Lo que falta para poder guardar, en el orden de la hoja. Nada de lo que ya está bien aparece. */
export function problemasDeCompra(c: CompraDeInsumo): ProblemaDeCompra[] {
  const p: ProblemaDeCompra[] = [];
  if (c.proveedorId.trim() === "") p.push({ campo: "proveedor", texto: "Elige a quién se la compraste: sin proveedor no hay a quién pagarle." });
  if (!c.sinPapel && (c.serie.trim() === "" || c.numero.trim() === "")) p.push({ campo: "documento", texto: "Escribe la serie y el número del papel, o marca «Todavía no tengo el papel»." });
  if (c.pagada) {
    const suma = redondear2(c.medios.reduce((s, m) => s + m.monto, 0));
    if (c.medios.length === 0 || suma !== totalAPagar(c)) p.push({ campo: "pago", texto: "Los medios de pago tienen que sumar justo lo que se pagó." });
  } else if (c.vence.trim() === "" || c.vence < c.emision) {
    p.push({ campo: "vencimiento", texto: c.vence.trim() === "" ? "Escribe cuándo vence: queda por pagar." : "El vencimiento no puede ser anterior a la emisión del papel." });
  }
  return p;
}

/** Lo que se le manda a `registrar_compra_de_insumos`. Los textos vacíos no se mandan (la base los toma como «no hay»). */
export function argsDeCompra(c: CompraDeInsumo, ids: { tallerId: string; nota: string; token: string }) {
  const esFactura = !c.sinPapel && c.tipo === "factura";
  return {
    p_ubicacion_id: ids.tallerId,
    p_proveedor_id: c.proveedorId,
    p_lineas: c.lineas.map((l) => ({
      insumo_id: l.insumoId,
      cantidad: l.cantidad,
      costo_unitario: l.costoUnitario,
      codigo_lote: l.codigoLote?.trim() || undefined,
      nota: l.nota,
    })),
    p_tipo: c.tipo,
    p_serie: c.sinPapel ? undefined : c.serie.trim() || undefined,
    p_numero: c.sinPapel ? undefined : c.numero.trim() || undefined,
    p_sin_papel: c.sinPapel,
    p_condicion: c.pagada ? "contado" : "credito",
    p_fecha_emision: c.emision,
    p_fecha_vencimiento: c.pagada ? undefined : c.vence,
    p_igv_porcentaje: IGV_PORCENTAJE,
    p_pago: c.pagada ? c.medios : undefined,
    p_nota: ids.nota.trim() || undefined,
    p_token: ids.token,
    p_total: esFactura ? totalAPagar(c) : undefined,
  };
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
const redondear4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Pasa una línea a la unidad del libro. 100 kg a S/ 18 con un rinde de 3.47 m/kg son 347 m a S/ 5.1873 el metro.
 * `null` si falta algo o no se entiende: la hoja lo dice por `problemasDeLineas`.
 */
export function lineaAlLibro(l: LineaEscrita, leer: { cantidad: (t: string) => number | null; precio: (t: string) => number | null }): LineaDelLibro | null {
  const q = leer.cantidad(l.cantidad);
  const precio = leer.precio(l.precio);
  if (l.insumoId === "" || q === null || !(q > 0) || precio === null || !(precio >= 0)) return null;
  const base = { insumoId: l.insumoId, codigoLote: l.codigoLote };
  if (l.como === "libro") return { ...base, cantidad: q, costoUnitario: precio };
  const rinde = leer.cantidad(l.rinde);
  if (rinde === null || !(rinde > 0)) return null;
  const metros = redondear3(q * rinde);
  if (!(metros > 0)) return null;
  const unidad = l.como === "kilo" ? "kg" : "rollo" + (q === 1 ? "" : "s");
  const factor = l.como === "kilo" ? "m/kg" : "m/rollo";
  return { ...base, cantidad: metros, costoUnitario: redondear4((q * precio) / metros), nota: `${q} ${unidad} × ${rinde} ${factor}` };
}

/** Lo que dice el papel, sin IGV: lo escrito × su precio, sin pasar por metros. */
export function subtotalDelPapel(lineas: readonly LineaEscrita[], leer: { cantidad: (t: string) => number | null; precio: (t: string) => number | null }): number {
  return redondear2(lineas.reduce((s, l) => s + redondear2((leer.cantidad(l.cantidad) ?? 0) * (leer.precio(l.precio) ?? 0)), 0));
}

/** Qué le falta a la lista de líneas, en una frase. Vacío si se puede guardar. */
export function problemasDeLineas(lineas: readonly LineaEscrita[], leer: { cantidad: (t: string) => number | null; precio: (t: string) => number | null }): string[] {
  const p: string[] = [];
  if (lineas.length === 0) p.push("Agrega al menos una línea.");
  if (lineas.some((l) => l.insumoId === "")) p.push("Elige qué llegó en cada línea.");
  const elegidos = lineas.map((l) => l.insumoId).filter(Boolean);
  if (new Set(elegidos).size !== elegidos.length) p.push("Cada insumo va una sola vez: si llegó a dos precios, regístralo en dos compras.");
  if (lineas.some((l) => l.insumoId !== "" && lineaAlLibro(l, leer) === null)) p.push("Escribe la cantidad y el precio de cada línea, y el rinde si la compraste por kilo o por rollo.");
  return p;
}
