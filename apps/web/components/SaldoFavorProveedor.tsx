import Link from "next/link";
import { BotonReembolso } from "@/components/SaldoFavorAcciones";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras-reglas";
import { ETIQUETA_MOVIMIENTO_CREDITO, type MovimientoCredito } from "@/lib/saldo-favor";

// «Saldo a favor» en la ficha del proveedor (ADR-0111, corrección 2026-09-18): lo que el proveedor le debe a
// CAYLA porque una nota de crédito superó lo que se le debía de su comprobante (típico: un faltante en una factura
// al contado, que ya estaba pagada). Se descuenta solo al pagar (Por pagar → Pagar) o se pide de vuelta
// (reembolso). El historial dice de dónde vino cada sol y adónde fue: es el libro `proveedor_creditos`, que nunca
// se edita, y el saldo es su suma.

export function SaldoFavorProveedor({
  proveedorId,
  proveedorNombre,
  saldo,
  movimientos,
  tieneDeuda,
  puedeReembolsar = true,
}: {
  proveedorId: string;
  proveedorNombre: string;
  saldo: number;
  movimientos: MovimientoCredito[];
  /** ¿Hay comprobantes por pagar de este proveedor? Solo entonces «Usar en un pago» lleva a algún lado. */
  tieneDeuda: boolean;
  /** Registrar un reembolso es de Por pagar (ADR-0161 P1, `fn_puede_pagar_compras`). */
  puedeReembolsar?: boolean;
}) {
  const hay = saldo > 0;
  return (
    // El ancla (#saldo-a-favor) y el nombre de la sección quedan en la <section>; la tarjeta es la pieza única de cifra
    // (TarjetaCifra, ADR-0358). Un saldo en cero es un dato: se ve normal, no apagado.
    <section id="saldo-a-favor" aria-label="Saldo a favor" className="scroll-mt-24">
      <TarjetaCifra etiqueta="Saldo a favor" punto={hay ? "verde" : "neutro"} valor={soles(saldo)} tono={hay ? "text-verde-profundo" : undefined}>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-tinta/70">
          {hay
            ? `Es plata que ${proveedorNombre} te debe: una nota de crédito superó lo que se le debía de su comprobante. Se descuenta de tu próximo pago (viene activado al pagar) o, si te la devuelve, lo registras como reembolso.`
            : "Sin saldo a favor. Aparece cuando una nota de crédito supera lo que se le debía al proveedor, por ejemplo un faltante en una factura al contado, que ya estaba pagada."}
        </p>
        {hay && (tieneDeuda || puedeReembolsar) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {tieneDeuda && (
              <Link href={`/compras/por-pagar?prov=${proveedorId}`} className="label-cayla text-[11px] text-rojo hover:underline">
                Usar en un pago →
              </Link>
            )}
            {puedeReembolsar && <BotonReembolso proveedorId={proveedorId} proveedorNombre={proveedorNombre} saldoFavor={saldo} />}
          </div>
        )}
        {movimientos.length > 0 && (
          <div className="mt-4 border-t border-tinta/10 pt-3">
            <p className="label-cayla text-[11px] text-tinta/55">Movimientos</p>
            <ul className="mt-1 divide-y divide-tinta/10">
              {movimientos.map((m) => {
                const suma = m.tipo === "nota_credito";
                const detalle = [
                  m.tipo === "nota_credito" ? [m.notaSerieNumero, m.documento && `sobre ${m.documento}`] : m.tipo === "aplicacion" ? [m.documento && `pagando ${m.documento}`] : [m.metodo && (ETIQUETA_METODO[m.metodo] ?? m.metodo), m.referencia],
              ]
                  .flat()
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={m.id} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="min-w-0">
                      <span className="text-sm text-tinta">{ETIQUETA_MOVIMIENTO_CREDITO[m.tipo]}</span>
                      {detalle && <span className="block truncate text-xs text-tinta/60">{detalle}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-sm tabular-nums ${suma ? "font-semibold text-verde-profundo" : "text-tinta"}`}>
                        {suma ? "+" : "−"} {soles(m.monto)}
                      </span>
                      <span className="block text-xs text-tinta/55">{fechaCorta(m.fecha)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </TarjetaCifra>
    </section>
  );
}
