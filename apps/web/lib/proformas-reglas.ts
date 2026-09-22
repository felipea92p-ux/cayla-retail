import { HORAS_PROFORMA_POR_VENCER } from "@cayla-retail/shared";

// Reglas puras de proformas: ni Supabase ni `next/headers`, para que se puedan
// probar sin levantar nada — mismo criterio que `lib/registro-contable.ts`.
// `lib/proformas.ts` las reexporta, así que quien ya importaba desde ahí no
// cambia nada.

export type EstadoProforma = "vigente" | "convertida" | "vencida" | "anulada";

export type Proforma = {
  id: string;
  ubicacion_id: string;
  cliente_nombre: string | null;
  cliente_num_doc: string | null;
  total: number;
  estado: EstadoProforma;
  comprobante_id: string | null;
  created_at: string;
  vence_at: string | null;
  /** Correlativo interno («PRO-000123», `numeroDeProforma`); null solo en filas de antes de 2026-09-22. */
  numero: number | null;
  /** Texto libre que sale impreso al pie. */
  nota: string | null;
  /** La venta con que se cobró (`marcar_proforma_cobrada`). */
  venta_id: string | null;
  /** Las líneas tal como las guardó `crear_proforma`: leerlas SIEMPRE con `lineasDeLaProforma`. */
  items: unknown;
  /** Derivado, no es columna (camelCase como `stockTotal` en catalogo.ts): si le
   *  quedan menos de HORAS_PROFORMA_POR_VENCER para caducar.
   *
   *  Se calcula en el servidor y no en el componente. Dos razones: la regla de
   *  negocio ("48h") pertenece al dominio, no a la UI; y el reloj del navegador
   *  de una sede puede estar mal puesto — si cada tablet decidiera por su cuenta
   *  qué está por vencer, dos personas verían números distintos de la misma
   *  pantalla. */
  porVencer: boolean;
  /** Derivado, como `porVencer`: sigue «vigente» en la base —nadie escribe `vencida`,
   *  ni un cron ni un trigger— pero su `vence_at` ya pasó. Cuenta como vencida y NO
   *  como vigente: esa clienta ya no tiene el precio que se le cotizó. Se calcula en
   *  el servidor por la misma razón que `porVencer`: dos tablets con el reloj distinto
   *  no pueden ver números distintos de la misma pantalla. */
  vencida: boolean;
};

/** Fila tal como viene de la base, antes de calcularle nada. */
export type ProformaFila = Omit<Proforma, "porVencer" | "vencida">;

/** Marca cuáles están por vencer.
 *
 *  `ahora` es un PARÁMETRO y no una llamada a `Date.now()` escondida adentro, que
 *  es justo el error que tenía esto antes: el reloj es una entrada de la función,
 *  no un efecto oculto. Así la regla se puede probar con relojes fijos en vez de
 *  esperar 47 horas, y el resultado no cambia entre dos llamadas seguidas. */
export function marcarPorVencer(filas: ProformaFila[], ahora: number = Date.now()): Proforma[] {
  const limite = ahora + HORAS_PROFORMA_POR_VENCER * 3600 * 1000;
  return filas.map((p) => {
    const vence = p.vence_at ? new Date(p.vence_at).getTime() : null;
    // Solo una proforma vigente puede estar «por vencer» o «vencida»: una ya
    // convertida o anulada no le sirve a nadie por más cerca (o lejos) que esté su
    // fecha. Las dos mitades no se pisan: por vencer es `ahora < vence < limite`;
    // vencida es `vence <= ahora`.
    const vigente = p.estado === "vigente";
    return {
      ...p,
      porVencer: vigente && vence != null && vence > ahora && vence < limite,
      vencida: vigente && vence != null && vence <= ahora,
    };
  });
}

/** Una línea de proforma: copia de la prenda al momento de cotizar (el papel no cambia si cambia el catálogo).
 *  `precio_unitario` es el de etiqueta CON IGV, como en `registrar_venta`. La escribe `crear_proforma`. */
export type LineaProforma = {
  variante_id: string;
  cantidad: number;
  precio_unitario: number;
  descuento_unitario: number;
  motivo_descuento: string | null;
  motivo_descuento_detalle: string | null;
  descripcion: string;
  codigo: string | null;
};

/** Hasta dónde se puede descontar una línea en la proforma. Es la banda que el Punto de Venta cobra sin
 *  argumento escrito; lo que pase de ahí lo decide un líder al cobrar (spec 2026-09-22). */
export const TOPE_DESCUENTO_PROFORMA = 0.2;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Las líneas con prenda, o `null` si la proforma es del formato anterior (un total suelto sin prenda):
 *  esas no se cobran, no se duplican ni se imprimen. */
export function lineasDeLaProforma(items: unknown): LineaProforma[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!items.every((i) => typeof i === "object" && i !== null && typeof (i as { variante_id?: unknown }).variante_id === "string")) return null;
  return items as LineaProforma[];
}

/** La cuenta de la proforma, idéntica a la de `crear_proforma`. La base la vuelve a hacer y es la que manda;
 *  esto es para mostrarla mientras se arma y en la hoja A4. */
export function totalesDeLineas(lineas: Pick<LineaProforma, "cantidad" | "precio_unitario" | "descuento_unitario">[]) {
  const total = redondear(lineas.reduce((s, l) => s + (l.precio_unitario - l.descuento_unitario) * l.cantidad, 0));
  const igv = redondear(total - total / 1.18);
  return {
    total,
    igv,
    subtotal: redondear(total - igv),
    descuentos: redondear(lineas.reduce((s, l) => s + l.descuento_unitario * l.cantidad, 0)),
    prendas: lineas.reduce((s, l) => s + l.cantidad, 0),
  };
}

/** «PRO-000123»: cómo se nombra una proforma en el papel y en la búsqueda. */
export function numeroDeProforma(n: number | null): string {
  return n === null ? "PRO-—" : `PRO-${String(n).padStart(6, "0")}`;
}

/** Cómo entra una línea de la proforma al carrito del Punto de Venta. `registrar_venta` exige el precio de
 *  catálogo de HOY, así que lo prometido se expresa como descuento: se cobra lo menor entre lo cotizado y la
 *  etiqueta de hoy (decisión de Felipe: si subió, se respeta la proforma). Si el precio no cambió, el motivo
 *  es el de la proforma; si cambió, «otro» con el número de la proforma. La campaña del día la aplica después
 *  el carrito (gana el descuento mayor). */
export function precioAlCobrarDeLaProforma(linea: LineaProforma, precioHoy: number, numero: string) {
  const cotizado = redondear(linea.precio_unitario - linea.descuento_unitario);
  const descuentoUnitario = redondear(precioHoy - Math.min(cotizado, precioHoy));
  if (descuentoUnitario === 0) return { precioUnitario: precioHoy, descuentoUnitario: 0, motivo: "", motivoDetalle: "" };
  if (redondear(precioHoy) === redondear(linea.precio_unitario)) {
    return { precioUnitario: precioHoy, descuentoUnitario, motivo: linea.motivo_descuento ?? "", motivoDetalle: linea.motivo_descuento_detalle ?? "" };
  }
  return { precioUnitario: precioHoy, descuentoUnitario, motivo: "otro", motivoDetalle: `Precio de la proforma ${numero}` };
}
