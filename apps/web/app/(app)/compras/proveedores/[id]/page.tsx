import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedor, getProveedores, getProveedorCostoEvolucion, getProveedorDevoluciones, getProveedorMetricasCompras, getProveedorMetricasInsumos } from "@/lib/proveedores";
import { listarCompras, ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras";
import { celdaPago, celdaRecepcion } from "@/lib/comprobantes-lista-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { rubrosConConteo } from "@/lib/proveedores-reglas";
import { getCreditosProveedor } from "@/lib/saldo-favor";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { ProveedorAcciones } from "@/components/ProveedorAcciones";
import { ProveedorCostoEvolucion } from "@/components/ProveedorCostoEvolucion";
import { SaldoFavorProveedor } from "@/components/SaldoFavorProveedor";

// Ficha de un proveedor (maqueta 09, ADR-0111): prenda terminada (vía Compras) e insumos del Taller
// (vía insumo_lotes), en secciones separadas — nunca sumadas en un solo total, son negocios distintos
// aunque compartan la misma ficha (20260917230000_proveedor_metricas_compras_e_insumos.sql).
//
// Toda esta pantalla es solo de líder: `app/(app)/compras/layout.tsx` (2026-09-16) redirige a "/" a
// cualquier colaborador para las pantallas de Compras, ésta incluida; no hace falta (ni conviene)
// repetir ese chequeo acá. Lo que sí protege la base: `fn_proveedor_metricas_compras` y las demás
// funciones de esta ficha rechazan a quien no sea líder DENTRO de la base, así que aunque alguien las
// llame directo por API sigue sin poder ver el dato.
//
// Los indicadores son honestos con pocos datos: «11 días» de una sola entrega no es una tendencia, así
// que cada promedio dice en cuántos comprobantes se basa, y el plazo de pago real espera a tener al
// menos dos comprobantes pagados por completo en lugar de mostrar un número engañoso.
export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersonaActualV2();
  const { id } = await params;

  const [proveedor, m, insumos, costo, devoluciones, ultimos, directorio, creditos] = await Promise.all([
    getProveedor(id),
    getProveedorMetricasCompras(id),
    getProveedorMetricasInsumos(id),
    getProveedorCostoEvolucion(id),
    getProveedorDevoluciones(id),
    listarCompras({ proveedorId: id }, { limite: 3 }),
    getProveedores(),
    getCreditosProveedor(id),
  ]);
  if (!proveedor) notFound();

  const ahora = new Date();
  const plural = (n: number, s: string, p: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? s : p}`;
  const pactado = proveedor.plazo_credito_dias;
  const conCompras = m.facturas_vigentes > 0;
  const pagoDemoraMas = m.dias_pago_real_promedio != null && pactado != null && m.dias_pago_real_promedio > pactado;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/compras/proveedores" className="text-xs text-tinta/65 hover:text-rojo hover:underline">
          ← Volver a Proveedores
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-tinta">{proveedor.nombre}</h1>
            <p className="mt-1 text-sm text-tinta/65">
              {proveedor.ruc ?? "Sin RUC"} · {proveedor.contacto ?? "Sin contacto"}
              {proveedor.rubro && <> · {proveedor.rubro}</>}
              {!proveedor.activo && <> · Desactivado</>}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {pactado != null && <Chip>Crédito a {pactado} días</Chip>}
              {proveedor.forma_pago_preferida && <Chip>Paga por {(ETIQUETA_METODO[proveedor.forma_pago_preferida] ?? proveedor.forma_pago_preferida).toLowerCase()}</Chip>}
              {(proveedor.banco || proveedor.cuenta_bancaria) && (
                <Chip>
                  {proveedor.banco ?? "Banco sin definir"}
                  {proveedor.cuenta_bancaria ? ` · CCI ${proveedor.cuenta_bancaria}` : ""}
                </Chip>
              )}
              {proveedor.telefono && <Chip>{proveedor.telefono}</Chip>}
            </div>
          </div>
          <ProveedorAcciones proveedor={proveedor} rubros={rubrosConConteo(directorio.filter((p) => p.activo)).map((r) => r.etiqueta)} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="label-cayla text-[11px] text-tinta/65">Prendas terminadas · últimos 12 meses</h2>
        {!conCompras ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay comprobantes registrados de este proveedor.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaCifra compacta punto="neutro" etiqueta="Total facturado" valor={soles(m.facturado_12m)}>
              {plural(m.facturas_vigentes, "comprobante vigente", "comprobantes vigentes")}
            </TarjetaCifra>
            <TarjetaCifra
              compacta
              punto={m.saldo > 0 ? "ambar" : "verde"}
              detalleTono={m.facturas_vencidas > 0 ? "text-rojo" : undefined}
              etiqueta="Saldo pendiente"
              valor={soles(m.saldo)}
              href={m.saldo > 0 ? `/compras/por-pagar?prov=${id}` : undefined}
            >
              {m.facturas_vencidas > 0 ? `Vencido: ${soles(m.monto_vencido)} (${plural(m.facturas_vencidas, "comprobante", "comprobantes")})` : "Nada vencido"}
            </TarjetaCifra>
            <TarjetaCifra
              compacta
              punto={m.facturas_atrasadas > 0 ? "ambar" : "verde"}
              tono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              detalleTono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              etiqueta="Entregas atrasadas"
              valor={m.facturas_atrasadas.toLocaleString("es-PE")}
              href={m.facturas_atrasadas > 0 ? `/compras/recibir?prov=${id}` : undefined}
            >
              {m.facturas_atrasadas > 0 ? `de ${plural(m.facturas_vigentes, "comprobante", "comprobantes")} · ver cuáles →` : "Nada atrasado"}
            </TarjetaCifra>
            <TarjetaCifra compacta punto="neutro" etiqueta="Entregado completo" valor={m.entregado_completo_pct != null ? `${Math.round(m.entregado_completo_pct)} %` : "—"}>
              {m.facturas_recibidas_completas} de {plural(m.facturas_vigentes, "comprobante", "comprobantes")}
              {m.facturas_recibidas_completas === 1 ? " llegó completo" : " llegaron completos"}
            </TarjetaCifra>
            {m.dias_entrega_promedio != null ? (
              <TarjetaCifra compacta punto="neutro" etiqueta="Tiempo de entrega" valor={`${Math.round(m.dias_entrega_promedio)} ${Math.round(m.dias_entrega_promedio) === 1 ? "día" : "días"}`}>
                emisión → llegada · <b className="font-semibold">basado en {plural(m.dias_entrega_muestra, "comprobante", "comprobantes")}</b>
              </TarjetaCifra>
            ) : (
              <TarjetaCifra compacta vacia etiqueta="Tiempo de entrega" valor="—">
                Aparece con la primera recepción
              </TarjetaCifra>
            )}
            {m.dias_pago_real_promedio != null ? (
              <TarjetaCifra
                compacta
                punto={pagoDemoraMas ? "ambar" : "verde"}
                detalleTono={pagoDemoraMas ? "text-ambar-profundo" : undefined}
                etiqueta="Plazo de pago real"
                valor={`${Math.round(m.dias_pago_real_promedio)} días`}
              >
                {pactado != null ? `Pactado: ${pactado} días · ` : ""}
                <b className="font-semibold">basado en {plural(m.dias_pago_muestra, "comprobante pagado", "comprobantes pagados")}</b>
              </TarjetaCifra>
            ) : (
              <TarjetaCifra compacta vacia etiqueta="Plazo de pago real" valor="—">
                {pactado != null ? `Pactado: ${pactado} días. ` : ""}Se calcula con 2 o más comprobantes pagados
              </TarjetaCifra>
            )}
          </div>
        )}
      </section>

      <SaldoFavorProveedor proveedorId={id} proveedorNombre={proveedor.nombre} saldo={creditos.saldo} movimientos={creditos.movimientos} tieneDeuda={m.saldo > 0} />

      {conCompras && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ProveedorCostoEvolucion evolucion={costo} />
          <div className="card-cayla overflow-hidden">
            <p className="label-cayla px-5 pb-2 pt-4 text-[11px] text-tinta/65">Últimos comprobantes</p>
            <div className="divide-y divide-tinta/10">
              {ultimos.filas.map((c) => {
                const r = celdaRecepcion(c, ahora);
                const p = celdaPago(c, ahora);
                // Lo más urgente de la fila: una entrega atrasada pesa más que un pago pendiente.
                const estado = r.tono === "ambar" && r.texto.startsWith("Atrasada") ? r : p;
                return (
                  <Link key={c.id} href={`/compras/factura/${c.id}`} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-x-4 px-5 py-3 transition-colors hover:bg-tinta/[0.03]">
                    <span>
                      <span className="block text-sm tabular-nums text-tinta">{c.documento}</span>
                      <span className="block text-xs text-tinta/55">{diaMes(c.fechaEmision)}</span>
                    </span>
                    <span>
                      <Chip tono={estado.tono}>{estado.texto}</Chip>
                      <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{estado.sub}</span>
                    </span>
                    <span className="text-right text-sm tabular-nums text-tinta">{soles(c.total)}</span>
                  </Link>
                );
              })}
            </div>
            <Link href={`/compras?prov=${id}`} className="label-cayla block border-t border-tinta/10 px-5 py-3 text-[11px] text-rojo hover:underline">
              Ver todos sus comprobantes →
            </Link>
          </div>
        </div>
      )}

      {/* Dos negocios, nunca sumados: devoluciones/dañados e insumos del Taller van aparte de las prendas terminadas. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`card-cayla p-5 ${devoluciones.unidades === 0 ? "border-dashed bg-transparent" : ""}`}>
          <p className="label-cayla text-[11px] text-tinta/65">Devoluciones y dañados a este proveedor</p>
          <p className={`font-display mt-1.5 text-[26px] leading-tight tabular-nums ${devoluciones.unidades === 0 ? "text-tinta/45" : "text-tinta"}`}>{plural(devoluciones.unidades, "unidad", "unidades")}</p>
          <p className="mt-1 text-xs text-tinta/65">
            {devoluciones.unidades === 0
              ? "Se llena cuando una prenda se devuelve al proveedor desde cuarentena, con su nota de crédito."
              : `Devueltas desde cuarentena${devoluciones.ultima ? ` · la última el ${fechaCorta(devoluciones.ultima)}` : ""}.`}
          </p>
        </div>
        <div className={`card-cayla p-5 ${insumos.lotes === 0 ? "border-dashed bg-transparent" : ""}`}>
          <p className="label-cayla text-[11px] text-tinta/65">Insumos del Taller</p>
          {insumos.lotes === 0 ? (
            <>
              <p className="font-display mt-1.5 text-[26px] leading-tight text-tinta/45">Sin lotes todavía</p>
              <p className="mt-1 text-xs text-tinta/65">Cuando se reciba tela o avíos de este proveedor aparecerán acá, separados de las prendas terminadas.</p>
            </>
          ) : (
            <>
              <p className="font-display mt-1.5 text-[26px] leading-tight tabular-nums text-tinta">{soles(insumos.total_comprado)}</p>
              <p className="mt-1 text-xs text-tinta/65">
                {plural(insumos.lotes, "lote", "lotes")} · última entrega el {fechaCorta(insumos.ultima_entrega)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
