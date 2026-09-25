import type { CSSProperties } from "react";
import Link from "next/link";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCajaAbierta, getEsperadoCaja, getTableroCaja, getMovimientosCaja, getHistorialCierres, getUltimoCierre } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getParametrosCaja } from "@/lib/configuracion";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { UltimoCierreCaja } from "@/components/UltimoCierreCaja";
import { CajaAbiertaPanel, type VentaDelDia } from "@/components/CajaAbiertaPanel";

// Prioridad 1 (2026-09-12): Caja/POS. Sin caja abierta, la única acción
// posible es abrirla — `registrar_venta` la exige (0008_caja_y_pagos.sql),
// así que ofrecer otra cosa acá sería un enlace que la RPC igual rechazaría.
export default async function CajaPage() {
  const persona = await requirePersonaActualV2();
  const caja = await getCajaAbierta(persona.ubicacionId);
  // Sin caja (ADR-0186): el último cierre de la sede da el contexto y el monto que debería estar en el cajón.
  const ultimoCierre = caja ? null : await getUltimoCierre(persona.ubicacionId);

  return (
    // `/caja` va a todo el ancho (AppShell), pero solo el tablero de la caja abierta: sin caja, lo que hay
    // es un formulario de un campo, que conserva la columna de lectura de siempre en vez de estirarse.
    <div className={caja ? "space-y-6" : "mx-auto max-w-5xl space-y-6"}>
      {/* Sin caja: la misma cabecera de Cambios (`EncabezadoPagina`), con el historial de cierres donde Cambios
          pone sus cifras. Con caja, la cabecera la trae el propio tablero (necesita el estado de sus modales). */}
      {!caja && (
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Caja" subtitulo="Abre la caja para empezar a vender.">
          <Link
            href="/caja/historial"
            className="label-cayla rounded-md px-2 py-1.5 text-[11px] text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
          >
            Historial de cierres →
          </Link>
        </EncabezadoPagina>
      )}

      {/* Abrir/cerrar caja cambia de componente entero (formulario ↔ panel), así que
          React ya lo remonta solo — `anim-sube` no necesita `key` para retriggerse,
          entra de nuevo cada vez que este `router.refresh()` cambia de rama. */}
      {!caja ? (
        <div
          className={`anim-sube grid items-start gap-4 ${ultimoCierre ? "md:grid-cols-[1.1fr_1fr]" : ""}`}
          style={{ "--i": 1 } as CSSProperties}
        >
          {ultimoCierre && <UltimoCierreCaja cierre={ultimoCierre} />}
          <AbrirCajaFormV2
            ubicacionId={persona.ubicacionId}
            ubicacionEtiqueta={persona.ubicacionEtiqueta}
            esperado={ultimoCierre?.montoFondo ?? null}
          />
        </div>
      ) : (
        <CajaConDatos
          caja={caja}
          ubicacionNombre={persona.ubicacionEtiqueta}
          personaNombre={persona.nombre}
          personaRol={persona.rol}
          puedeCerrar={puede(persona, "gestionarCaja")}
        />
      )}
    </div>
  );
}

async function CajaConDatos({
  caja,
  ubicacionNombre,
  personaNombre,
  personaRol,
  puedeCerrar,
}: {
  caja: NonNullable<Awaited<ReturnType<typeof getCajaAbierta>>>;
  ubicacionNombre: string;
  personaNombre: string;
  personaRol: "lider" | "integrante";
  puedeCerrar: boolean;
}) {
  const supabase = await createClient();
  const [{ resumen, series }, movimientos, ubicaciones, historial, resVentasHoy, parametros, esperadoCajon] = await Promise.all([
    getTableroCaja(caja.id),
    getMovimientosCaja(caja.id),
    getUbicaciones(),
    getHistorialCierres(),
    supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: caja.ubicacionId }),
    // La meta de hoy y el fondo que rigen (ADR-0195 F1): lo normal de la tienda + las campañas. `null` si la base
    // todavía no tiene fn_parametros_caja: se usa la meta de antes y el cierre no pide fondo.
    getParametrosCaja(caja.ubicacionId, hoyLima()),
    // «Al cerrar»: cuánto debería haber en el cajón. Solo a quien puede cerrar (fn_esperado_caja lo exige).
    puedeCerrar ? getEsperadoCaja(caja.id) : Promise.resolve(null),
  ]);

  const { datos: filasVentas, fallo } = tolerar(resVentasHoy, "las ventas de hoy");
  const ventasHoy: VentaDelDia[] = fallo
    ? []
    : (filasVentas ?? []).map((v) => ({
        ventaId: v.venta_id,
        hora: v.hora,
        vendedor: v.vendedor ?? null,
        metodosPago: v.metodos_pago ?? null,
        total: Number(v.total),
      }));

  const metaVentaDiaria = parametros ? parametros.meta : (ubicaciones.find((u) => u.id === caja.ubicacionId)?.metaVentaDiaria ?? null);
  const horaCierre = ubicaciones.find((u) => u.id === caja.ubicacionId)?.horaCierre ?? null;

  return (
    <CajaAbiertaPanel
      ubicacionNombre={ubicacionNombre}
      personaNombre={personaNombre}
      personaRol={personaRol}
      puedeCerrar={puedeCerrar}
      caja={caja}
      resumen={resumen}
      movimientos={movimientos}
      series={series}
      ventasHoy={ventasHoy}
      metaVentaDiaria={metaVentaDiaria}
      parametros={parametros}
      esperadoCajon={esperadoCajon}
      horaCierre={horaCierre}
      cierresRecientes={historial}
    />
  );
}
