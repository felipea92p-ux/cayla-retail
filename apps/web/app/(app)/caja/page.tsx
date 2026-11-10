import { puede, requirePersonaActualV2, veModulo, type PersonaActualV2 } from "@/lib/persona-actual";
import { tickets, vendidoHasta } from "@/lib/caja-comparativa-reglas";
import { getCajaAbierta, getTableroCaja, getMovimientosCaja, getHistorialCierres, getPagosDelDia, diaAnterior } from "@/lib/caja";
import { getContextoTableroCaja } from "@/lib/caja-tablero";
import { getCategoriasGasto, getContextoGastos, getGastosDeCaja, getProveedoresParaGasto } from "@/lib/gastos";
import { DIAS_FRECUENCIA, ordenarPorFrecuencia } from "@/lib/gasto-rapido-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { getUbicaciones } from "@/lib/ubicaciones";
import { horaCierreDeLaCaja } from "@/lib/recordatorio-cierre";
import { getEmpresasAqui } from "@/lib/empresas-de-sede";
import { getVendidoPorEmpresaDeCajas } from "@/lib/vendido-por-empresa";
import { repartoDeEmpresas } from "@/lib/vendido-por-empresa-reglas";
import { getParametrosCaja } from "@/lib/configuracion";
import { hoyLima } from "@/lib/fechas-lima";
import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonHistorialCierres } from "@/components/caja/BotonHistorialCierres";
import { AbrirCajaPantalla } from "@/components/caja/AbrirCajaPantalla";
import { CajaAbiertaPanel, type VentaDelDia } from "@/components/CajaAbiertaPanel";

// Prioridad 1 (2026-09-12): Caja/POS. Sin caja abierta, la única acción
// posible es abrirla — `registrar_venta` la exige (0008_caja_y_pagos.sql),
// así que ofrecer otra cosa acá sería un enlace que la RPC igual rechazaría.
export default async function CajaPage({ searchParams }: { searchParams: Promise<{ cerrar?: string }> }) {
  const persona = await requirePersonaActualV2();
  // `?cerrar=1`: se llegó desde «Cerrar caja» del recordatorio de cierre (ADR-0305) y el cierre sale ya abierto.
  const abrirCierre = (await searchParams).cerrar === "1";
  const caja = await getCajaAbierta(persona.ubicacionId);
  // Sin caja (ADR-0186): el último cierre de la sede da el contexto y el monto que debería estar en el cajón.
  // Con los últimos 7 de la sede se dibuja además la racha de «Último cierre» (2026-10-08).
  // Con la caja cerrada también se ve lo que ayuda a abrir bien (maqueta «2 · Hoja con resumen», 2026-11-03): lo vendido ayer, la meta de hoy
  // y la hora de cierre. Cada lectura puede fallar sola (principio 9): lo que no llegue, no se dibuja. Las cuatro van a la vez (antes, los
  // cierres primero y el resto después: una ida a la base más al abrir Caja).
  const hoyAbrir = hoyLima();
  const [cierresRecientesSede, pagosAyer, parametrosAbrir, ubicacionesAbrir] = caja
    ? [[], null, null, []]
    : await Promise.all([
        getHistorialCierres(7, false, persona.ubicacionId),
        getPagosDelDia(persona.ubicacionId, diaAnterior(hoyAbrir)),
        getParametrosCaja(persona.ubicacionId, hoyAbrir),
        getUbicaciones(),
      ]);
  const ultimoCierre = cierresRecientesSede[0] ?? null;
  const sedeAbrir = ubicacionesAbrir.find((u) => u.id === persona.ubicacionId) ?? null;

  return (
    // `/caja` va a todo el ancho (AppShell), con la caja abierta y también cerrada: «Abrir caja» llena la pantalla (2026-11-03).
    <div className="space-y-6">
      {/* Sin caja: la misma cabecera de Cambios (`EncabezadoPagina`), con «Historial de cierres» como su acción (un botón a la
          vista desde el 2026-10-08: el enlace gris no se notaba). Abre el MISMO modal por mes que con la caja abierta (Felipe
          2026-11-08); los últimos 7 cierres de la sede lo dibujan al instante mientras llega el mes. Con caja, la cabecera la trae
          el propio tablero (necesita el estado de sus modales). */}
      {!caja && (
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo="Caja"
          subtitulo="Cuenta el cajón y abre la caja para vender."
          acciones={
            <BotonHistorialCierres cierres={cierresRecientesSede} ubicacionId={persona.ubicacionId} ubicacionNombre={persona.ubicacionEtiqueta} />
          }
        />
      )}

      {/* Abrir/cerrar caja cambia de componente entero (formulario ↔ panel), así que
          React ya lo remonta solo — `anim-sube` no necesita `key` para retriggerse,
          entra de nuevo cada vez que este `router.refresh()` cambia de rama. */}
      {!caja ? (
        <AbrirCajaPantalla
          ubicacionId={persona.ubicacionId}
          ubicacionEtiqueta={persona.ubicacionEtiqueta}
          ultimo={ultimoCierre}
          recientes={cierresRecientesSede}
          ayer={pagosAyer ? { total: vendidoHasta(pagosAyer, null), ventas: tickets(pagosAyer) } : null}
          meta={parametrosAbrir ? parametrosAbrir.meta : (sedeAbrir?.metaVentaDiaria ?? null)}
          horaCierre={sedeAbrir?.horaCierre ?? null}
          puedeVender={veModulo(persona, "vender")}
        />
      ) : (
        <CajaConDatos caja={caja} persona={persona} abrirCierre={abrirCierre} />
      )}
    </div>
  );
}

