import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { accionesDeCompraDe, puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { usaModulo } from "@/lib/modulos";
import { getCambiosBancarios, getProveedor, getProveedores, getProveedorCostoEvolucion, getProveedorDevoluciones, getProveedorMetricasCompras, getProveedorMetricasInsumos, getMarcasPorProveedor, getProveedorPrendas } from "@/lib/proveedores";
import { listarCompras, ETIQUETA_METODO, fechaCorta, soles } from "@/lib/compras";
import { celdaPago, celdaRecepcion } from "@/lib/comprobantes-lista-reglas";
import { ChevronRight, Receipt } from "lucide-react";
import { diaMes, diasEntreFechas, hoyLima } from "@/lib/fechas-lima";
import { rubrosConConteo, siguientePaso } from "@/lib/proveedores-reglas";
import { getCreditosProveedor } from "@/lib/saldo-favor";
import { getNosDebeProveedor } from "@/lib/nos-debe";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { PasoSugerido } from "@/components/ui/PasoSugerido";
import { PistaPlazo } from "@/components/ui/PistaPlazo";
import { ProveedorAcciones } from "@/components/ProveedorAcciones";
import { ProveedorPrendas } from "@/components/ProveedorPrendas";
import { LoQueQuizaNoVes } from "@/components/LoQueQuizaNoVes";
import { hallazgosDeProveedor } from "@/lib/proveedor-analisis-reglas";
import { ProveedorCostoEvolucion } from "@/components/ProveedorCostoEvolucion";
import { ProveedorCuentasFicha } from "@/components/ProveedorCuentasFicha";
import { CambiosCuentaProveedor } from "@/components/CambiosCuentaProveedor";
import { SaldoFavorProveedor } from "@/components/SaldoFavorProveedor";
import { NosDebeProveedor } from "@/components/nos-debe/NosDebeProveedor";
import { Volver } from "@/components/ui/Volver";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { esUuid } from "@/lib/club-registro-reglas";

// Ficha de un proveedor (maqueta 09, ADR-0111): prenda terminada (vía Compras) e insumos del Taller
// (vía insumo_lotes), en secciones separadas — nunca sumadas en un solo total, son negocios distintos
// aunque compartan la misma ficha (20260917230000_proveedor_metricas_compras_e_insumos.sql).
//
// Quién la ve (ADR-0161 P3, abajo): quien tiene el módulo Proveedores. Cada parte con dinero pide su propia llave, y la
// base vuelve a exigirla: `fn_proveedor_metricas_compras`, `fn_proveedor_costo_evolucion` y `fn_proveedor_creditos` rechazan
// a quien no ve el dinero de Compras, y `fn_proveedor_metricas_insumos` a quien no es líder, aunque se las llame directo.
//
// Los indicadores son honestos con pocos datos: «11 días» de una sola entrega no es una tendencia, así
// que cada promedio dice en cuántos comprobantes se basa, y el plazo de pago real espera a tener al
// menos dos comprobantes pagados por completo en lugar de mostrar un número engañoso.
//
// ADR-0161 P3 (20260923140000, Felipe): la ficha se abre a quien tiene el módulo Proveedores (`editarCuentasProveedor` =
// `fn_puede_gestionar_proveedores`): datos, marcas, cuentas, devoluciones y editar/desactivar. Lo demás se pinta por partes,
// cada una con su llave: los MONTOS de Compras (métricas, saldo a favor, costo, últimos comprobantes) con `verDineroCompras` o,
// desde ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»), con el módulo Proveedores completo; abrir un comprobante sigue
// siendo de Facturas de proveedor (su detalle pide `verDineroCompras`), así que sin ese permiso la lista se ve sin enlaces;
// los INSUMOS del Taller, solo el líder (es dinero de Producción). Quien no tiene la llave ni siquiera los pide a la base.
export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCuentasProveedor")) redirect("/compras/proveedores");
  const esLider = persona.rol === "lider";
  const verMontos = puede(persona, "verDineroCompras") || usaModulo(persona.rol, persona.modulos, "proveedores");
  const abreComprobantes = puede(persona, "verDineroCompras"); // el detalle y la lista de comprobantes son de Facturas de proveedor
  const { id } = await params;
  // Un id que no es uuid no es un proveedor: «no existe», no la pantalla de error (/chaos de Compras, ADR-0421).
  if (!esUuid(id)) notFound();
  const siDinero = <T,>(leer: () => Promise<T>): Promise<T | null> => (verMontos ? leer() : Promise.resolve(null));

  const [proveedor, m, insumos, costo, devoluciones, ultimos, directorio, creditos, marcasMapa, cambiosCuenta, nosDebe, prendas] = await Promise.all([
    getProveedor(id),
    siDinero(() => getProveedorMetricasCompras(id)),
    esLider ? getProveedorMetricasInsumos(id) : Promise.resolve(null),
    siDinero(() => getProveedorCostoEvolucion(id)),
    getProveedorDevoluciones(id),
    siDinero(() => listarCompras({ proveedorId: id }, { limite: 3 })),
    getProveedores(),
    siDinero(() => getCreditosProveedor(id)),
    getMarcasPorProveedor(), // ADR-0140: opcional; si falla llega `null` y la ficha se pinta sin marcas
    // Cambios de cuenta (Felipe 2026-10-13): opcional como las marcas; si falla, la ficha se pinta sin el historial.
    getCambiosBancarios(id).catch(() => []),
    // «Nos debe» (ADR-0362, fase 5a): las prendas por reponer. Con los mismos ojos que el saldo a favor (los montos de la ficha); si la base
    // todavía no lo sabe contar, llega vacío y la ficha sale como antes.
    siDinero(() => getNosDebeProveedor(id)),
    // Lo que se le compró prenda por prenda y cuánto se vendió (2026-10-24): plata, así que con la misma llave que las cifras de arriba.
    // Opcional: si la base todavía no tiene la función, la ficha se pinta sin esta sección.
    siDinero(() => getProveedorPrendas(id).catch(() => null)),
  ]);
  if (!proveedor) notFound();
  const marcas = marcasMapa?.[id] ?? [];

  const ahora = new Date();
  const plural = (n: number, s: string, p: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? s : p}`;
  const pactado = proveedor.plazo_credito_dias;
  const conCompras = !!m && m.facturas_vigentes > 0;
  const pagoDemoraMas = !!m && m.dias_pago_real_promedio != null && pactado != null && m.dias_pago_real_promedio > pactado;
  // «¿Y ahora qué?»: la sugerencia más urgente, la misma que dice la vista rápida de la lista (ADR-0128). Mira deuda y
  // saldo a favor: sin los montos no hay sugerencia que dar.
  const paso =
    m && creditos
      ? siguientePaso({
          activo: proveedor.activo,
          conCompras,
          montoVencido: m.monto_vencido,
          facturasVencidas: m.facturas_vencidas,
          facturasAtrasadas: m.facturas_atrasadas,
          saldoFavor: creditos.saldo,
          diasSinComprar: m.ultima_compra ? diasEntreFechas(m.ultima_compra, hoyLima()) : null,
        })
      : null;

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14): el nombre del proveedor de título, sus datos de
          frase y lo que se sabe de él (marcas, crédito, cómo cobra) como estados bajo la frase. */}
      <div data-guia="proveedor-ficha.cabecera">
        <EncabezadoPagina
          sede="Todas las tiendas"
          volver={<Volver href="/compras/proveedores" a="Proveedores" />}
          titulo={proveedor.nombre}
          subtitulo={
            <>
              {proveedor.ruc ?? "Sin RUC"} · {proveedor.contacto ?? "Sin contacto"}
              {proveedor.rubros.length > 0 && <> · {proveedor.rubros.join(", ")}</>}
              {!proveedor.activo && <> · Desactivado</>}
            </>
          }
          pie={
            <div className="flex flex-wrap gap-2">
              {marcas.map((marca) => (
                <Chip key={marca} versalitas={false}>
                  {marca}
                </Chip>
              ))}
              {pactado != null && <Chip>Crédito a {pactado} días</Chip>}
              {proveedor.forma_pago_preferida && <Chip>Paga por {(ETIQUETA_METODO[proveedor.forma_pago_preferida] ?? proveedor.forma_pago_preferida).toLowerCase()}</Chip>}
              {/* Cuenta, CCI y Yape/Plin ya no van en chips: están en «Datos para pagar», enmascarados y con «Copiar». Antes
                  un texto libre rotulado «CCI» (era la cuenta) y el WhatsApp pasaba por Yape (ADR-0134). */}
              {proveedor.banco && <Chip>{proveedor.banco}</Chip>}
              {proveedor.telefono && <Chip>WhatsApp {proveedor.telefono}</Chip>}
            </div>
          }
          acciones={<ProveedorAcciones proveedor={proveedor} rubros={rubrosConConteo(directorio.filter((p) => p.activo)).map((r) => r.etiqueta)} />}
        />
      </div>

      {paso && (
        <div data-guia="proveedor-ficha.sugerencia">
          <PasoSugerido paso={paso} proveedorId={id} indice={1} />
        </div>
      )}

      <ProveedorCuentasFicha proveedor={proveedor} rubros={rubrosConConteo(directorio.filter((p) => p.activo)).map((r) => r.etiqueta)} />

      <CambiosCuentaProveedor cambios={cambiosCuenta} />

      {m && (
      <section className="space-y-3">
        <TituloSeccion>Prendas terminadas · últimos 12 meses</TituloSeccion>
        {!conCompras ? (
          <div className="card-cayla">
            <Vacio icono={<Receipt />} titulo="Todavía no hay comprobantes de este proveedor">
              Cuando registres su primera factura, aquí verás cuánto le compraste, cuánto le debes y cómo le fue a su mercadería.
            </Vacio>
          </div>
        ) : (
          <div data-guia="proveedor-ficha.cifras" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 2 }} punto="neutro" etiqueta="Total facturado" valor={<CifraQueCuenta valor={m.facturado_12m} formato="soles" alMontar />}>
              {plural(m.facturas_vigentes, "comprobante vigente", "comprobantes vigentes")}
            </TarjetaCifra>
            <TarjetaCifra
              className="anim-entra" style={{ ["--i" as string]: 3 }}
              punto={m.saldo > 0 ? "ambar" : "verde"}
              detalleTono={m.facturas_vencidas > 0 ? "text-rojo" : undefined}
              etiqueta="Saldo pendiente"
              valor={<CifraQueCuenta valor={m.saldo} formato="soles" alMontar />}
              href={m.saldo > 0 ? `/compras/por-pagar?prov=${id}` : undefined}
            >
              {m.facturas_vencidas > 0 ? `Vencido: ${soles(m.monto_vencido)} (${plural(m.facturas_vencidas, "comprobante", "comprobantes")})` : "Nada vencido"}
            </TarjetaCifra>
            <TarjetaCifra
              className="anim-entra" style={{ ["--i" as string]: 4 }}
              punto={m.facturas_atrasadas > 0 ? "ambar" : "verde"}
              tono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              detalleTono={m.facturas_atrasadas > 0 ? "text-ambar-profundo" : undefined}
              etiqueta="Entregas atrasadas"
              valor={<CifraQueCuenta valor={m.facturas_atrasadas} alMontar />}
              href={m.facturas_atrasadas > 0 ? `/compras/recibir?prov=${id}` : undefined}
            >
              {m.facturas_atrasadas > 0 ? `de ${plural(m.facturas_vigentes, "comprobante", "comprobantes")} · ver cuáles` : "Nada atrasado"}
            </TarjetaCifra>
            <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 5 }} punto="neutro" etiqueta="Entregado completo" valor={m.entregado_completo_pct != null ? <CifraQueCuenta valor={m.entregado_completo_pct} formato="porcentaje" alMontar /> : null}>
              {m.facturas_recibidas_completas} de {plural(m.facturas_vigentes, "comprobante", "comprobantes")}
              {m.facturas_recibidas_completas === 1 ? " llegó completo" : " llegaron completos"}
            </TarjetaCifra>
            {m.dias_entrega_promedio != null ? (
              <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 6 }} punto="neutro" etiqueta="Tiempo de entrega" valor={<CifraQueCuenta valor={m.dias_entrega_promedio} formato="dias" alMontar />}>
                emisión → llegada · <b className="font-semibold">basado en {plural(m.dias_entrega_muestra, "comprobante", "comprobantes")}</b>
              </TarjetaCifra>
            ) : (
              <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 7 }} etiqueta="Tiempo de entrega" valor={null}>
                Aparece con la primera recepción
              </TarjetaCifra>
            )}
            {m.dias_pago_real_promedio != null ? (
              <TarjetaCifra
                className="anim-entra" style={{ ["--i" as string]: 8 }}
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
              <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 9 }} etiqueta="Plazo de pago real" valor={null}>
                {pactado != null ? `Pactado: ${pactado} días. ` : ""}Se calcula con 2 o más comprobantes pagados
              </TarjetaCifra>
            )}
          </div>
        )}
      </section>
      )}

      {prendas && <LoQueQuizaNoVes guia="proveedor-ficha.analisis" hallazgos={hallazgosDeProveedor(prendas, hoyLima())} />}
      {prendas && <ProveedorPrendas prendas={prendas} />}

      {/* «Nos debe» (ADR-0362, fase 5a): las prendas por reponer y, a su lado, el saldo a favor de siempre (la plata). Si la base todavía
          no cuenta las prendas, el saldo a favor queda solo, como antes. */}
      {nosDebe && (nosDebe.nosDebe || nosDebe.falla) ? (
        <NosDebeProveedor
          nosDebe={nosDebe.nosDebe}
          falla={nosDebe.falla}
          proveedorNombre={proveedor.nombre}
          hoy={hoyLima()}
          // Pasar a saldo a favor mueve plata: la misma regla que `resolver_deuda_proveedor` (fn_puede_gestionar_proveedores).
          puedeSaldoAFavor={esLider || usaModulo(persona.rol, persona.modulos, "proveedores")}
        >
          {m && creditos && <SaldoFavorProveedor proveedorId={id} proveedorNombre={proveedor.nombre} saldo={creditos.saldo} movimientos={creditos.movimientos} tieneDeuda={m.saldo > 0} puedeReembolsar={accionesDeCompraDe(persona).pagar} />}
        </NosDebeProveedor>
      ) : (
        m && creditos && <SaldoFavorProveedor proveedorId={id} proveedorNombre={proveedor.nombre} saldo={creditos.saldo} movimientos={creditos.movimientos} tieneDeuda={m.saldo > 0} puedeReembolsar={accionesDeCompraDe(persona).pagar} />
      )}

      {conCompras && ultimos && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div data-guia="proveedor-ficha.costo" className="[&>*]:h-full">
            <ProveedorCostoEvolucion evolucion={costo} />
          </div>
          <div data-guia="proveedor-ficha.ultimos" className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 12 }}>
            <p className="label-cayla px-5 pb-2 pt-4 text-[11px] text-tinta/65">Últimos comprobantes</p>
            <div className="divide-y divide-tinta/10">
              {ultimos.filas.map((c) => {
                const r = celdaRecepcion(c, ahora);
                const p = celdaPago(c, ahora);
                // Lo más urgente de la fila: una entrega atrasada pesa más que un pago pendiente.
                const estado = r.tono === "ambar" && r.texto.startsWith("Atrasada") ? r : p;
                const celdas = (
                  <>
                    <span>
                      <span className="block text-sm tabular-nums text-tinta">{c.documento}</span>
                      <span className="block text-xs text-tinta/55">{diaMes(c.fechaEmision)}</span>
                    </span>
                    <span>
                      <Chip tono={estado.tono}>{estado.texto}</Chip>
                      <span className="mt-0.5 block text-xs tabular-nums text-tinta/55">{estado.sub}</span>
                    </span>
                    <span className="text-right text-sm tabular-nums text-tinta">{soles(c.total)}</span>
                  </>
                );
                // Sin Facturas de proveedor, la fila se lee pero no se abre: su detalle lo devolvería al Inicio.
                return abreComprobantes ? (
                  <Link key={c.id} href={`/compras/factura/${c.id}`} className="group grid grid-cols-[6.5rem_1fr_auto_1rem] items-center gap-x-4 px-5 py-3 transition-colors hover:bg-tinta/[0.03]">
                    {celdas}
                    <ChevronRight aria-hidden className="h-4 w-4 text-tinta/40 transition-[transform,color] duration-300 ease-cayla group-hover:translate-x-1 group-hover:text-rojo" />
                  </Link>
                ) : (
                  <div key={c.id} className="grid grid-cols-[6.5rem_1fr_auto_1rem] items-center gap-x-4 px-5 py-3">
                    {celdas}
                    <span aria-hidden />
                  </div>
                );
              })}
            </div>
            {abreComprobantes && (
              <div className="border-t border-tinta/10 px-5 py-3">
                <EnlaceVer href={`/compras?prov=${id}`}>Ver todos sus comprobantes</EnlaceVer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dos negocios, nunca sumados: devoluciones/dañados e insumos del Taller van aparte de las prendas terminadas. */}
      <div data-guia="proveedor-ficha.otros" className="grid gap-3 lg:grid-cols-2">
        {/* Las dos con la pieza única de cifra (TarjetaCifra, ADR-0358): cero devoluciones es un dato; sin lotes, «sin dato». */}
        <TarjetaCifra
          className="anim-entra"
          style={{ ["--i" as string]: 13 }}
          etiqueta="Devoluciones y dañados a este proveedor"
          valor={devoluciones.unidades.toLocaleString("es-PE")}
          unidad={devoluciones.unidades === 1 ? "unidad" : "unidades"}
        >
          {devoluciones.unidades === 0
            ? "Se llena cuando una prenda se devuelve al proveedor desde cuarentena, con su nota de crédito."
            : `Devueltas desde cuarentena${devoluciones.ultima ? ` · la última el ${fechaCorta(devoluciones.ultima)}` : ""}.`}
        </TarjetaCifra>
        {insumos &&
          (insumos.lotes === 0 ? (
            <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 14 }} etiqueta="Insumos del Taller" valor={null}>
              Cuando se reciba tela o avíos de este proveedor aparecerán acá, separados de las prendas terminadas.
            </TarjetaCifra>
          ) : (
            <TarjetaCifra className="anim-entra" style={{ ["--i" as string]: 14 }} etiqueta="Insumos del Taller" valor={soles(insumos.total_comprado)}>
              {plural(insumos.lotes, "lote", "lotes")} · última entrega el {fechaCorta(insumos.ultima_entrega)}
            </TarjetaCifra>
          ))}
      </div>
    </div>
  );
}
