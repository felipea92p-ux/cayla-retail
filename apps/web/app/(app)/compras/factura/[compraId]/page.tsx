import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { CompraDetalle, FichaCompra, cargarDetalleCompra, tipoCompra } from "@/components/CompraDetalle";

// Página completa del detalle de una factura. Es lo que se ve al entrar por
// enlace directo o al recargar; viniendo desde una lista de Compras, el
// mismo detalle se abre como modal encima de la lista
// (`../../@modal/(.)factura/[compraId]/page.tsx`). El cuerpo es el mismo componente;
// acá solo cambia el marco: miga de pan y título grande.
export default async function CompraDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ compraId: string }>;
  searchParams: Promise<{ adjuntos_fallidos?: string }>;
}) {
  await requirePersonaActualV2();
  const { compraId } = await params;
  // Nombres de archivos que no se pudieron subir al registrar (los manda
  // CompraFormV2 por la URL, separados por "|").
  const { adjuntos_fallidos } = await searchParams;
  const adjuntosFallidos = adjuntos_fallidos ? adjuntos_fallidos.split("|").filter(Boolean) : [];
  const detalle = await cargarDetalleCompra(compraId);
  if (!detalle) notFound();
  const { compra } = detalle;
  const anulada = compra.estado === "anulada";

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/compras" className="hover:text-rojo">
            Compras
          </Link>{" "}
          · {tipoCompra(compra)}
        </p>
        <h1 className={`font-display mt-1 text-2xl ${anulada ? "text-tinta/50 line-through" : "text-tinta"}`}>
          {compra.documento} · {compra.proveedorNombre}
        </h1>
        <div className="mt-3">
          <FichaCompra compra={compra} destino={detalle.destino} />
        </div>
      </div>

      <CompraDetalle detalle={detalle} adjuntosFallidos={adjuntosFallidos} />
    </div>
  );
}
