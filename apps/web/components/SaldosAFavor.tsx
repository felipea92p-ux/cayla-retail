import Link from "next/link";
import { soles } from "@/lib/compras-reglas";

// «A favor con proveedores» en Por pagar (ADR-0111, corrección 2026-09-18): antes de pagar hay que saber a quién
// le debemos y quién nos debe a nosotros. Una nota de crédito que superó lo que se le debía a un proveedor (típico:
// faltante en una factura al contado) deja saldo a favor, y ese saldo se descuenta al pagarle. Por proveedor se ve
// cuánto se le debe, cuánto tiene a favor y cuánto queda por transferir de verdad si se usa; el enlace lleva a
// pagarle (con el saldo ya ofrecido en el modal) o a su ficha (historial y reembolso).

export type SaldoAFavor = { proveedorId: string; nombre: string; saldoFavor: number; deuda: number };

export function SaldosAFavor({ saldos, indice = 0 }: { saldos: SaldoAFavor[]; /** Posición en la entrada escalonada de la pantalla. */ indice?: number }) {
  if (saldos.length === 0) return null;
  const total = Math.round(saldos.reduce((a, s) => a + s.saldoFavor, 0) * 100) / 100;
  return (
    <section aria-labelledby="a-favor-titulo" className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: indice }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
        <p id="a-favor-titulo" className="label-cayla flex items-center gap-2 text-[11px] text-tinta/65">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-verde" />
          A favor con proveedores
        </p>
        <p className="text-sm tabular-nums text-verde-profundo">
          <b className="font-semibold">{soles(total)}</b> <span className="text-xs text-tinta/60">que te deben · se descuenta al pagar</span>
        </p>
      </div>
      <div className="divide-y divide-tinta/10">
        {saldos.map((s) => {
          const cubre = Math.min(s.saldoFavor, s.deuda);
          return (
            <div key={s.proveedorId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/compras/proveedores/${s.proveedorId}#saldo-a-favor`} className="text-sm text-tinta hover:text-rojo hover:underline">
                  {s.nombre}
                </Link>
                <p className="text-xs text-tinta/60">
                  {s.deuda > 0
                    ? `Le debes ${soles(s.deuda)} · con tu saldo a favor solo transferirías ${soles(Math.max(0, Math.round((s.deuda - cubre) * 100) / 100))}`
                    : "Sin deuda pendiente: queda a tu favor para su próxima compra, o pídele el reembolso."}
                </p>
                {/* Cuánto de la deuda cubre el saldo a favor: la proporción se ve sin leer las cifras. Se llena una vez al llegar. */}
                {s.deuda > 0 && (
                  <div aria-hidden className="mt-2 h-[5px] max-w-[21rem] overflow-hidden rounded-full bg-sand">
                    <div className="anim-crece-x h-full origin-left rounded-full bg-verde" style={{ width: `${Math.min(100, Math.round((cubre / s.deuda) * 100))}%` }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold tabular-nums text-verde-profundo">{soles(s.saldoFavor)}</span>
                {/* `marcar=1`: llega con los comprobantes de este proveedor ya marcados y la barra de «Pagar juntos» abierta. */}
                {s.deuda > 0 ? (
                  <Link href={`/compras/por-pagar?prov=${s.proveedorId}&marcar=1`} className="label-cayla group text-[11px] text-rojo hover:underline">
                    Pagar con este saldo <span aria-hidden className="inline-block transition-transform duration-300 ease-cayla group-hover:translate-x-1">→</span>
                  </Link>
                ) : (
                  <Link href={`/compras/proveedores/${s.proveedorId}#saldo-a-favor`} className="label-cayla text-[11px] text-rojo hover:underline">
                    Ver →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
