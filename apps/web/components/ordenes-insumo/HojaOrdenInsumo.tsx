import { fechaCorta, soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { cantidadConUnidad, numeroOrdenInsumo, precioUnitarioTexto, textoCantidades, type DetalleOrdenInsumo } from "@/lib/ordenes-insumo-reglas";
import type { EmpresaDeLaOrden } from "@/components/ordenes-compra/HojaOrdenCompra";

/**
 * La orden de insumos en papel (ADR-0362, fase 7 · actividad 2): lo que se imprime o se guarda en PDF para mandarle al proveedor del
 * Taller. El MISMO papel que la orden de compra (`HojaOrdenCompra`, fase 1): A4, tinta sobre blanco, sin fondos ni grises, con sus
 * clases `oc-*` (`app/estilos/orden-compra-papel.css`). Cambia lo que es del Taller: el título, el número «OI-», el taller al que llega y
 * la línea —el insumo con su código, la cantidad EN SU UNIDAD y el precio por esa unidad con sus cuatro decimales si los usa—. Una
 * anulada lo dice arriba, grande, con su motivo: un papel viejo que circule no se confunde.
 *
 * Sin estado: lo dibuja quien lo monta (`AccionesOrdenInsumo`, pegado a <body> con un portal dentro de `#orden-insumo-print`).
 */
export function HojaOrdenInsumo({ orden: d, empresa }: { orden: DetalleOrdenInsumo; empresa: EmpresaDeLaOrden }) {
  const creada = diaYHoraLima(d.creadaEn);
  const nombre = empresa?.nombreComercial || "CAYLA";
  return (
    <article className="oc-papel">
      <header className="oc-cabecera">
        <div>
          <p className="oc-marca">{nombre.toUpperCase()}</p>
          {(empresa?.razonSocial || empresa?.ruc) && (
            <p className="oc-empresa">{[empresa?.razonSocial, empresa?.ruc ? `RUC ${empresa.ruc}` : null].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="oc-titulo">
          <p className="oc-titulo-tipo">Orden de compra de insumos</p>
          <p className="oc-titulo-numero">{numeroOrdenInsumo(d.numero)}</p>
          <p className="oc-titulo-fecha">Emitida el {fechaCorta(d.fechaEmision)}</p>
        </div>
      </header>

      {d.estado === "anulada" && <p className="oc-anulada">ANULADA{d.motivoAnulacion ? ` · ${d.motivoAnulacion}` : ""}</p>}

      <dl className="oc-datos">
        <div>
          <dt>Proveedor</dt>
          <dd>
            {d.proveedor.nombre}
            {d.proveedor.ruc && <span className="oc-ruc">RUC {d.proveedor.ruc}</span>}
          </dd>
        </div>
        <div>
          <dt>Llega a</dt>
          <dd>{d.destino.nombre}</dd>
        </div>
        <div>
          <dt>Entrega estimada</dt>
          <dd>{d.fechaEntregaEstimada ? fechaCorta(d.fechaEntregaEstimada) : "Por confirmar"}</dd>
        </div>
      </dl>

      <table className="oc-tabla">
        <thead>
          <tr>
            <th className="oc-num">#</th>
            <th>Insumo</th>
            <th className="oc-der">Cantidad</th>
            <th className="oc-der">Precio u.</th>
            <th className="oc-der">Descuento</th>
            <th className="oc-der">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {d.lineas.map((l) => (
            <tr key={l.posicion}>
              <td className="oc-num">{l.posicion}</td>
              <td>
                {l.insumo}
                {l.codigo && <span className="oc-suave"> · {l.codigo}</span>}
                {l.descripcion && <span className="oc-descripcion">{l.descripcion}</span>}
              </td>
              <td className="oc-der">{cantidadConUnidad(l.cantidad, l.unidadMedida)}</td>
              <td className="oc-der">{precioUnitarioTexto(l.precioUnitario)}</td>
              <td className="oc-der">
                {l.descuento > 0 ? (
                  <>
                    −{soles(l.descuento)}
                    {l.descuentoPct != null && <span className="oc-suave"> ({l.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %)</span>}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="oc-der">{soles(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              {d.lineas.length} {d.lineas.length === 1 ? "línea" : "líneas"}
              {d.cantidades.length > 0 && ` · ${textoCantidades(d.cantidades)}`}
            </td>
            <td colSpan={3} className="oc-der">
              Total
            </td>
            <td className="oc-der oc-total">{soles(d.total)}</td>
          </tr>
        </tfoot>
      </table>

      {d.nota && (
        <p className="oc-nota">
          <b>Nota:</b> {d.nota}
        </p>
      )}

      <p className="oc-pie">
        Generada por {d.creadaPor ?? "CAYLA"} el {creada.dia} a las {creada.hora}. Cantidades en la unidad de cada insumo; precios en soles.
      </p>
    </article>
  );
}
