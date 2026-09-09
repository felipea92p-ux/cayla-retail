import { Suspense } from "react";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { getCajaAbierta } from "@/lib/finanzas";
import { tolerar } from "@/lib/resultado";
import { createClient } from "@/lib/supabase/server";
import { CajaPanel } from "@/components/CajaPanel";
import { VenderNav } from "@/components/VenderNav";
import { EsqueletoTabla } from "@/components/Esqueleto";

const LIMA_OFFSET_MS = 5 * 3600 * 1000;
function inicioDiaLima(): Date {
  const lima = new Date(Date.now() - LIMA_OFFSET_MS);
  lima.setUTCHours(0, 0, 0, 0);
  return new Date(lima.getTime() + LIMA_OFFSET_MS);
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  pos: "POS",
  yape: "Yape",
  transferencia: "Transferencia",
};

function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Vender: la caja del día de la sede — abrir, vender, cerrar, y ver lo vendido hoy.
 *
 * Esta es la pantalla donde la espera se paga con una clienta enfrente, así que se parte en
 * tres tiempos en vez de esperar a que todo llegue junto: cabecera y navegación salen de
 * inmediato (solo dependen de saber en qué sede estás), y la caja y el historial bajan cada
 * uno por su cuenta. Antes el historial de ventas —una consulta chica— esperaba a que
 * cargara el catálogo entero solo por estar en el mismo `Promise.all`.
 */
export default async function VenderPage() {
  const persona = await requirePersonaActual();

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Vender · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Caja del día</h1>
      </div>

      <VenderNav />

      <Suspense fallback={<EsqueletoTabla filas={3} />}>
        <Caja />
      </Suspense>

      <Suspense fallback={<EsqueletoTabla filas={4} />}>
        <VentasDeHoy />
      </Suspense>
    </div>
  );
}

/** La caja y el buscador de prendas. El catálogo es lo más pesado de la pantalla. */
async function Caja() {
  const persona = await requirePersonaActual(); // memorizado por request: no cuesta viaje nuevo
  const [variantes, cajaAbierta] = await Promise.all([
    getCatalogoConStock(persona),
    getCajaAbierta(persona.sedeId),
  ]);

  const variantesParaVenta = variantes.map((v) => ({
    varianteId: v.varianteId,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
    precio: v.precio,
    stockAqui: v.stockPorSede[persona.sedeCodigo] ?? 0,
  }));

  return (
    <CajaPanel
      sedeId={persona.sedeId}
      sedeCodigo={persona.sedeCodigo}
      cajaAbierta={cajaAbierta}
      variantes={variantesParaVenta}
    />
  );
}

/**
 * Historial del día. Usa `tolerar()` y no `exigir()`, y la razón vale escribirla: acá el
 * dinero se ve, pero no se decide. El cuadre real de la caja lo calcula `cerrar_caja` en
 * el servidor (0007_finanzas.sql) contra `ventas`, no contra esta lista — así que un fallo
 * de esta consulta no puede desviar el conteo.
 *
 * Y del otro lado está el costo de fallar en duro: dejar a una Encargada sin poder vender,
 * con la clienta enfrente, porque no cargó un historial. Ese intercambio no se paga. La
 * pantalla sigue viva y avisa qué le falta.
 */
async function VentasDeHoy() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { datos: ventasHoy, fallo } = tolerar(
    await supabase
      .from("ventas")
      .select("id, monto_total, metodo_pago, created_at")
      .eq("sede_id", persona.sedeId)
      .gte("created_at", inicioDiaLima().toISOString())
      .order("created_at", { ascending: false }),
    "las ventas de hoy"
  );

  if (fallo) {
    return (
      <div>
        <h2 className="label-cayla mb-3 text-[11px] text-tinta/65">Ventas de hoy</h2>
        <p className="card-cayla border-rojo/30 px-4 py-5 text-center text-sm text-rojo-profundo">
          {fallo} Puedes seguir vendiendo con normalidad.
        </p>
      </div>
    );
  }

  const ventas = ventasHoy ?? [];
  const totalHoy = ventas.reduce((a, v) => a + Number(v.monto_total), 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="label-cayla text-[11px] text-tinta/65">Ventas de hoy</h2>
        <p className="font-display text-xl text-tinta">S/{totalHoy.toFixed(2)}</p>
      </div>
      {ventas.length === 0 ? (
        <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
          Aún no hay ventas hoy.
        </p>
      ) : (
        <div className="divide-y divide-tinta/10 card-cayla">
          {ventas.map((v) => (
            <div key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-tinta/70">{formatearHora(v.created_at)}</span>
              <span className="text-tinta/70">{ETIQUETA_METODO[v.metodo_pago] ?? v.metodo_pago}</span>
              <span className="font-medium text-tinta">S/{Number(v.monto_total).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
