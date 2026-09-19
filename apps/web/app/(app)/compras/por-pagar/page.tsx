import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { listarPorPagar, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, getCompra, soles, type ParamsCompras } from "@/lib/compras";
import { getDeudaPorVencimiento, getPorPagarTramos, getResumenComprasExtra, getSalidasCaja30d } from "@/lib/compras-indicadores";
import { getProveedores } from "@/lib/proveedores";
import { diaMes, hoyLima, sumarDias } from "@/lib/fechas-lima";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { PagoDesdeUrl } from "@/components/CompraDetallePanel";
import { DeudaPorVencimiento } from "@/components/DeudaPorVencimiento";
import { SalidasDeCaja } from "@/components/SalidasDeCaja";
import { PorPagarLista } from "@/components/PorPagarLista";
import { SaldosAFavor } from "@/components/SaldosAFavor";
import type { DatosPagoProveedor } from "@/components/PagoJuntosModal";

// Por pagar (ADR-0035, rediseño ADR-0111): los comprobantes vigentes con saldo, de lo más urgente
// a lo que puede esperar. Sale del índice parcial `compras_por_pagar_idx`, que solo contiene lo
// que se debe — chico aunque haya millones pagadas. Las cifras se suman en Postgres, nunca en la
// página: una página trae ≤ 50 filas y la deuda puede ser más.
//
// La pantalla responde tres preguntas de quien decide, en este orden:
//   1. ¿Cuánto debo y qué es urgente?  → las 4 cifras de arriba (Deuda, Vencido, Esta semana,
//      Concentración: cuánto de la deuda está en un solo proveedor, dónde negociar plazos).
//   2. ¿Cómo se reparte y cuándo sale la plata? → deuda por vencimiento y salidas de caja de 30
//      días: saber si la caja alcanza ANTES de la fecha.
//   3. ¿A quién le pago primero y cómo? → la lista, con casillas para pagar varios comprobantes
//      del mismo proveedor en una sola transferencia (D3).
export default async function PorPagarPage({ searchParams }: { searchParams: Promise<ParamsCompras & { agrupar?: string }> }) {
  await requirePersonaActualV2();
  // `pagar` es una orden de una sola vez («abre el modal de esta comprobante»), no un filtro: no
  // debe viajar en los enlaces de paginación ni en los filtros. `agrupar` sí viaja, pero solo si
  // se eligió (la vista por defecto no ensucia la URL).
  const { pagar, agrupar: agruparParam, ...params } = await searchParams;
  const agrupar = agruparParam === "proveedor" ? "proveedor" : "urgencia";
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const [{ filas: compras, siguiente }, resumen, extra, vencimiento, salidas, tramos, directorio, proveedores, compraAPagar] = await Promise.all([
    listarPorPagar(filtros, cursor),
    getResumenCompras(),
    getResumenComprasExtra(),
    getDeudaPorVencimiento(),
    getSalidasCaja30d(),
    getPorPagarTramos({ proveedorId: filtros.proveedorId, condicion: filtros.condicion, soloVencidas: filtros.soloVencidas, busqueda: filtros.busqueda }),
    getProveedoresActivos(),
    getProveedores(),
    pagar && /^[0-9a-f-]{36}$/i.test(pagar) ? getCompra(pagar) : null,
  ]);
  // Solo se abre si de verdad hay algo que pagar; un enlace viejo a un comprobante ya saldado o
  // anulado cae en la lista sin más.
  const abrirPago = compraAPagar && compraAPagar.estado === "vigente" && compraAPagar.saldo > 0 ? compraAPagar : null;
  const hayMasPaginas = !!siguiente || !!cursor;

  // Datos para pagar (banco, cuenta, Yape, plazo) que el modal de pago juntos muestra sin obligar
  // a ir a la ficha del proveedor. Solo lo de los proveedores que aparecen en esta página.
  const datosProveedores: Record<string, DatosPagoProveedor> = {};
  for (const c of compras) {
    const p = proveedores.find((x) => x.id === c.proveedorId);
    if (p && !datosProveedores[p.id]) {
      datosProveedores[p.id] = {
        banco: p.banco,
        cuentaBancaria: p.cuenta_bancaria,
        telefono: p.telefono,
        plazoCreditoDias: p.plazo_credito_dias,
        formaPagoPreferida: p.forma_pago_preferida,
        saldoFavor: p.saldo_favor ?? 0,
      };
    }
  }

  // Enlaces del selector «Por urgencia | Por proveedor»: conservan los demás parámetros.
  const hrefAgrupar = (vista: "urgencia" | "proveedor") => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "cursor") q.set(k, String(v));
    if (vista === "proveedor") q.set("agrupar", "proveedor");
    const s = q.toString();
    return s ? `/compras/por-pagar?${s}` : "/compras/por-pagar";
  };
  // «Params» de la paginación: incluye `agrupar` para no perder la vista al pasar de página.
  const paramsPaginacion = agrupar === "proveedor" ? { ...params, agrupar } : params;

  const conDeuda = resumen.deuda > 0;
  const hastaSemana = diaMes(sumarDias(hoyLima(), 7));
  const cifra = (n: number, sing: string, plu: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? sing : plu}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Lo que se debe a proveedores, de lo más urgente a lo que puede esperar. Se paga desde cada fila, o varios comprobantes del mismo proveedor juntos.
        </p>
      </div>

      {/* Cuatro cifras, todas con acción. `grid-cols-2` también en celular: con las tarjetas
          apiladas a ancho completo la lista —lo que se vino a ver— quedaba a ~830 px de scroll.
          «Deuda total» ocupa las dos columnas por ser la cifra ancla. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <TarjetaCifra compacta punto="neutro" etiqueta="Deuda total" valor={soles(resumen.deuda)}>
            {conDeuda ? cifra(resumen.conSaldo, "comprobante", "comprobantes") : "Todo pagado"}
          </TarjetaCifra>
        </div>
        <TarjetaCifra
          compacta
          acento={resumen.vencidas > 0}
          punto={resumen.vencidas > 0 ? "rojo" : "neutro"}
          tono={resumen.vencidas > 0 ? "text-rojo" : undefined}
          detalleTono={resumen.vencidas > 0 ? "text-rojo" : undefined}
          etiqueta="Vencido"
          valor={soles(resumen.vencido)}
          href={resumen.vencidas > 0 ? "/compras/por-pagar?vencidas=1" : undefined}
        >
          {resumen.vencidas > 0 ? `${cifra(resumen.vencidas, "comprobante vencido", "comprobantes vencidos")} · pagar ya →` : "Nada vencido"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={resumen.porVencer > 0 ? "ambar" : "neutro"}
          tono={resumen.porVencer > 0 ? "text-ambar-profundo" : undefined}
          detalleTono={resumen.porVencer > 0 ? "text-ambar-profundo" : undefined}
          etiqueta="Vence esta semana"
          valor={soles(resumen.porVencerMonto)}
          href={resumen.porVencer > 0 ? "#tramo-semana" : undefined}
        >
          {resumen.porVencer > 0 ? `${cifra(resumen.porVencer, "comprobante", "comprobantes")} · hasta el ${hastaSemana} →` : "Ninguno en los próximos 7 días"}
        </TarjetaCifra>
        {conDeuda && extra.topProveedorNombre ? (
          <TarjetaCifra compacta punto="neutro" etiqueta="Concentración" valor={`${Math.round(extra.topProveedorPct)} %`} href={`/compras/por-pagar?prov=${extra.topProveedorId}`}>
            {extra.topProveedorNombre} concentra la deuda
          </TarjetaCifra>
        ) : (
          <TarjetaCifra compacta vacia etiqueta="Concentración" valor="—">
            Aparece cuando haya deuda
          </TarjetaCifra>
        )}
      </div>

      <SaldosAFavor
        saldos={proveedores
          .filter((p) => (p.saldo_favor ?? 0) > 0)
          .map((p) => ({ proveedorId: p.id, nombre: p.nombre, saldoFavor: p.saldo_favor ?? 0, deuda: p.saldo ?? 0 }))
          .sort((a, b) => b.saldoFavor - a.saldoFavor)}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <DeudaPorVencimiento tramos={vencimiento} />
        <SalidasDeCaja salidas={salidas} />
      </div>

      <FiltrosCompras
        proveedores={directorio}
        visibles={["proveedor", "vencidas", "condicion"]}
        accionesAntes={
          <SegmentoEnlaces
            etiquetaAccesible="Cómo agrupar la deuda"
            activo={agrupar}
            opciones={[
              { valor: "urgencia", etiqueta: "Por urgencia", href: hrefAgrupar("urgencia") },
              { valor: "proveedor", etiqueta: "Por proveedor", href: hrefAgrupar("proveedor") },
            ]}
          />
        }
      />

      {compras.length === 0 && !cursor ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {hayFiltros ? "Ningún comprobante por pagar coincide con esos filtros." : "No hay comprobantes con saldo pendiente. Todo pagado."}
        </p>
      ) : (
        <PorPagarLista compras={compras} totales={tramos} agrupar={agrupar} hayMasPaginas={hayMasPaginas} datosProveedores={datosProveedores} />
      )}

      <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={paramsPaginacion} pathname="/compras/por-pagar" />

      {abrirPago && <PagoDesdeUrl compra={abrirPago} saldoFavor={proveedores.find((p) => p.id === abrirPago.proveedorId)?.saldo_favor ?? 0} />}
    </div>
  );
}
