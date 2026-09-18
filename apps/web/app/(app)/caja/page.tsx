import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCajaAbierta, getResumenCaja, getVentasMismaHoraSemanaAnterior, getHistorialCierres } from "@/lib/caja";
import { getDetalleCierre, type EventoCaja } from "@/app/actions/caja";
import { getUbicaciones } from "@/lib/ubicaciones";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CajaAbiertaPanel } from "@/components/CajaAbiertaPanel";
import { comparativoSemanaAnterior, rangoHorasCaja, tendenciaCierres7Dias, ventasPorHora } from "@/lib/caja-panel-reglas";
import { horaDelDiaLima } from "@/lib/panel-serie";

// Prioridad 1 (2026-09-12): Caja/POS. Sin caja abierta, la única acción
// posible es abrirla — `registrar_venta` la exige (0008_caja_y_pagos.sql),
// así que ofrecer otra cosa acá sería un enlace que la RPC igual rechazaría.
export default async function CajaPage() {
  const persona = await requirePersonaActualV2();
  const caja = await getCajaAbierta(persona.ubicacionId);

  return (
    <div className="space-y-6">
      {!caja && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Caja · {persona.ubicacionEtiqueta}</p>
            <h1 className="font-display mt-1 text-2xl text-tinta">Sin caja abierta</h1>
          </div>
          <Link
            href="/caja/historial"
            className="label-cayla rounded-md px-2 py-1.5 text-[11px] text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
          >
            Historial de cierres →
          </Link>
        </div>
      )}

      {/* Abrir/cerrar caja cambia de componente entero (formulario ↔ panel), así que
          React ya lo remonta solo — `anim-entrada` no necesita `key` para retriggerse,
          entra de nuevo cada vez que este `router.refresh()` cambia de rama. */}
      {!caja ? (
        <div className="anim-entrada">
          <AbrirCajaFormV2 ubicacionId={persona.ubicacionId} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </div>
      ) : (
        <div className="anim-entrada">
          <CajaConDatos caja={caja} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </div>
      )}
    </div>
  );
}

async function CajaConDatos({
  caja,
  ubicacionEtiqueta,
}: {
  caja: NonNullable<Awaited<ReturnType<typeof getCajaAbierta>>>;
  ubicacionEtiqueta: string;
}) {
  const ahora = new Date();
  const [resumen, eventosHoy, ventasSemanaAnterior, ubicaciones, historial] = await Promise.all([
    getResumenCaja(caja.id),
    getDetalleCierre(caja.id),
    getVentasMismaHoraSemanaAnterior(caja.ubicacionId, ahora),
    getUbicaciones(),
    getHistorialCierres(120),
  ]);

  const ubicacion = ubicaciones.find((u) => u.id === caja.ubicacionId);
  const ventasHoy = resumen.ventasEfectivo + resumen.ventasOtros;
  const nombreDiaHoy = ahora.toLocaleDateString("es-PE", { weekday: "long", timeZone: "America/Lima" });
  const horaActual = Math.floor(horaDelDiaLima(ahora.getTime()) / 3_600_000);

  const horas = rangoHorasCaja(caja.abiertaEn, ahora);
  const esVentaActiva = (e: EventoCaja): e is Extract<EventoCaja, { tipo: "venta" }> => e.tipo === "venta" && !e.anulada;
  const porHoraMapa = ventasPorHora(eventosHoy.filter(esVentaActiva).map((e) => ({ hora: e.hora, total: e.total })));
  const ventasPorHoraArr = horas.map((h) => ({ hora: h, monto: porHoraMapa.get(h) ?? 0 }));

  return (
    <CajaAbiertaPanel
      caja={caja}
      ubicacionEtiqueta={ubicacionEtiqueta}
      resumen={resumen}
      eventosHoy={eventosHoy}
      metaVentaDiaria={ubicacion?.metaVentaDiaria ?? null}
      comparativoMeta={comparativoSemanaAnterior(ventasHoy, ventasSemanaAnterior, nombreDiaHoy)}
      ventasPorHora={ventasPorHoraArr}
      horaActual={horaActual}
      tendenciaCierres={tendenciaCierres7Dias(historial, caja.ubicacionId, ahora)}
    />
  );
}
