import { QRCodeSVG } from "qrcode.react";
import { DIAS_PLAZO_CAMBIO } from "@/lib/cambios-reglas";
import { EMISOR, type Emisor } from "@/lib/emisor";
import { lineasA4, numeroA4 } from "@/lib/boleta-a4-reglas";
import { fechaHoraLima, montoEnLetras, NOMBRE_METODO, textoQrSunat, TITULO_DOCUMENTO, type ReciboVenta } from "@/lib/recibo-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;
// Tinte suave para los encabezados: se imprime con `print-color-adjust: exact` pero, si la
// impresora es en blanco y negro, el filete y el texto siguen diciendo todo.
/** El texto chico y de bajo contraste del margen izquierdo, como el que ponía Alegra (allá, a la derecha). */
const TEXTO_LATERAL = "Generado por Cayla POS - Contacto: info@cayla.pe";
const cab = "border-y border-black/60 bg-[#f1ece4] px-2 py-1.5 text-[7.5pt] font-semibold uppercase tracking-wide [print-color-adjust:exact]";

/**
 * La representación impresa A4 de una boleta o factura electrónica. Solo pintura: todo número
 * viene de `ReciboVenta` (la misma cuenta del ticket) y de `lineasA4`. De la resolución del
 * PSE solo se imprime la que esté configurada en `emisor` (la de Alegra NO es la nuestra).
 */
