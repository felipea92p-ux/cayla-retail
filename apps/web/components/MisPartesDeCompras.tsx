"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { BotonPagar } from "@/components/CompraDetallePanel";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import { compraParaPagarMiParte, type ParteDeCompra } from "@/lib/compras-mi-parte-reglas";

// ADR-0179 (F3-b): la parte de mi tienda en comprobantes que gestiona OTRA tienda. La tienda que registró tiene el papel; esta
// tienda recibe su mercadería y paga lo suyo desde aquí. Se muestran SU monto y SU saldo, nunca los del comprobante entero
// (la base ni siquiera se los da). «Parte nueva» es el aviso a la tienda que no registró: llegó hace poco y todavía no pagó nada.
export function MisPartesDeCompras({
  partes,
  pagar = false,
  indice = 0,
}: {
  partes: ParteDeCompra[];
  /** En Por pagar: un botón «Pagar» por fila (desde la tienda de esa parte). */
  pagar?: boolean;
  indice?: number;
}) {
  const router = useRouter();
  if (partes.length === 0) return null;
  const nuevas = partes.filter((p) => p.parteNueva).length;
  return (
    <section className="card-cayla anim-entra p-5" style={{ ["--i" as string]: indice }} aria-labelledby="mis-partes-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mis-partes-titulo" className="font-display text-lg text-tinta">
          Tu parte en comprobantes de otras tiendas
        </h2>
        {nuevas > 0 && (
          <Chip tono="rojo">
            {nuevas === 1 ? "1 parte nueva" : `${nuevas} partes nuevas`}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-taupe">
        Otra tienda registró el comprobante y tiene el papel. Tu tienda paga solo lo suyo; lo recibes, como siempre, en Recibir mercadería.
      </p>
      <ul className="mt-4 divide-y divide-tinta/10">
        {partes.map((p) => (
          <li key={`${p.compraId}-${p.ubicacionId}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-tinta">
                <Link href={`/compras/parte/${p.compraId}`} className="font-medium hover:text-rojo hover:underline">
                  {p.documento}
                </Link>
                <span className="text-tinta/65">· {p.proveedorNombre}</span>
                {p.parteNueva && <Chip tono="rojo">Parte nueva</Chip>}
                {!p.vigente && <Chip tono="apagado">Anulado</Chip>}
              </p>
              <p className="mt-0.5 text-xs text-taupe">
                Lo gestiona {p.gestoraNombre} · para {p.ubicacionNombre}: {p.unidades} u · emitido {fechaCorta(p.fechaEmision)}
                {p.fechaVencimiento ? ` · vence ${fechaCorta(p.fechaVencimiento)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <p className="text-tinta">
                  Tu parte <span className="tabular-nums">{soles(p.total)}</span>
                </p>
                <p className={`text-xs tabular-nums ${p.saldo > 0 ? "text-tinta/80" : "text-verde"}`}>{p.saldo > 0 ? `Por pagar ${soles(p.saldo)}` : "Pagada"}</p>
              </div>
              {pagar && p.vigente && p.saldo > 0 && (
                <BotonPagar
                  compacto
                  compra={compraParaPagarMiParte(p)}
                  misTiendas={[{ id: p.ubicacionId, nombre: p.ubicacionNombre }]}
                  onPagado={() => router.refresh()}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
