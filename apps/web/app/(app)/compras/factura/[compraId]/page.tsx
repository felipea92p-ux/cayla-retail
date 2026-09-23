import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermiso } from "@/lib/persona-actual";
import { CompraDetalle, DatosComprobante, TituloComprobante, cargarDetalleCompra } from "@/components/CompraDetalle";

// Página completa del detalle de una factura. Es lo que se ve al entrar por
// enlace directo o al recargar; viniendo desde una lista de Compras, el
// mismo detalle se abre como modal encima de la lista
// (`../../@modal/(.)factura/[compraId]/page.tsx`). El cuerpo es el mismo componente;
// acá solo cambia el marco: enlace «← Comprobantes» en lugar de la X y el mismo título/bajada que el modal.
export default async function CompraDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ compraId: string }>;
  searchParams: Promise<{ adjuntos_fallidos?: string }>;
}) {
  // ADR-0161 P3: el layout de /compras también deja entrar a quien solo tiene Proveedores; un comprobante es dinero.
  await exigirPermiso("verDineroCompras");
  const { compraId } = await params;
  // Nombres de archivos que no se pudieron subir al registrar (los manda
  // CompraFormV2 por la URL, separados por "|").
  const { adjuntos_fallidos } = await searchParams;
  const adjuntosFallidos = adjuntos_fallidos ? adjuntos_fallidos.split("|").filter(Boolean) : [];
  const detalle = await cargarDetalleCompra(compraId);
  if (!detalle) notFound();
  const { compra } = detalle;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/compras" className="label-cayla inline-block text-[11px] text-tinta/65 transition-colors hover:text-rojo">
        ← Comprobantes
      </Link>
      <div>
        <h1 className="font-display text-tinta">
          <TituloComprobante compra={compra} />
        </h1>
        <p className="mt-1 text-xs text-tinta/70">
          <DatosComprobante compra={compra} destino={detalle.destino} />
        </p>
      </div>

      <CompraDetalle detalle={detalle} adjuntosFallidos={adjuntosFallidos} />
    </div>
  );
}