export function BoletaA4({
  recibo,
  emisor = EMISOR,
  vendedor = null,
  hash = null,
  leyenda = null,
}: {
  recibo: ReciboVenta;
  emisor?: Emisor;
  vendedor?: string | null;
  hash?: string | null;
  /** «Comprobante pendiente de validación en SUNAT.», si aplica. */
  leyenda?: string | null;
}) {
  const { fecha, hora } = fechaHoraLima(recibo.emitidoEn);
  const cli = recibo.cliente;
  const tieneDoc = cli.tipoDoc !== "sin_documento" && !!cli.numDoc;
  const esFactura = recibo.tipo === "factura";
  const lineas = lineasA4(recibo);
  const qr = emisor.ruc ? textoQrSunat(recibo, emisor.ruc) : null;
  const nombreDoc = esFactura ? "factura" : "boleta de venta";

  return (
    <div data-testid="boleta-a4" className="boleta-a4 relative mx-auto w-[186mm] bg-white font-sans text-[9pt] leading-snug text-black">
      {/* Vertical, de abajo hacia arriba, dentro del margen de 12 mm de la hoja. */}
      <p aria-hidden className="absolute top-1/2 -left-[8mm] rotate-180 -translate-y-1/2 whitespace-nowrap text-[6.5pt] text-black/40 [writing-mode:vertical-rl]">
        {TEXTO_LATERAL}
      </p>
      {/* ---------- Cabecera ---------- */}
      <header className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- se imprime: una <img> normal se decodifica antes de `print()` */}
          <img src="/cayla-isotipo.png" alt="" className="h-auto w-16 shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-[22pt] leading-none tracking-[0.14em] text-rojo">{emisor.nombreComercial}</p>
            <p className="mt-1.5 font-semibold">{emisor.razonSocial}</p>
            <p className="text-[8pt] text-black/75">{emisor.direccion.join(" · ")}</p>
            <p className="text-[8pt] text-black/75">{[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="w-[62mm] shrink-0 rounded-md border-[1.4pt] border-black px-3 py-2.5 text-center">
          <p className="text-[9.5pt] font-semibold">RUC {emisor.ruc}</p>
          <p className="mt-1 text-[10pt] font-bold leading-tight">{TITULO_DOCUMENTO[recibo.tipo]}</p>
          <p className="mt-1.5 font-mono text-[12.5pt] font-bold tabular-nums">{numeroA4(recibo)}</p>
        </div>
      </header>

      {leyenda && <p className="mt-3 rounded border border-black/60 px-3 py-1.5 text-center text-[8.5pt] font-semibold">{leyenda}</p>}

      {/* ---------- Clienta y fechas ---------- */}
      <section className="mt-5 grid grid-cols-[1fr_auto] gap-x-8 rounded-md border border-black/50 px-4 py-3 text-[8.5pt]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-semibold uppercase">Señor(es)</dt>
          <dd>{cli.nombre?.trim() || "Cliente general"}</dd>
          <dt className="font-semibold uppercase">{cli.tipoDoc === "ruc" ? "RUC" : "DNI"}</dt>
          <dd>{tieneDoc ? cli.numDoc : "—"}</dd>
          {esFactura && (
            <>
              <dt className="font-semibold uppercase">Dirección</dt>
              <dd className="min-h-[1.2em] border-b border-black/30" />
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
          <dt className="font-semibold uppercase">Emisión</dt>
          <dd className="tabular-nums">
            {fecha} · {hora}
          </dd>
          <dt className="font-semibold uppercase">Vence</dt>
          <dd className="tabular-nums">{fecha}</dd>
          <dt className="font-semibold uppercase">Moneda</dt>
          <dd>Soles (PEN)</dd>
          <dt className="font-semibold uppercase">Tienda</dt>
          <dd>{recibo.sede}</dd>
        </dl>
      </section>

      {/* ---------- Ítems: la tabla crece con las líneas y repite su encabezado al cambiar de página ---------- */}
      <table className="mt-4 w-full border-collapse text-[8.5pt]">
        <thead className="table-header-group">
          <tr>
            <th className={`${cab} w-[11mm] text-center`}>Cant.</th>
            <th className={`${cab} w-[15mm] text-center`}>Unidad</th>
            <th className={`${cab} text-left`}>Descripción</th>
            <th className={`${cab} w-[23mm] text-right`}>V. unitario</th>
            <th className={`${cab} w-[19mm] text-right`}>Dscto.</th>
            <th className={`${cab} w-[24mm] text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className="break-inside-avoid border-b border-black/15 align-top">
              <td className="px-2 py-1.5 text-center tabular-nums">{l.cantidad}</td>
              <td className="px-2 py-1.5 text-center">{l.unidad}</td>
              <td className="px-2 py-1.5">
                {l.descripcion}
                {(l.detalle || l.codigo) && <span className="block text-[7.5pt] text-black/60">{[l.detalle, l.codigo].filter(Boolean).join(" · ")}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s(l.valorUnitario)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.descuento > 0 ? s(l.descuento) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 border-t border-black/60 pt-2 text-[8.5pt]">
        <b>SON:</b> {montoEnLetras(recibo.total)}
      </p>

      {/* ---------- Banda inferior: QR y pago a la izquierda, importes a la derecha ---------- */}
      <section className="mt-5 grid break-inside-avoid grid-cols-[1fr_66mm] gap-8">
        <div className="flex gap-4">
          {qr && <QRCodeSVG value={qr} size={256} level="M" marginSize={0} style={{ width: "27mm", height: "27mm", flexShrink: 0 }} />}
          <div className="min-w-0 space-y-2 text-[8pt] text-black/80">
            <div>
              <p className="font-semibold uppercase">Forma de pago</p>
              {recibo.pagos.map((p) => (
                <p key={p.metodo}>
                  {NOMBRE_METODO[p.metodo]} {s(p.monto)}
                  {p.recibido !== null && p.metodo === "efectivo" && ` · recibió ${s(p.recibido)} · vuelto ${s(p.vuelto)}`}
                </p>
              ))}
            </div>
            {vendedor && <p>Atendió: {vendedor}</p>}
            {hash && <p className="break-all text-[6.5pt] text-black/55">Hash: {hash}</p>}
          </div>
        </div>
        <table className="h-fit w-full text-[8.5pt] tabular-nums">
          <tbody>
            <tr>
              <td className="py-0.5 text-right">Importe de venta</td>
              <td className="w-[26mm] py-0.5 text-right">{s(recibo.total)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-right">Op. gravada</td>
              <td className="py-0.5 text-right">{s(recibo.subtotal)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-right">Op. inafecta</td>
              <td className="py-0.5 text-right">{s(0)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-right">Op. exonerada</td>
              <td className="py-0.5 text-right">{s(0)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-right">IGV (18.00%)</td>
              <td className="py-0.5 text-right">{s(recibo.igv)}</td>
            </tr>
            <tr className="border-y-[1.4pt] border-black bg-[#f1ece4] text-[11pt] font-bold [print-color-adjust:exact]">
              <td className="px-2 py-1.5 text-right">TOTAL</td>
              <td className="py-1.5 text-right">{s(recibo.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------- Notas ---------- */}
      <section className="mt-5 break-inside-avoid text-[8pt] text-black/75">
        <p className="font-semibold uppercase text-black">Notas</p>
        <p>Cambios dentro de los {DIAS_PLAZO_CAMBIO} días posteriores a la compra, con este comprobante.</p>
        {emisor.web && <p>Visite {emisor.web} para más.</p>}
      </section>

      {/* La firma solo tiene sentido en la factura; en la boleta de contado sobra. */}
      {esFactura && (
        <section className="mt-12 grid break-inside-avoid grid-cols-2 gap-16 text-center text-[8pt]">
          <p className="border-t border-black/60 pt-1">ELABORADO POR</p>
          <p className="border-t border-black/60 pt-1">ACEPTADA, FIRMA Y/O SELLO Y FECHA</p>
        </section>
      )}

      <footer className="mt-6 break-inside-avoid text-center text-[8pt]">
        <p className="font-semibold">Representación impresa de la {nombreDoc} electrónica</p>
        {emisor.resolucion && <p>Autorizado mediante resolución N° {emisor.resolucion}</p>}
      </footer>
    </div>
  );
}
