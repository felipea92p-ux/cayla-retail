import { notFound } from "next/navigation";
import { exigirPermiso } from "@/lib/persona-actual";
import { CompraDetalle, DatosComprobante, cargarDetalleCompra, tipoCompra } from "@/components/CompraDetalle";
import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Página completa del detalle de una factura. Es lo que se ve al entrar por
// enlace directo o al recargar; viniendo desde una lista de Compras, el
// mismo detalle se abre como modal encima de la lista
// (`../../@modal/(.)factura/[compraId]/page.tsx`). El cuerpo es el mismo componente;
// acá solo cambia el marco: enlace «← Facturas de proveedor» (`Volver`) en lugar de la X y el mismo título/bajada que el modal.
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
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14): el proveedor de título y el documento en la línea
          de arriba, junto a la fecha. La hoja (el modal) sigue con `TituloComprobante`. */}
      <div data-guia="factura.cabecera">
        <EncabezadoPagina
          sede="Todas las tiendas"
          detalle={`${tipoCompra(compra)} ${compra.documento}`}
          volver={<Volver href="/compras" a="Historial de compras" />}
          titulo={<span className={compra.estado === "anulada" ? "text-tinta/50 line-through" : undefined}>{compra.proveedorNombre}</span>}
          subtitulo={<DatosComprobante compra={compra} destino={detalle.destino} />}
        />
      </div>

      <CompraDetalle detalle={detalle} adjuntosFallidos={adjuntosFallidos} />
    </div>
  );
}
