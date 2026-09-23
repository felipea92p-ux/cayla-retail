import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirPermiso } from "@/lib/persona-actual";
import { getCompra } from "@/lib/compras";
import { getMiParteDeCompra } from "@/lib/compras-mi-parte";
import { compraParaPagarMiParte, parteDelDetalle } from "@/lib/compras-mi-parte-reglas";
import { ETIQUETA_METODO, ETIQUETA_TIPO_DOCUMENTO, fechaCorta, soles } from "@/lib/compras-reglas";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Chip } from "@/components/ui/Chip";
import { BotonPagar } from "@/components/CompraDetallePanel";

// ADR-0151 (F3-b): el detalle de la parte de MI tienda en un comprobante que gestiona OTRA tienda. Muestra la cabecera sin los
// montos del comprobante entero, lo que le toca a mi tienda (subtotal, IGV, total, pagado, saldo), mis líneas con mis unidades
// y los pagos de mi tienda — todo sale de `fn_mi_parte_de_compra`, que no devuelve nada de la otra tienda. Quien ve el
// comprobante entero (líder o tienda gestora) va al detalle de siempre.
export default async function MiParteDeCompraPage({ params }: { params: Promise<{ compraId: string }> }) {
  const persona = await exigirPermiso("verDineroCompras");
  const { compraId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(compraId)) notFound();

  const [entera, detalle] = await Promise.all([getCompra(compraId), persona.rol === "lider" ? null : getMiParteDeCompra(compraId)]);
  if (entera) redirect(`/compras/factura/${compraId}`);
  if (!detalle) notFound();

  const { compra, partes, lineas, pagos } = detalle;
  const nombreTienda = Object.fromEntries(partes.map((p) => [p.ubicacionId, p.ubicacionNombre]));
  const varias = partes.length > 1;

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Compras · Tu parte"
        titulo={`${ETIQUETA_TIPO_DOCUMENTO[compra.tipo]} ${compra.documento}`}
        bajada={`${compra.proveedorNombre} · lo gestiona ${compra.gestoraNombre}, que tiene el papel. Aquí ves y pagas solo lo que le toca a tu tienda.`}
        acciones={
          <Link href="/compras/por-pagar" className="btn-cayla btn-secundario">
            Volver a Por pagar
          </Link>
        }
      >
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-taupe">
          Emitido {fechaCorta(compra.fechaEmision)}
          {compra.fechaVencimiento ? ` · vence ${fechaCorta(compra.fechaVencimiento)}` : ""}
          {!compra.vigente && <Chip tono="apagado">Anulado</Chip>}
        </p>
      </CabeceraPantalla>

      {partes.map((p, i) => (
        <section key={p.ubicacionId} className="card-cayla p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label-cayla text-[11px] text-taupe">{varias ? `Parte de ${p.ubicacionNombre}` : `Parte de tu tienda · ${p.ubicacionNombre}`}</p>
              <p className="font-display mt-1 text-3xl tabular-nums text-tinta">{soles(p.total)}</p>
              <p className="mt-1 text-xs tabular-nums text-taupe">
                {p.unidades} u · subtotal {soles(p.subtotal)} + IGV {soles(p.igv)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm tabular-nums text-tinta">Pagado {soles(p.pagado)}</p>
              <p className={`mt-0.5 text-sm tabular-nums ${p.saldo > 0 ? "text-tinta" : "text-verde"}`}>{p.saldo > 0 ? `Por pagar ${soles(p.saldo)}` : "Pagada"}</p>
              <div className="mt-3">
                <BotonPagar compra={compraParaPagarMiParte(parteDelDetalle(detalle, i))} misTiendas={[{ id: p.ubicacionId, nombre: p.ubicacionNombre }]} />
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="card-cayla p-5">
        <h2 className="font-display text-lg text-tinta">Lo que llega para tu tienda</h2>
        <ul className="mt-3 divide-y divide-tinta/10 text-sm">
          {lineas.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
              <span className="min-w-0 text-tinta">
                {l.referencia || l.descripcion || "—"}
                {l.talla || l.color ? <span className="text-tinta/65"> · {[l.talla, l.color].filter(Boolean).join(" · ")}</span> : null}
                {varias ? <span className="text-taupe"> · {nombreTienda[l.ubicacionId]}</span> : null}
              </span>
              <span className="tabular-nums text-tinta/80">
                {l.cantidad} × {soles(l.costoUnitario)} = <span className="text-tinta">{soles(l.subtotal)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="nota-cayla mt-4">Los costos van sin IGV; el total de arriba lo suma. La mercadería se recibe en Recibir mercadería, como siempre.</p>
      </section>

      <section className="card-cayla p-5">
        <h2 className="font-display text-lg text-tinta">Pagos de tu tienda</h2>
        {pagos.length === 0 ? (
          <p className="mt-2 text-sm text-taupe">Tu tienda todavía no pagó nada de este comprobante.</p>
        ) : (
          <ul className="mt-3 divide-y divide-tinta/10 text-sm">
            {pagos.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
                <span className="text-tinta">
                  {fechaCorta(g.fecha)} · {ETIQUETA_METODO[g.metodo as keyof typeof ETIQUETA_METODO] ?? g.metodo}
                  {g.referencia ? <span className="text-tinta/65"> · {g.referencia}</span> : null}
                  {varias ? <span className="text-taupe"> · {nombreTienda[g.ubicacionId]}</span> : null}
                </span>
                <span className="tabular-nums text-tinta">{soles(g.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
