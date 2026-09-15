import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCajaAbierta, getResumenCaja, getMovimientosCaja } from "@/lib/caja";
import { AbrirCajaFormV2 } from "@/components/AbrirCajaFormV2";
import { CajaAbiertaPanel } from "@/components/CajaAbiertaPanel";

// Prioridad 1 (2026-09-12): Caja/POS. Sin caja abierta, la única acción
// posible es abrirla — `registrar_venta` la exige (0008_caja_y_pagos.sql),
// así que ofrecer otra cosa acá sería un enlace que la RPC igual rechazaría.
export default async function CajaPage() {
  const persona = await requirePersonaActualV2();
  const caja = await getCajaAbierta(persona.ubicacionId);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Caja · {persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {caja ? "Caja abierta" : "Sin caja abierta"}
        </h1>
      </div>

      {/* Abrir/cerrar caja cambia de componente entero (formulario ↔ panel), así que
          React ya lo remonta solo — `anim-entrada` no necesita `key` para retriggerse,
          entra de nuevo cada vez que este `router.refresh()` cambia de rama. */}
      {!caja ? (
        <div className="anim-entrada">
          <AbrirCajaFormV2 ubicacionId={persona.ubicacionId} ubicacionEtiqueta={persona.ubicacionEtiqueta} />
        </div>
      ) : (
        <div className="anim-entrada">
          <CajaConDatos caja={caja} />
        </div>
      )}
    </div>
  );
}

async function CajaConDatos({
  caja,
}: {
  caja: NonNullable<Awaited<ReturnType<typeof getCajaAbierta>>>;
}) {
  const [resumen, movimientos] = await Promise.all([
    getResumenCaja(caja.id),
    getMovimientosCaja(caja.id),
  ]);
  return <CajaAbiertaPanel caja={caja} resumen={resumen} movimientos={movimientos} />;
}
