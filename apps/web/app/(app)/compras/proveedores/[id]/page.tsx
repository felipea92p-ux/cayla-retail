import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedor, getProveedores, getProveedorCostoEvolucion, getProveedorDevoluciones, getProveedorMetricasCompras, getProveedorMetricasInsumos } from "@/lib/proveedores";
import { listarCompras, ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras";
import { celdaPago, celdaRecepcion } from "@/lib/comprobantes-lista-reglas";
import { ChevronRight } from "lucide-react";
import { diaMes, diasEntreFechas, hoyLima } from "@/lib/fechas-lima";
import { rubrosConConteo, siguientePaso } from "@/lib/proveedores-reglas";
import { getCreditosProveedor } from "@/lib/saldo-favor";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { PasoSugerido } from "@/components/ui/PasoSugerido";
import { PistaPlazo } from "@/components/ui/PistaPlazo";
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
  // «¿Y ahora qué?»: la sugerencia más urgente, la misma que dice la vista rápida de la lista (ADR-0128).
  const paso = siguientePaso({
    activo: proveedor.activo,
    conCompras,
    montoVencido: m.monto_vencido,
    facturasVencidas: m.facturas_vencidas,
    facturasAtrasadas: m.facturas_atrasadas,
    saldoFavor: creditos.saldo,
    diasSinComprar: m.ultima_compra ? diasEntreFechas(m.ultima_compra, hoyLima()) : null,
  });

  return (
    <div className="space-y-6">
      <div className="anim-entra">
        <Link href="/compras/proveedores" className="text-xs text-tinta/65 hover:text-rojo hover:underline">
          ← Volver a Proveedores
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-2xl text-tinta">
              {proveedor.nombre.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
            </span>
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
          </div>
          <ProveedorAcciones proveedor={proveedor} rubros={rubrosConConteo(directorio.filter((p) => p.activo)).map((r) => r.etiqueta)} />
        </div>
      </div>

      <PasoSugerido paso={paso} proveedorId={id} indice={1} />

      <section className="space-y-3">
        <h2 className="label-cayla text-[11px] text-tinta/65">Prendas terminadas · últimos 12 meses</h2>
        {!conCompras ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay comprobantes registrados de este proveedor.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaCifra compacta className="anim-entra" style={{ ["--i" as string]: 2 }} punto="neutro" etiqueta="Total facturado" valor={<CifraQueCuenta valor={m.facturado_12m} formato="soles" alMontar />}>
              {plural(m.facturas_vigentes, "comprobante vigente", "comprobantes vigentes")}
            </TarjetaCifra>
            <TarjetaCifra
              compacta className="anim-entra" style={{ ["--i" as string]: 3 }}
              punto={m.saldo > 0 ? "ambar" : "verde"}
              detalleTono={m.facturas_vencidas > 0 ? "text-rojo" : undefined}
              etiqueta="Saldo pendiente"
              valor={<CifraQueCuenta valor={m.saldo} formato="soles" alMontar />}
              href={m.saldo > 0 ? `/compras/por-pagar?prov=${id}` : undefined}
            >
              {m.facturas_vencidas > 0 ? `Vencido: ${soles(m.monto_vencido)} (${plural(m.facturas_vencidas, "comprobante", "comprobantes")})` : "Nada vencido"}
            </TarjetaCifra>
            <TarjetaCifra
              compacta className="anim-entra" style={{ ["--i" as string]: 4 }}
              punto={m.facturas_atrasadas > 0 ? "ambar" : "verde"}
              tono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              detalleTono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              etiqueta="Entregas atrasadas"
              valor={<CifraQueCuenta valor={m.facturas_atrasadas} alMontar />}
              href={m.facturas_atrasadas > 0 ? `/compras/recibir?prov=${id}` : undefined}
            >
              {m.facturas_atrasadas > 0 ? `de ${plural(m.facturas_vigentes, "comprobante", "comprobantes")} · ver cuáles →` : "Nada atrasado"}
            </TarjetaCifra>
            <TarjetaCifra compacta className="anim-entra" style={{ ["--i" as string]: 5 }} punto="neutro" etiqueta="Entregado completo" valor={m.entregado_completo_pct != null ? <CifraQueCuenta valor={m.entregado_completo_pct} formato="porcentaje" alMontar /> : "—"}>
              {m.facturas_recibidas_completas} de {plural(m.facturas_vigentes, "comprobante", "comprobantes")}
              {m.facturas_recibidas_completas === 1 ? " llegó completo" : " llegaron completos"}
            </TarjetaCifra>
            {m.dias_entrega_promedio != null ? (
              <TarjetaCifra compacta className="anim-entra" style={{ ["--i" as string]: 6 }} punto="neutro" etiqueta="Tiempo de entrega" valor={<CifraQueCuenta valor={m.dias_entrega_promedio} formato="dias" alMontar />}>
                emisión → llegada · <b className="font-semibold">basado en {plural(m.dias_entrega_muestra, "comprobante", "comprobantes")}</b>
              </TarjetaCifra>
            ) : (
              <TarjetaCifra compacta className="anim-entra" style={{ ["--i" as string]: 7 }} vacia etiqueta="Tiempo de entrega" valor="—">
                Aparece con la primera recepción
              </TarjetaCifra>
            )}
            {m.dias_pago_real_promedio != null ? (
              <TarjetaCifra
                compacta className="anim-entra" style={{ ["--i" as string]: 8 }}
                punto={pagoDemoraMas ? "ambar" : "verde"}
                detalleTono={pagoDemoraMas ? "text-ambar-profundo" : undefined}
                etiqueta="Plazo de pago real"
                valor={<CifraQueCuenta valor={m.dias_pago_real_promedio} formato="dias" alMontar />}
              >
                {pactado != null ? `Pactado: ${pactado} días · ` : ""}
                <b className="font-semibold">basado en {plural(m.dias_pago_muestra, "comprobante pagado", "comprobantes pagados")}</b>
                {pactado != null && <PistaPlazo real={m.dias_pago_real_promedio} pactado={pactado} />}
              </TarjetaCifra>
            ) : (
              <TarjetaCifra compacta className="anim-entra" style={{ ["--i" as string]: 9 }} vacia etiqueta="Plazo de pago real" valor="—">
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
          <div className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 12 }}>
            <p className="label-cayla px-5 pb-2 pt-4 text-[11px] text-tinta/65">Últimos comprobantes</p>
            <div className="divide-y divide-tinta/10">
              {ultimos.filas.map((c) => {
                const r = celdaRecepcion(c, ahora);
                const p = celdaPago(c, ahora);
                // Lo más urgente de la fila: una entrega atrasada pesa más que un pago pendiente.
                const estado = r.tono === "ambar" && r.texto.startsWith("Atrasada") ? r : p;
                return (
                  <Link key={c.id} href={`/compras/factura/${c.id}`} className="group grid grid-cols-[6.5rem_1fr_auto_1rem] items-center gap-x-4 px-5 py-3 transition-colors hover:bg-tinta/[0.03]">
                    <span>
                      <span className="block text-sm tabular-nums text-tinta">{c.documento}</span>
                      <span className="block text-xs text-tinta/55">{diaMes(c.fechaEmision)}</span>
                    </span>
                    <span>
                      <Chip tono={estado.tono}>{estado.texto}</Chip>
                      <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{estado.sub}</span>
                    </span>
                    <span className="text-right text-sm tabular-nums text-tinta">{soles(c.total)}</span>
                    <ChevronRight aria-hidden className="h-4 w-4 text-tinta/40 transition-[transform,color] duration-300 ease-cayla group-hover:translate-x-1 group-hover:text-rojo" />
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
        <div style={{ ["--i" as string]: 13 }} className={`anim-entra card-cayla p-5 ${devoluciones.unidades === 0 ? "border-dashed bg-transparent" : ""}`}>
          <p className="label-cayla text-[11px] text-tinta/65">Devoluciones y dañados a este proveedor</p>
          <p className={`font-display mt-1.5 text-[26px] leading-tight tabular-nums ${devoluciones.unidades === 0 ? "text-tinta/45" : "text-tinta"}`}>{plural(devoluciones.unidades, "unidad", "unidades")}</p>
          <p className="mt-1 text-xs text-tinta/65">
            {devoluciones.unidades === 0
              ? "Se llena cuando una prenda se devuelve al proveedor desde cuarentena, con su nota de crédito."
              : `Devueltas desde cuarentena${devoluciones.ultima ? ` · la última el ${fechaCorta(devoluciones.ultima)}` : ""}.`}
          </p>
        </div>
        <div style={{ ["--i" as string]: 14 }} className={`anim-entra card-cayla p-5 ${insumos.lotes === 0 ? "border-dashed bg-transparent" : ""}`}>
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
