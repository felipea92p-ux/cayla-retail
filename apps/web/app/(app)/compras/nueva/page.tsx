import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getResumenCompras } from "@/lib/compras";
import { getProveedores } from "@/lib/proveedores";
import { CompraFormV2 } from "@/components/CompraFormV2";

// Registrar una factura de proveedor (ADR-0035). La página solo junta los
// tres catálogos que el formulario necesita; las reglas (contado exige pago,
// crédito exige vencimiento, la misma factura no se registra dos veces)
// viven en la RPC `registrar_compra`.
export default async function NuevaCompraPage({ searchParams }: { searchParams: Promise<{ prov?: string }> }) {
  const persona = await requirePersonaActualV2();
  const { prov } = await searchParams;
  const [directorio, ubicaciones, catalogo, resumen] = await Promise.all([getProveedores(), getUbicaciones(), getCatalogo(), getResumenCompras()]);
  // Solo los activos; con su plazo, forma de pago y saldo (lo financiero es de líder, y esta pantalla también).
  const proveedores = directorio
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc, plazoCreditoDias: p.plazo_credito_dias, formaPagoPreferida: p.forma_pago_preferida, saldo: p.saldo, saldoFavor: p.saldo_favor }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/compras" className="hover:text-rojo">Compras</Link> · Nueva
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Registrar comprobante</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Lo que se compró queda aquí; la recepción y el pago se anotan contra él. Copia el documento tal cual llegó: lo que el proveedor no desglosó por talla y color se reparte al recibir.
        </p>
      </div>

      {proveedores.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay proveedores registrados — no se puede registrar un comprobante sin uno.</p>
      ) : catalogo.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay productos en el catálogo — revisa Productos primero.</p>
      ) : (
        <CompraFormV2
          proveedores={proveedores}
          proveedorInicialId={prov && /^[0-9a-f-]{36}$/i.test(prov) ? prov : null}
          deudaTotal={resumen.deuda}
          ubicaciones={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
          ubicacionInicialId={persona.ubicacionId}
          variantes={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              sku: v.sku,
              talla: v.talla,
              color: v.color,
              productoId: v.productoId,
              referencia: v.referencia,
              costo: v.costo,
            }))}
        />
      )}
    </div>
  );
}
