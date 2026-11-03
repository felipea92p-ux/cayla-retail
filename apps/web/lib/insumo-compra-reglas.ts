import { redondear2, type MetodoPago } from "./comprobantes-produccion-reglas";

// «Ingresar insumo ▸ Compra» (P03 del «Análisis del Taller», Felipe 2026-11-02). Puro: sin React ni red.
//
// CONTRATO
//   PROMETE: decir qué falta antes de guardar una compra de insumo con su proveedor y su deuda (proveedor, papel, vencimiento o pago), calcular sus totales como los redondea la base y armar lo que se le
//            manda a `retail.recibir_insumo_comprado` (que registra factura + lote en una transacción).
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
  cantidad: number;
  /** Por unidad, sin IGV. */
  costoUnitario: number;
  medios: MedioDeCompra[];
};

const IGV_PORCENTAJE = 18;

/** Lo mismo que redondea la base: el subtotal por línea a centavos y el IGV solo en una factura. */
export function totalesDeCompra(cantidad: number, costoUnitario: number, tipo: TipoPapel): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear2(cantidad * costoUnitario);
  const igv = tipo === "factura" ? redondear2((subtotal * IGV_PORCENTAJE) / 100) : 0;
  return { subtotal, igv, total: redondear2(subtotal + igv) };
}

/** Emisión + el plazo de crédito del proveedor; sin plazo, 30 días. Fechas `aaaa-mm-dd` (el día de Lima ya viene escrito, sin zonas). */
export function vencimientoPorDefecto(emision: string, plazoDias: number | null): string {
  const [a, m, d] = emision.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + (plazoDias && plazoDias > 0 ? plazoDias : 30)));
  return fecha.toISOString().slice(0, 10);
}

export type ProblemaDeCompra = { campo: "proveedor" | "documento" | "vencimiento" | "pago"; texto: string };

/** Lo que falta para poder guardar, en el orden de la hoja. Nada de lo que ya está bien aparece. */
export function problemasDeCompra(c: CompraDeInsumo): ProblemaDeCompra[] {
  const p: ProblemaDeCompra[] = [];
  if (c.proveedorId.trim() === "") p.push({ campo: "proveedor", texto: "Elige a quién se la compraste: sin proveedor no hay a quién pagarle." });
  if (!c.sinPapel && (c.serie.trim() === "" || c.numero.trim() === "")) p.push({ campo: "documento", texto: "Escribe la serie y el número del papel, o marca «Todavía no tengo el papel»." });
  if (c.pagada) {
    const total = totalesDeCompra(c.cantidad, c.costoUnitario, c.sinPapel ? "nota_venta" : c.tipo).total;
    const suma = redondear2(c.medios.reduce((s, m) => s + m.monto, 0));
    if (c.medios.length === 0 || suma !== total) p.push({ campo: "pago", texto: `Los medios de pago tienen que sumar justo lo que se pagó.` });
  } else if (c.vence.trim() === "" || c.vence < c.emision) {
    p.push({ campo: "vencimiento", texto: c.vence.trim() === "" ? "Escribe cuándo vence: queda por pagar." : "El vencimiento no puede ser anterior a la emisión del papel." });
  }
  return p;
}

/** Lo que se le manda a `recibir_insumo_comprado`. Los textos vacíos no se mandan (la base los toma como «no hay»). */
export function argsDeCompra(c: CompraDeInsumo, ids: { insumoId: string; tallerId: string; codigoLote: string; nota: string; token: string }) {
  return {
    p_insumo_id: ids.insumoId,
    p_ubicacion_id: ids.tallerId,
    p_proveedor_id: c.proveedorId,
    p_cantidad: c.cantidad,
    p_costo_unitario: c.costoUnitario,
    p_tipo: c.tipo,
    p_serie: c.sinPapel ? undefined : c.serie.trim() || undefined,
    p_numero: c.sinPapel ? undefined : c.numero.trim() || undefined,
    p_sin_papel: c.sinPapel,
    p_condicion: c.pagada ? "contado" : "credito",
    p_fecha_emision: c.emision,
    p_fecha_vencimiento: c.pagada ? undefined : c.vence,
    p_igv_porcentaje: IGV_PORCENTAJE,
    p_pago: c.pagada ? c.medios : undefined,
    p_codigo_lote: ids.codigoLote.trim() || undefined,
    p_nota: ids.nota.trim() || undefined,
    p_token: ids.token,
  };
}
