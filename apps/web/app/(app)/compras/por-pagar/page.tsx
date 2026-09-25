import Link from "next/link";
import { exigirModulo } from "@/lib/persona-actual";
import { getMisPartesDeCompras, porPagarConMiParte } from "@/lib/compras-mi-parte";
import { partesPorPagar } from "@/lib/compras-mi-parte-reglas";
import { MisPartesDeCompras } from "@/components/MisPartesDeCompras";
import { listarPorPagar, getPagosDeCompras, getResumenCompras, filtrosDesdeParams, getProveedoresActivos, getCompra, type ParamsCompras } from "@/lib/compras";
import { getDeudaPorVencimiento, getNotasPendientes, getPorPagarTramos, getResumenComprasExtra, getSalidasCaja30d } from "@/lib/compras-indicadores";
import { getProveedores } from "@/lib/proveedores";
import { getUbicaciones } from "@/lib/ubicaciones";
import { diaMes, hoyLima, sumarDias } from "@/lib/fechas-lima";
import { idsConFaltanteCerrado } from "@/lib/nota-pendiente-reglas";
import { concentracionPorProveedor } from "@/lib/por-pagar-reglas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { FiltrosCompras } from "@/components/FiltrosCompras";
import { Paginacion, leerCursor } from "@/components/Paginacion";
import { PagoDesdeUrl } from "@/components/CompraDetallePanel";
import { DeudaPorVencimiento } from "@/components/DeudaPorVencimiento";
import { SalidasDeCaja } from "@/components/SalidasDeCaja";
import { PorPagarLista } from "@/components/PorPagarLista";
import { PorPagarProvider } from "@/components/PorPagarContexto";
import { BarraConcentracion, BotonSoloVencidas, SelectorAgrupar } from "@/components/PorPagarControles";
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
//
// Por pagar responde (2026-09-19, spike `docs/maquetas/por-pagar-spike-2026-09/`, mismo modelo que ADR-0128):
// la pantalla llega escalonada (cada pieza sube y se asienta, las cifras cuentan desde 0, las barras se llenan)
// y sus piezas conversan — apuntar a un tramo, una semana de caja o un proveedor enciende las filas que le
// corresponden (`PorPagarContexto`). Todo eso es presentación: las cifras y los filtros son los de siempre.
export default async function PorPagarPage({ searchParams }: { searchParams: Promise<ParamsCompras & { agrupar?: string; marcar?: string }> }) {
  const persona = await exigirModulo("por_pagar"); // 20260923130000: la puerta del módulo Por pagar
  // ADR-0184 (F4-F5): las tiendas del comprador, para que «Pagar» sepa con cuál paga.
  const misTiendas = persona.rol === "lider" ? undefined : persona.tiendasCompra;
  // `pagar` y `marcar` son órdenes de una sola vez («abre el modal de este comprobante» / «llega con los de este
  // proveedor marcados»), no filtros: no deben viajar en los enlaces de paginación ni en los filtros. `agrupar` sí
  // viaja, pero solo si se eligió (la vista por defecto no ensucia la URL).
  const { pagar, agrupar: agruparParam, marcar, ...params } = await searchParams;
  const agrupar = agruparParam === "proveedor" ? "proveedor" : "urgencia";
  const filtros = filtrosDesdeParams(params);
  const cursor = leerCursor(params.cursor);
  const hayFiltros = Object.values(filtros).some(Boolean);

  // Qué comprobantes esperan su nota de crédito por faltante (para no pagar de más lo que el proveedor va a
  // acreditar) depende de los ids de la página: se pide ENCADENADA a la lista, y solo si algún comprobante de
  // la página tiene algo cerrado, sin frenar las demás consultas.
  const [{ pagina: { filas: compras, siguiente }, notas, pagos }, resumen, extra, vencimiento, salidas, tramos, directorio, proveedores, compraAPagar, ubicaciones, misPartes] = await Promise.all([
    // Notas pendientes y pagos previos dependen de los ids de la página: se piden encadenados y solo de lo que hace falta (los pagos, solo de
    // los comprobantes que ya recibieron alguno), sin frenar las demás consultas.
    // ADR-0187: quien no es líder ve en cada fila SU parte (la factura que gestiona su tienda llega entera). El cursor de la
    // página siguiente sale de la página sin recortar, así que quitar una fila ya saldada por mi tienda no salta ninguna.
    listarPorPagar(filtros, cursor).then(async (entera) => {
      const pagina = misTiendas ? { ...entera, filas: await porPagarConMiParte(entera.filas) } : entera;
      const [notas, pagos] = await Promise.all([getNotasPendientes(idsConFaltanteCerrado(pagina.filas)), getPagosDeCompras(pagina.filas.filter((c) => c.pagado > 0).map((c) => c.id))]);
      return { pagina, notas, pagos };
    }),
    getResumenCompras(),
    getResumenComprasExtra(),
    getDeudaPorVencimiento(),
    getSalidasCaja30d(),
    getPorPagarTramos({ proveedorId: filtros.proveedorId, condicion: filtros.condicion, soloVencidas: filtros.soloVencidas, busqueda: filtros.busqueda, tipo: filtros.tipo, desde: filtros.desde, hasta: filtros.hasta, destinoId: filtros.destinoId }),
    getProveedoresActivos(),
    getProveedores(),
    pagar && /^[0-9a-f-]{36}$/i.test(pagar)
      ? getCompra(pagar).then(async (c) => (c && misTiendas ? ((await porPagarConMiParte([c]))[0] ?? null) : c))
      : null,
    getUbicaciones(),
    // ADR-0184 (F3-b): la parte de mi tienda en comprobantes que gestiona otra (el líder los ve enteros en la lista).
    misTiendas ? getMisPartesDeCompras() : Promise.resolve([]),
  ]);
  // Solo se abre si de verdad hay algo que pagar; un enlace viejo a un comprobante ya saldado o
  // anulado cae en la lista sin más.
  const abrirPago = compraAPagar && compraAPagar.estado === "vigente" && compraAPagar.saldo > 0 ? compraAPagar : null;
  const hayMasPaginas = !!siguiente || !!cursor;

  // «Pagar con este saldo» (A favor con proveedores) llega con `prov` + `marcar=1`: los comprobantes de ese
  // proveedor ya vienen marcados y la barra de «Pagar juntos» abierta, en vez de dejar la marcación a mano.
  const seleccionInicial = marcar === "1" && filtros.proveedorId ? compras.filter((c) => c.proveedorId === filtros.proveedorId).map((c) => c.id) : [];

  // Datos para pagar (banco, cuenta, Yape, plazo) que el modal de pago juntos muestra sin obligar
  // a ir a la ficha del proveedor. Solo lo de los proveedores que aparecen en esta página.
  const datosPago = (p: (typeof proveedores)[number]): DatosPagoProveedor => ({
    proveedorId: p.id,
    banco: p.banco,
    cuentaBancaria: p.cuenta_bancaria,
    cci: p.cci,
    celularBilletera: p.celular_billetera,
    billeteras: p.billeteras,
    titular: p.titular_cuenta,
    plazoCreditoDias: p.plazo_credito_dias,
    formaPagoPreferida: p.forma_pago_preferida,
    saldoFavor: p.saldo_favor ?? 0,
  });
  const datosProveedores: Record<string, DatosPagoProveedor> = {};
  for (const c of compras) {
    const p = proveedores.find((x) => x.id === c.proveedorId);
    if (p && !datosProveedores[p.id]) datosProveedores[p.id] = datosPago(p);
  }
  const proveedorAPagar = abrirPago ? proveedores.find((x) => x.id === abrirPago.proveedorId) : undefined;

  // Enlace que conserva los demás parámetros y cambia solo `prov` (o lo quita si ya era ese: un segundo clic apaga el filtro).
  const hrefProveedor = (id: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "cursor" && k !== "prov") q.set(k, String(v));
    if (agrupar === "proveedor") q.set("agrupar", "proveedor");
    if (filtros.proveedorId !== id) q.set("prov", id);
    const s = q.toString();
    return s ? `/compras/por-pagar?${s}` : "/compras/por-pagar";
  };
  // «Params» de la paginación: incluye `agrupar` para no perder la vista al pasar de página.
  const paramsPaginacion = agrupar === "proveedor" ? { ...params, agrupar } : params;

  // La barra de concentración: los 3 proveedores a los que más se les debe y «Otros». Sale de los saldos por
  // proveedor que ya trae `getProveedores` (no hay consulta nueva); el «62 %» grande sigue saliendo de la base.
  const segmentos = concentracionPorProveedor(proveedores.map((p) => ({ id: p.id, nombre: p.nombre, saldo: p.saldo ?? 0 }))).map((s) => ({
    ...s,
    href: s.id ? hrefProveedor(s.id) : null,
  }));

  const conDeuda = resumen.deuda > 0;
  const hastaSemana = diaMes(sumarDias(hoyLima(), 7));
  const cifra = (n: number, sing: string, plu: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? sing : plu}`;
  const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } });

  return (
    <PorPagarProvider agruparInicial={agrupar}>
      <div className="space-y-6">
        <div {...entra(0)}>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
          <p className="mt-1 text-sm text-tinta/65">
            Lo que se debe a proveedores, de lo más urgente a lo que puede esperar. Se paga desde cada fila, o varios comprobantes del mismo proveedor juntos.
          </p>
        </div>

        {/* Cuatro cifras, todas con acción. `grid-cols-2` también en celular: con las tarjetas
            apiladas a ancho completo la lista —lo que se vino a ver— quedaba a ~830 px de scroll.
            «Deuda total» ocupa las dos columnas por ser la cifra ancla. Las cifras cuentan desde 0 al llegar
            y, cuando algo las mueve (un pago), cuentan hasta su valor nuevo. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1 [&>*]:h-full">
            <TarjetaCifra compacta punto="neutro" etiqueta="Deuda total" valor={<CifraQueCuenta valor={resumen.deuda} formato="soles" alMontar />} {...entra(1)}>
              {conDeuda ? cifra(resumen.conSaldo, "comprobante", "comprobantes") : "Todo pagado"}
            </TarjetaCifra>
          </div>
          <TarjetaCifra
            compacta
            acentoTrazo={resumen.vencidas > 0}
            punto="neutro"
            tono={resumen.vencidas > 0 ? "text-rojo max-sm:text-[26px] whitespace-nowrap" : undefined}
            etiqueta="Vencido"
            valor={<CifraQueCuenta valor={resumen.vencido} formato="soles" alMontar />}
            href={resumen.vencidas > 0 ? "/compras/por-pagar?vencidas=1" : undefined}
            {...entra(2)}
          >
            {resumen.vencidas > 0 ? `${cifra(resumen.vencidas, "comprobante vencido", "comprobantes vencidos")} · pagar ya →` : "Nada vencido"}
          </TarjetaCifra>
          <TarjetaCifra
            compacta
            punto={resumen.porVencer > 0 ? "ambar" : "neutro"}
            puntoPulsa={resumen.porVencer > 0}
            tono={resumen.porVencer > 0 ? "text-ambar-profundo" : undefined}
            detalleTono={resumen.porVencer > 0 ? "text-ambar-profundo" : undefined}
            etiqueta="Vence esta semana"
            valor={<CifraQueCuenta valor={resumen.porVencerMonto} formato="soles" alMontar />}
            href={resumen.porVencer > 0 ? "#tramo-semana" : undefined}
            {...entra(3)}
          >
            {resumen.porVencer > 0 ? `${cifra(resumen.porVencer, "comprobante", "comprobantes")} · hasta el ${hastaSemana} →` : "Ninguno en los próximos 7 días"}
          </TarjetaCifra>
          {conDeuda && extra.topProveedorNombre ? (
            <TarjetaCifra compacta punto="neutro" etiqueta="Concentración" valor={<CifraQueCuenta valor={extra.topProveedorPct} formato="porcentaje" alMontar />} {...entra(4)} className="anim-entra col-span-2 sm:col-span-1">
              {extra.topProveedorNombre} concentra la deuda
              <BarraConcentracion segmentos={segmentos} proveedorActivo={filtros.proveedorId ?? null} />
            </TarjetaCifra>
          ) : (
            <TarjetaCifra compacta vacia etiqueta="Concentración" valor="—" {...entra(4)} className="anim-entra col-span-2 sm:col-span-1">
              Aparece cuando haya deuda
            </TarjetaCifra>
          )}
        </div>

        <SaldosAFavor
          indice={5}
          saldos={proveedores
            .filter((p) => (p.saldo_favor ?? 0) > 0)
            .map((p) => ({ proveedorId: p.id, nombre: p.nombre, saldoFavor: p.saldo_favor ?? 0, deuda: p.saldo ?? 0 }))
            .sort((a, b) => b.saldoFavor - a.saldoFavor)}
        />

        <MisPartesDeCompras partes={partesPorPagar(misPartes)} pagar indice={5} />

        {/* `grid-cols-1` = `minmax(0, 1fr)`: sin él, en celular la columna única crece hasta el contenido más ancho (las etiquetas de las barras) y la tarjeta se sale de la pantalla. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DeudaPorVencimiento tramos={vencimiento} indice={6} />
          <SalidasDeCaja salidas={salidas} indice={7} />
        </div>

        <div {...entra(8)}>
          <FiltrosCompras
            proveedores={directorio}
            tiendas={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
            visibles={["proveedor", "destino", "vencidas", "condicion"]}
            estiloSpike
            accionesAntes={
              <div className="flex items-start gap-3">
                <BotonSoloVencidas cantidad={resumen.vencidas} />
                <SelectorAgrupar />
              </div>
            }
          />
        </div>

        {compras.length === 0 && !cursor ? (
          conDeuda || hayFiltros ? (
            <div className="card-cayla p-5 text-sm text-tinta/75">
              Ningún comprobante por pagar coincide con esos filtros.
              <Link href="/compras/por-pagar" className="label-cayla ml-3 text-[11px] text-rojo hover:underline">
                Limpiar filtros
              </Link>
            </div>
          ) : (
            <TodoPagado />
          )
        ) : (
          <PorPagarLista
            compras={compras}
            totales={tramos}
            hayMasPaginas={hayMasPaginas}
            datosProveedores={datosProveedores}
            notas={notas}
            pagos={pagos}
            seleccionInicial={seleccionInicial}
            indice={10}
            misTiendas={misTiendas}
          />
        )}

        <Paginacion mostradas={compras.length} siguiente={siguiente} hayCursor={!!cursor} params={paramsPaginacion} pathname="/compras/por-pagar" />

        {abrirPago && <PagoDesdeUrl compra={abrirPago} saldoFavor={proveedorAPagar?.saldo_favor ?? 0} datos={proveedorAPagar ? datosPago(proveedorAPagar) : undefined} misTiendas={misTiendas} />}
      </div>
    </PorPagarProvider>
  );
}

/** «Todo pagado»: el círculo y el tilde se DIBUJAN (trazo). Es lo que se ve al pagar el último comprobante. */
function TodoPagado() {
  return (
    <div className="card-cayla anim-revelar px-5 py-11 text-center">
      <svg aria-hidden viewBox="0 0 54 54" className="mx-auto mb-2.5 h-[54px] w-[54px] fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle pathLength={1} cx="27" cy="27" r="24" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
        <path pathLength={1} d="M16 28l8 8 15-17" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 12 }} />
      </svg>
      <p className="font-display text-[19px] italic text-tinta/65">Todo pagado. No queda nada por pagar.</p>
    </div>
  );
}