async function CajaConDatos({
  caja,
  persona,
  abrirCierre,
}: {
  caja: NonNullable<Awaited<ReturnType<typeof getCajaAbierta>>>;
  persona: PersonaActualV2;
  abrirCierre: boolean;
}) {
  const supabase = await createClient();
  const puedeCerrar = puede(persona, "gestionarCaja");
  const registraGastos = puede(persona, "registrarGastos");
  // Registrar el gasto de hoy desde la caja es una función de Caja (ADR-0491, sobre ADR-0306): lo hace quien maneja la caja, con o sin
  // el módulo Gastos. El formulario completo (otra fecha, a crédito, un proveedor nuevo) sigue siendo de Gastos. El candado real es
  // `fn_puede_registrar_gasto`.
  const gastoDesdeCaja = registraGastos || puedeCerrar;
  const hoy = hoyLima();
  const [{ resumen, series, esperado }, movimientos, ubicaciones, historial, resVentasHoy, parametros, datosGasto, pagosHoy, pagosAyer, empresasAqui, vendidoPorCaja] = await Promise.all([
    getTableroCaja(caja.id),
    getMovimientosCaja(caja.id),
    getUbicaciones(),
    getHistorialCierres(),
    supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: caja.ubicacionId }),
    // La meta de hoy y el fondo que rigen (ADR-0195 F1): lo normal de la tienda + las campañas. `null` si la base
    // todavía no tiene fn_parametros_caja: se usa la meta de antes y el cierre no pide fondo.
    getParametrosCaja(caja.ubicacionId, hoy),
    // «Registrar gasto» abre aquí la versión rápida (mosaico ordenado por lo que más se gasta en ESTA sede, 2026-10-09) y, para un
    // proveedor nuevo o un pago a crédito, el formulario completo de Finanzas ▸ Gastos (solo a quien ve Gastos). Si la lista de
    // gastos no se puede leer, el mosaico sale en su orden de fábrica y sin ★: nunca deja de abrir (principio 9).
    gastoDesdeCaja
      ? Promise.all([
          getCategoriasGasto(),
          registraGastos ? getContextoGastos() : Promise.resolve(null),
          getProveedoresParaGasto(),
          getGastosDeCaja(caja.ubicacionId, diasAntes(hoy, DIAS_FRECUENCIA)),
        ]).then(([categorias, contexto, proveedores, recientes]) => ({
          categorias,
          completo: contexto,
          proveedores,
          frecuencia: ordenarPorFrecuencia((recientes ?? []).map((g) => ({ descripcion: g.descripcion, categoria: g.categoria, montoTotal: g.montoTotal }))),
        }))
      : Promise.resolve(null),
    // Hoy contra ayer (ADR-0319): los pagos de los dos días. Si la base no tiene la lectura, `null` y Caja se ve como antes.
    getPagosDelDia(caja.ubicacionId, hoy),
    getPagosDelDia(caja.ubicacionId, diaAnterior(hoy)),
    // De quién es lo vendido del turno (ADR-0532): solo donde conviven CAYLA y CLAURE (Lima). Si la base no responde, Caja sale como antes.
    // Solo depende de la caja: va en este mismo lote (antes, una tanda aparte después).
    getEmpresasAqui(caja.ubicacionId),
    getVendidoPorEmpresaDeCajas([caja.id]),
  ]);
  const repartoEmpresas = repartoDeEmpresas(vendidoPorCaja ? (vendidoPorCaja.get(caja.id) ?? []) : null, empresasAqui);

  const { datos: filasVentas, fallo } = tolerar(resVentasHoy, "las ventas de hoy");
  const filas = fallo ? [] : (filasVentas ?? []);
  const ventasHoy: VentaDelDia[] = filas.map((v) => ({
    ventaId: v.venta_id,
    hora: v.hora,
    vendedor: v.vendedor ?? null,
    metodosPago: v.metodos_pago ?? null,
    total: Number(v.total),
  }));
  // Pendiente antes de cerrar: comprobantes de hoy que todavía no llegaron a SUNAT.
  const comprobantesPorEnviar = filas.filter((v) => ["pendiente", "pendiente_reintento", "rechazado"].includes(String(v.comprobante_estado ?? ""))).length;

  const contexto = await getContextoTableroCaja({
    cajaId: caja.id,
    ubicacionId: caja.ubicacionId,
    hoy,
    movimientos: movimientos.map((m) => ({ id: m.id, hora: diaYHoraLima(m.creadoEn).hora })),
    comprobantesPorEnviar,
    permisos: {
      apartados: veModulo(persona, "apartados"),
      gastos: gastoDesdeCaja,
      gastosEnFinanzas: registraGastos,
      cambios: veModulo(persona, "cambios"),
      devoluciones: veModulo(persona, "devoluciones"),
      traslados: veModulo(persona, "traslados"),
      facturar: puede(persona, "facturar"),
      ajustarInventario: puede(persona, "ajustarInventario"),
    },
  });

  const metaVentaDiaria = parametros ? parametros.meta : (ubicaciones.find((u) => u.id === caja.ubicacionId)?.metaVentaDiaria ?? null);
  // El cierre del día en que se abrió esta caja, el mismo que usa el Marcador (nunca deben discrepar). Si no se puede leer, el de hoy: la pantalla no se cae por un horario.
  const horaHoy = ubicaciones.find((u) => u.id === caja.ubicacionId)?.horaCierre ?? null;
  const horaCierre = await horaCierreDeLaCaja(caja.ubicacionId, horaHoy, caja.abiertaEn).catch(() => horaHoy);

  return (
    <CajaAbiertaPanel
      abrirCierre={abrirCierre}
      ubicacionNombre={persona.ubicacionEtiqueta}
      personaNombre={persona.nombre}
      personaRol={persona.rol}
      puedeCerrar={puedeCerrar}
      caja={caja}
      resumen={resumen}
      movimientos={movimientos}
      series={series}
      ventasHoy={ventasHoy}
      metaVentaDiaria={metaVentaDiaria}
      parametros={parametros}
      esperadoCajon={esperado}
      horaCierre={horaCierre}
      cierresRecientes={historial}
      contexto={contexto}
      comparativa={pagosHoy && pagosAyer ? { hoy: pagosHoy, ayer: pagosAyer } : null}
      repartoEmpresas={repartoEmpresas}
      accesos={{
        vender: veModulo(persona, "vender"),
        cambios: veModulo(persona, "cambios"),
        devoluciones: veModulo(persona, "devoluciones"),
        apartados: veModulo(persona, "apartados"),
      }}
      gasto={datosGasto ? { ...datosGasto, esLider: persona.rol === "lider", hoy } : null}
      // «Registrar ingreso» ▸ «Préstamo de otra sede»: las otras tiendas y el taller activos (el almacén no maneja cajón).
      sedesIngreso={ubicaciones.filter((u) => u.id !== caja.ubicacionId && u.tipo !== "almacen").map((u) => ({ id: u.id, nombre: u.nombre }))}
    />
  );
}

/** «AAAA-MM-DD» de `dias` días antes (en fecha de calendario, sin hora: no la mueve el huso). */
function diasAntes(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
