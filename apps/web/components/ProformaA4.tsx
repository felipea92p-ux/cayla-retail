import { EMISOR, type Emisor } from "@/lib/emisor";
import { lineasDeLaProforma, numeroDeProforma, totalesDeLineas, type Proforma } from "@/lib/proformas-reglas";
import type { FotoDePrenda } from "@/lib/proformas";
import { fechaHoraLima } from "@/lib/recibo-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;
const ETIQUETA = "mr-[3pt] inline-block rounded-full border border-black/20 px-[5pt] text-[7pt] leading-[11pt] text-black/60";

/**
 * La hoja A4 de una proforma (maqueta C elegida por Felipe, 2026-09-22): la foto de cada prenda para que la
 * clienta recuerde qué se probó, talla y color como etiquetas, y todo lo que pide una proforma peruana — número,
 * fecha, validez, emisor con RUC, clienta, detalle, op. gravada, IGV, total y «no es comprobante de pago».
 * Solo pintura: las cuentas salen de `totalesDeLineas` sobre las líneas que guardó `crear_proforma` (la misma
 * fórmula de la base). Se imprime dentro de `#boleta-a4-print`: misma raíz, mismo `@page a4` y mismo CSS que la
 * boleta A4 (`globals.css`). Sin foto, un recuadro del color de la prenda.
 */
export function ProformaA4({
  proforma,
  tienda,
  fotos,
  emisor = EMISOR,
}: {
  proforma: Proforma;
  tienda: string;
  fotos: Record<string, FotoDePrenda>;
  emisor?: Emisor;
}) {
  const lineas = lineasDeLaProforma(proforma.items) ?? [];
  const t = totalesDeLineas(lineas);
  const emitida = fechaHoraLima(proforma.created_at).fecha;
  const vence = proforma.vence_at ? fechaHoraLima(proforma.vence_at).fecha : null;
  const doc = proforma.cliente_num_doc;

  return (
    <div data-testid="proforma-a4" className="mx-auto flex min-h-[268mm] w-[186mm] flex-col bg-white font-sans text-[9pt] leading-snug text-black">
      <header className="flex items-end justify-between gap-6 border-b-2 border-rojo pb-[3mm] [print-color-adjust:exact]">
        <div className="flex items-center gap-[4mm]">
          {/* eslint-disable-next-line @next/next/no-img-element -- se imprime: una <img> normal se decodifica antes de `print()` */}
          <img src="/cayla-isotipo.png" alt="" className="h-auto w-[13mm] shrink-0" />
          <div>
            <p className="font-display text-[22pt] leading-none tracking-[0.14em] text-rojo">{emisor.nombreComercial}</p>
            <p className="mt-[1mm] text-black/60">
              {emisor.razonSocial} · RUC {emisor.ruc}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[12pt] font-bold tracking-[0.1em]">PROFORMA {numeroDeProforma(proforma.numero)}</p>
          <p className="text-black/60">
            Emitida {emitida}
            {vence && (
              <>
                {" · "}
                <b className="text-rojo [print-color-adjust:exact]">válida hasta {vence}</b>
              </>
            )}
          </p>
        </div>
      </header>

      <section className="my-[4mm] flex flex-wrap gap-x-[12mm] gap-y-[2mm]">
        <p>
          <span className="text-black/55">Clienta</span>
          <br />
          <b>{proforma.cliente_nombre ?? "Cliente varios"}</b>
          {doc && (
            <>
              {" · "}
              {doc.length === 11 ? "RUC" : "DNI"} {doc}
            </>
          )}
        </p>
        <p>
          <span className="text-black/55">Tienda</span>
          <br />
          <b>{tienda}</b>
        </p>
      </section>

      <ul>
        {lineas.map((l, i) => {
          const foto = fotos[l.variante_id];
          const [referencia, ...detalle] = l.descripcion.split(" · ");
          const descuento = l.descuento_unitario * l.cantidad;
          return (
            <li key={`${l.variante_id}-${i}`} className="flex items-center gap-[4mm] border-b border-black/10 py-[2.5mm] [break-inside:avoid]">
              {foto?.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- se imprime: se decodifica antes de `print()`
                <img src={foto.fotoUrl} alt="" className="h-[15mm] w-[12mm] shrink-0 rounded-[1mm] object-cover" />
              ) : (
                <span aria-hidden className="h-[15mm] w-[12mm] shrink-0 rounded-[1mm] border border-black/10 [print-color-adjust:exact]" style={{ background: foto?.colorHex ?? "#e9e2d6" }} />
              )}
              <div className="min-w-0 flex-1">
                <b className="text-[10pt]">{referencia}</b>
                <br />
                {detalle.map((d) => (
                  <span key={d} className={ETIQUETA}>
                    {d}
                  </span>
                ))}
                {l.codigo && <span className="text-black/55">{l.codigo}</span>}
              </div>
              <p className="w-[24mm] text-right tabular-nums text-black/60">
                {l.cantidad} × {l.precio_unitario.toFixed(2)}
              </p>
              <p className="w-[26mm] text-right tabular-nums">
                {descuento > 0 && <span className="block text-black/55">− {descuento.toFixed(2)}</span>}
                <b>{s((l.precio_unitario - l.descuento_unitario) * l.cantidad)}</b>
              </p>
            </li>
          );
        })}
      </ul>

      <section className="mt-[4mm] flex justify-between gap-[6mm] [break-inside:avoid]">
        {proforma.nota ? (
          <div className="max-w-[95mm] self-start rounded-[1.5mm] bg-[#faf6f0] px-[3mm] py-[2.5mm] [print-color-adjust:exact]">
            <p className="text-black/55">Nota</p>
            <p>{proforma.nota}</p>
          </div>
        ) : (
          <span />
        )}
        <table className="w-[64mm] tabular-nums">
          <tbody>
            <tr>
              <td className="text-black/55">
                {t.prendas} {t.prendas === 1 ? "prenda" : "prendas"} · descuentos
              </td>
              <td className="text-right">− {s(t.descuentos)}</td>
            </tr>
            <tr>
              <td className="text-black/55">Op. gravada</td>
              <td className="text-right">{s(t.subtotal)}</td>
            </tr>
            <tr>
              <td className="text-black/55">IGV 18 %</td>
              <td className="text-right">{s(t.igv)}</td>
            </tr>
            <tr className="text-[12pt] font-bold">
              <td className="pt-[1mm]">Total</td>
              <td className="pt-[1mm] text-right">{s(t.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-auto border-t border-black/15 pt-[2mm] text-[7.5pt] text-black/60">
        <p>
          {emisor.direccion.join(", ")} · {[emisor.telefono, emisor.email, emisor.web].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-[1mm]">
          Precios en soles con IGV, válidos hasta la fecha indicada. Las prendas no quedan reservadas: se confirman al comprar.{" "}
          <b className="text-black">Este documento no es un comprobante de pago.</b>
        </p>
      </footer>
    </div>
  );
}
