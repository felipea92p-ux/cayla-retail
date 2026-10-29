import { notaSinEnvio } from "./compras-reglas";
import type { LineaRecepcion, RecepcionReciente } from "./compras-reglas";
import { matricesDeRecepcion, type MatrizModelo } from "./recepcion-matriz-reglas";

/**
 * «Terminados» por ENVÍO (Felipe 2026-10-28): un fardo puede traer prendas de dos proveedores y la base guarda un lote por proveedor
 * (`lotes_despacho_proveedor_unico`). La lista de lo recibido junta esos lotes en una sola fila por envío; una llegada sin envío
 * (Llegó mercadería, sin aviso) queda como fila propia, para que no desaparezca nada de lo recibido.
 */
export type EnvioRecibido = {
  /** El `despachoId`, o el `loteId` de una llegada sin envío. */
  clave: string;
  /** «ENV-000254»; `null` en una llegada sin envío. */
  numero: string | null;
  fecha: string;
  /** Cuándo la sede abrió el envío para recibirlo (`despachos.abierto_en`); `null` en una llegada sin envío o si la base no lo dio. */
  llegoEn: string | null;
  ubicacion: string;
  /** Sin repetir, en el orden en que aparecen. */
  proveedores: string[];
  recibidoPor: string | null;
  unidades: number;
  lineas: number;
  lotes: RecepcionReciente[];
};

export function agruparPorEnvio(recepciones: readonly RecepcionReciente[]): EnvioRecibido[] {
  const porClave = new Map<string, EnvioRecibido>();
  for (const r of recepciones) {
    const clave = r.despachoId ?? r.loteId;
    const e = porClave.get(clave);
    const nombre = r.proveedorNombre || notaSinEnvio(r.nota) || "Sin proveedor";
    if (!e) {
      porClave.set(clave, {
        clave,
        numero: r.despachoId ? r.envioNumero : null,
        fecha: r.fecha,
        llegoEn: r.llegoEn ?? null,
        ubicacion: r.ubicacion,
        proveedores: [nombre],
        recibidoPor: r.recibidoPor,
        unidades: r.unidades,
        lineas: r.lineas,
        lotes: [r],
      });
      continue;
    }
    if (!e.proveedores.includes(nombre)) e.proveedores.push(nombre);
    if (r.fecha > e.fecha) e.fecha = r.fecha;
    if (r.llegoEn && (!e.llegoEn || r.llegoEn < e.llegoEn)) e.llegoEn = r.llegoEn;
    e.recibidoPor ??= r.recibidoPor;
    e.unidades += r.unidades;
    e.lineas += r.lineas;
    e.lotes.push(r);
  }
  return [...porClave.values()];
}

/** Una prenda de un envío (de un lote, o sea de un proveedor): cuántas entraron y su matriz de colores y tallas. */
export type PrendaRecibida = { clave: string; modelo: string; sku: string | null; loteId: string; proveedor: string; unidades: number; matriz: MatrizModelo };

export function prendasDelEnvio(e: EnvioRecibido): PrendaRecibida[] {
  return e.lotes.flatMap((l) =>
    matricesDeRecepcion(l.detalle).map((m) => {
      const primera: LineaRecepcion | undefined = l.detalle.find((d) => d.referencia === m.modelo);
      return {
        clave: `${l.loteId}|${m.modelo}`,
        modelo: m.modelo,
        sku: primera?.sku ? primera.sku.replace(/-[^-]+-[^-]+$/, "") : null,
        loteId: l.loteId,
        proveedor: l.proveedorNombre || notaSinEnvio(l.nota) || "Sin proveedor",
        unidades: m.total,
        matriz: m,
      };
    }),
  );
}
