import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCajaAbierta, getResumenCaja, getMovimientosCaja, getSeriesVentasCaja, getHistorialCierres } from "@/lib/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CajaAbiertaPanel, type VentaDelDia } from "@/components/CajaAbiertaPanel";

// Prioridad 1 (2026-09-12): Caja/POS. Sin caja abierta, la única acción
// posible es abrirla — `registrar_venta` la exige (0008_caja_y_pagos.sql),
// así que ofrecer otra cosa acá sería un enlace que la RPC igual rechazaría.
export default async function CajaPage() {
  const persona = await requirePersonaActualV2();
  const caja = await getCajaAbierta(persona.ubicacionId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Caja · {persona.ubicacionEtiqueta}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">
            {caja ? "Caja abierta" : "Sin caja abierta"}
          </h1>
        </div>
        <Link
          href="/caja/historial"
          className="label-cayla rounded-md px-2 py-1.5 text-[11px] text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
        >
          Historial de cierres →
        </Link>
      </div>

      {/* Abrir/cerrar caja cambia de componente entero (formulario ↔ panel), así que
          React ya lo remonta solo — `anim-entrada` no necesita `key` para retriggerse,
          entra de nuevo cada vez que este `router.refresh()` cambia de rama. */}
      {!caja ? (
        <div className="anim-entrada">
          <AbrirCajaFormV2 ubicacionId={persona.ubicacionId} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </div>
      ) : (
        <CajaConDatos
          caja={caja}
          ubicacionNombre={persona.ubicacionEtiqueta}
          personaNombre={persona.nombre}
          personaRol={persona.rol}
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
}: {
  caja: NonNullable<Awaited<ReturnType<typeof getCajaAbierta>>>;
  ubicacionNombre: string;
  personaNombre: string;
  personaRol: "lider" | "integrante";
}) {
  const supabase = await createClient();
  const [resumen, movimientos, series, ubicaciones, historial, resVentasHoy] = await Promise.all([
    getResumenCaja(caja.id),
    getMovimientosCaja(caja.id),
    getSeriesVentasCaja(caja.id),
    getUbicaciones(),
    getHistorialCierres(),
    supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: caja.ubicacionId }),
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

  const metaVentaDiaria = ubicaciones.find((u) => u.id === caja.ubicacionId)?.metaVentaDiaria ?? null;

  return (
    <CajaAbiertaPanel
      ubicacionNombre={ubicacionNombre}
      personaNombre={personaNombre}
      personaRol={personaRol}
      caja={caja}
      resumen={resumen}
      movimientos={movimientos}
      series={series}
      ventasHoy={ventasHoy}
      metaVentaDiaria={metaVentaDiaria}
      cierresRecientes={historial}
    />
  );
}
