import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedor, getProveedorMetricasCompras, getProveedorMetricasInsumos } from "@/lib/proveedores";
import { TarjetaIndicador } from "@/components/TarjetaIndicador";
import { ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras-reglas";

// Ficha de un proveedor: prenda terminada (vía Compras) e insumos del Taller
// (vía insumo_lotes), en secciones separadas — nunca sumadas en un solo total,
// son negocios distintos aunque compartan la misma ficha
// (20260917230000_proveedor_metricas_compras_e_insumos.sql). Sin edición acá:
// eso sigue viviendo en el modal de ProveedoresPanel, para no duplicar ese
// formulario en dos lugares.
//
// Toda esta pantalla ya era solo de líder desde antes de hoy —
// `app/(app)/compras/layout.tsx` (2026-09-16) redirige a "/" a cualquier
// colaborador para las 5 pantallas de Compras, ésta incluida; no hace falta
// (ni conviene) repetir ese chequeo acá — el propio comentario del layout
// explica por qué se centralizó ahí, en vez de repetirlo pantalla por
// pantalla. Lo nuevo hoy (corrección de D-27,
// 20260917240000_proveedores_lista_indicadores_y_candado_sede.sql) es que
// `fn_proveedor_metricas_compras`/`fn_proveedor_metricas_insumos` también
// rechazan a quien no sea líder DENTRO de la base — así que aunque alguien
// llame la RPC directo por API, saltándose esta pantalla, sigue sin poder
// ver el dato. Encontrado al verificar en el navegador: se había escrito acá
// un chequeo de rol redundante con el del layout; se sacó.
export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersonaActualV2();
  const { id } = await params;

  const [proveedor, metricasCompras, metricasInsumos] = await Promise.all([
    getProveedor(id),
    getProveedorMetricasCompras(id),
    getProveedorMetricasInsumos(id),
  ]);
  if (!proveedor) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/compras/proveedores" className="text-xs text-tinta/65 hover:text-rojo hover:underline">
          ← Volver a Proveedores
        </Link>
        <h1 className="font-display mt-2 text-2xl text-tinta">{proveedor.nombre}</h1>
        <p className="mt-1 text-sm text-tinta/65">
          {proveedor.ruc ?? "Sin RUC"} · {proveedor.contacto ?? "Sin contacto"}
          {proveedor.rubro && <> · {proveedor.rubro}</>}
          {proveedor.plazo_credito_dias != null && <> · Crédito a {proveedor.plazo_credito_dias} días</>}
          {proveedor.forma_pago_preferida && <> · Paga por {ETIQUETA_METODO[proveedor.forma_pago_preferida] ?? proveedor.forma_pago_preferida}</>}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="label-cayla text-[11px] text-tinta/65">Prendas terminadas</h2>
        {metricasCompras.facturas_vigentes === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Todavía no hay facturas registradas de este proveedor.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaIndicador etiqueta="Total facturado" valor={soles(metricasCompras.total_facturado)} />
            <TarjetaIndicador etiqueta="Saldo pendiente" valor={soles(metricasCompras.saldo)} />
            <TarjetaIndicador etiqueta="Última compra" valor={fechaCorta(metricasCompras.ultima_compra)} />
            <TarjetaIndicador
              etiqueta="Comprobantes vencidos"
              valor={String(metricasCompras.facturas_vencidas)}
              critico={metricasCompras.facturas_vencidas > 0}
            />
            <TarjetaIndicador
              etiqueta="Recepción"
              valor={`${metricasCompras.facturas_recibidas_completas} completas`}
              comparativo={{
                texto: `${metricasCompras.facturas_con_recepcion_pendiente} pendientes`,
                positivo: metricasCompras.facturas_con_recepcion_pendiente === 0,
              }}
            />
          </div>
        )}
        <Link href={`/compras?prov=${id}`} className="inline-block text-xs text-tinta/65 hover:text-rojo hover:underline">
          Ver todos sus comprobantes →
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="label-cayla text-[11px] text-tinta/65">Insumos del Taller</h2>
        {metricasInsumos.lotes === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Todavía no hay lotes de insumos registrados de este proveedor.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaIndicador etiqueta="Total comprado" valor={soles(metricasInsumos.total_comprado)} />
            <TarjetaIndicador etiqueta="Última entrega" valor={fechaCorta(metricasInsumos.ultima_entrega)} />
            <TarjetaIndicador etiqueta="Lotes" valor={String(metricasInsumos.lotes)} />
          </div>
        )}
      </section>
    </div>
  );
}
