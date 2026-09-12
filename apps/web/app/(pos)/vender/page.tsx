import { Suspense } from "react";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { getCajaAbierta } from "@/lib/finanzas";
import { tolerar } from "@/lib/resultado";
import { createClient } from "@/lib/supabase/server";
import { CajaPanel } from "@/components/CajaPanel";

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

const LIMA_OFFSET_MS = 5 * 3600 * 1000;
function inicioDiaLima(): Date {
  const lima = new Date(Date.now() - LIMA_OFFSET_MS);
  lima.setUTCHours(0, 0, 0, 0);
  return new Date(lima.getTime() + LIMA_OFFSET_MS);
}

function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Punto de venta a pantalla completa (fuera de `(app)`, sin el sidebar de AppShell — es la
 * misma "Caja del día" de siempre, con el layout de POS pedido el 2026-09-12). La
 * navegación a Facturación sigue en `(app)/vender/facturacion`, con su propio chrome; el
 * regreso desde acá es "Cerrar caja" — esto es un modo de trabajo enfocado, no un rincón
 * más del ERP.
 */
export default async function VenderPosPage() {
  return (
    <Suspense fallback={<CargandoPos />}>
      <PuntoDeVentaCargado />
    </Suspense>
  );
}

function CargandoPos() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-crema">
      <p className="label-cayla text-[11px] text-tinta/50">Cargando caja…</p>
    </main>
  );
}

async function PuntoDeVentaCargado() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();
  const [variantes, cajaAbierta, resCodigos] = await Promise.all([
    getCatalogoConStock(persona),
    getCajaAbierta(persona.sedeId),
    supabase.from("codigos_barras").select("codigo, variante_id"),
  ]);
  const codigos = tolerar(resCodigos, "los códigos de barras");

  const variantesParaVenta = variantes.map((v) => ({
    varianteId: v.varianteId,
    codigo: v.codigo,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
    categoria: v.categoria,
    precio: v.precio,
    stockAqui: v.stockPorSede[persona.sedeCodigo] ?? 0,
  }));

  const porCodigoBarras: Record<string, string> = {};
  for (const c of codigos.datos ?? []) porCodigoBarras[c.codigo] = c.variante_id;

  return (
    <CajaPanel
      sedeId={persona.sedeId}
      sedeCodigo={persona.sedeCodigo}
      cajaAbierta={cajaAbierta}
      variantes={variantesParaVenta}
      porCodigoBarras={porCodigoBarras}
      personaNombre={persona.nombre}
      personaRolEtiqueta={persona.rol === "lider" ? "Líder" : "Integrante"}
      ventasHoyNode={
        <Suspense fallback={<p className="px-1 py-4 text-center text-xs text-tinta/50">Cargando ventas de hoy…</p>}>
          <VentasDeHoy sedeId={persona.sedeId} sedeCodigo={persona.sedeCodigo} />
        </Suspense>
      }
    />
  );
}

/** Mismo query que la versión con AppShell — ver ese historial de decisiones ahí. Acá solo
 *  la lista: el total y el "sin ventas todavía" ya los muestra el panel de ticket. */
async function VentasDeHoy({ sedeId, sedeCodigo }: { sedeId: string; sedeCodigo: string }) {
  const supabase = await createClient();
  const { datos: ventasHoy, fallo } = tolerar(
    await supabase
      .from("ventas")
      .select("id, monto_total, metodo_pago, created_at")
      .eq("sede_id", sedeId)
      .gte("created_at", inicioDiaLima().toISOString())
      .order("created_at", { ascending: false }),
    "las ventas de hoy"
  );

  if (fallo) {
    return <p className="card-cayla border-rojo/30 px-4 py-4 text-center text-xs text-rojo-profundo">{fallo}</p>;
  }

  const ventas = ventasHoy ?? [];
  if (ventas.length === 0) {
    return (
      <p className="font-display card-cayla py-6 text-center text-sm text-tinta/60 italic">
        Aún no hay ventas hoy en {sedeCodigo}.
      </p>
    );
  }

  return (
    <div className="card-cayla divide-y divide-sand !p-0">
      {ventas.map((v) => (
        <div key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-tinta/60">{formatearHora(v.created_at)}</span>
          <span className="text-tinta/60">{ETIQUETA_METODO[v.metodo_pago] ?? v.metodo_pago}</span>
          <span className="font-medium text-tinta">S/{Number(v.monto_total).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
