import Link from "next/link";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { fechaCorta, type RecepcionReciente } from "@/lib/compras-reglas";

const PLANTILLA = "sm:grid-cols-[6rem_1fr_7rem]";

/**
 * Listado de recepciones ya hechas (`getRecepcionesRecientes`) — con o sin
 * factura, la misma tabla para las dos pantallas de "Recibir mercadería"
 * (2026-09-17). Antes de esto, ninguna de las dos dejaba ver qué había
 * entrado: `/compras/recibir` solo mostraba lo pendiente, y
 * `/inventario/recibir` era siempre un formulario en blanco.
 */
export function RecepcionesRecientes({ recepciones, vacio }: { recepciones: RecepcionReciente[]; vacio: string }) {
  if (recepciones.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;
  }
  return (
    <Tabla>
      <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Fecha" }, { titulo: "Proveedor · guía" }, { titulo: "Unidades", alinear: "der" }]} />
      {recepciones.map((r) => (
        <div key={r.loteId} className={fila(PLANTILLA)}>
          <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(r.fecha)}</span>
          <span className={celda("izq")}>
            {r.conFactura && r.compraId ? (
              <Link href={`/compras/factura/${r.compraId}`} className="text-sm font-medium text-tinta hover:text-rojo hover:underline">
                {r.proveedorNombre}
                {r.documento ? ` · ${r.documento}` : ""}
              </Link>
            ) : (
              <span className="text-sm font-medium text-tinta">{r.proveedorNombre}</span>
            )}
            <span className="block truncate text-xs text-tinta/65">
              {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} · {r.ubicacion}
              {r.recibidoPor ? ` · ${r.recibidoPor}` : ""}
            </span>
          </span>
          <span className={celda("der", "text-sm text-tinta")}>
            {r.unidades} {r.unidades === 1 ? "unidad" : "unidades"}
            <span className="block text-xs text-tinta/55">{r.lineas} {r.lineas === 1 ? "línea" : "líneas"}</span>
          </span>
        </div>
      ))}
    </Tabla>
  );
}
