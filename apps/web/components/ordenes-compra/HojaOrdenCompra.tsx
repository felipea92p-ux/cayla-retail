import { fechaCorta, soles } from "@/lib/compras-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { lugarDeLlegada, numeroOrdenCompra, type DetalleOrden } from "@/lib/ordenes-compra-reglas";

/** Quién emite la orden, para la cabecera del papel (`configuracion_empresa`). Sin datos, el papel dice solo «CAYLA». */
export type EmpresaDeLaOrden = { razonSocial: string | null; ruc: string | null; nombreComercial: string | null } | null;

/**
 * La orden de compra en papel (ADR-0362, fase 1 · actividad 6): lo que se imprime o se guarda en PDF para mandarle al proveedor
 * (decisión 1). A4, tinta sobre blanco, sin fondos ni grises (Chrome no imprime fondos), como la guía de traslado: la jerarquía sale del
 * tamaño, del peso y de las reglas. Una anulada lo dice arriba, grande, con su motivo: un papel viejo que circule no se confunde.
 *
 * Sin estado: lo dibuja quien lo monta (`AccionesOrden`, pegado a <body> con un portal). Estilos: `app/estilos/orden-compra-papel.css`.
 */
export function HojaOrdenCompra({ orden: d, empresa }: { orden: DetalleOrden; empresa: EmpresaDeLaOrden }) {
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
          <p className="oc-titulo-tipo">Orden de compra</p>
          <p className="oc-titulo-numero">{numeroOrdenCompra(d.numero)}</p>
          <p className="oc-titulo-fecha">Emitida el {fechaCorta(d.fechaEmision)}</p>
        </div>
      </header>

      {d.estado === "anulada" && (
        <p className="oc-anulada">
          ANULADA{d.motivoAnulacion ? ` · ${d.motivoAnulacion}` : ""}
        </p>
      )}

      <dl className="oc-datos">
        <div>
          <dt>Proveedor</dt>
          <dd>
            {d.proveedor.nombre}
            {d.proveedor.ruc && <span className="oc-ruc">RUC {d.proveedor.ruc}</span>}
          </dd>
        </div>
        <div>
          {/* El lugar bajo su rótulo, como en la pantalla: «Destino: Llega a…» lo decía dos veces. */}
          <dt>Llega a</dt>
          <dd>{lugarDeLlegada(d.destino?.nombre ?? null)}</dd>
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
            <th>Prenda</th>
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
                {l.categoria} · {l.marca}
                {l.descripcion && <span className="oc-descripcion">{l.descripcion}</span>}
              </td>
              <td className="oc-der">{l.cantidad.toLocaleString("es-PE")}</td>
              <td className="oc-der">{soles(l.precioUnitario)}</td>
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
              {d.lineas.length} {d.lineas.length === 1 ? "línea" : "líneas"} · {d.unidades.toLocaleString("es-PE")} {d.unidades === 1 ? "unidad" : "unidades"}
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
        Generada por {d.creadaPor ?? "CAYLA"} el {creada.dia} a las {creada.hora}. Precios en soles.
      </p>
    </article>
  );
}
