import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { listarPorRecibir, getLineasCompra, filtrosDesdeParams, getProveedoresActivos, type ParamsCompras } from "@/lib/compras";
import { RecepcionCompraFormV2 } from "@/components/RecepcionCompraFormV2";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";

// Recibir mercadería contra facturas (ADR-0035). Reemplaza como camino
// principal a /inventario/recibir, que queda para mercadería SIN factura
// (producción propia, ajustes). Un líder puede recibir en cualquier
// ubicación; una integrante solo en la suya (lo valida la RPC).
export default async function RecibirComprasPage({ searchParams }: { searchParams: Promise<ParamsCompras & { compra?: string }> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const { compra } = params;
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, ubicaciones, catalogo, proveedores] = await Promise.all([
    listarPorRecibir(filtros, cursor),
    getUbicaciones(),
    getCatalogo(),
    getProveedoresActivos(),
  ]);
  // Las líneas se traen solo para las facturas de ESTA página (≤ 50).
  const lineas = await getLineasCompra(compras.map((c) => c.id));
  const ubicacionesPermitidas = persona.rol === "lider" ? ubicaciones : ubicaciones.filter((u) => u.id === persona.ubicacionId);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Compras · {persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Elige las facturas que cubre la guía y confirma lo que llegó. Cada prenda entra como movimiento — el stock no se edita a mano.
        </p>
      </div>

      <FiltrosCompras proveedores={proveedores} visibles={["busqueda", "proveedor"]} />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ninguna factura pendiente de recibir coincide con esos filtros. " : "No hay facturas con mercadería pendiente de recibir. "}
          <Link href="/compras/nueva" className="text-rojo hover:underline">
            Registrar una factura →
          </Link>
          <span className="mt-2 block text-xs text-tinta/55">
            ¿Llegó algo sin factura (producción propia, ajuste)?{" "}
            <Link href="/inventario/recibir" className="hover:text-rojo">Recibir sin factura</Link>.
          </span>
        </p>
      ) : (
        <RecepcionCompraFormV2
          compras={compras}
          lineas={lineas}
          variantes={catalogo
            .filter((v) => v.activo)
            .map((v) => ({ varianteId: v.varianteId, sku: v.sku, talla: v.talla, color: v.color, productoId: v.productoId }))}
          ubicaciones={ubicacionesPermitidas.map((u) => ({ id: u.id, nombre: u.nombre }))}
          ubicacionInicialId={persona.ubicacionId}
          compraInicialId={compra ?? null}
        />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={params} pathname="/compras/recibir" />
    </div>
  );
}
