import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { getCajaAbierta } from "@/lib/finanzas";
import { createClient } from "@/lib/supabase/server";
import { CajaPanel } from "@/components/CajaPanel";

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

// Vender: la caja del día de la sede — abrir, vender, cerrar, y ver lo vendido hoy.
export default async function VenderPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const [variantes, cajaAbierta, { data: ventasHoy }] = await Promise.all([
    getCatalogoConStock(persona),
    getCajaAbierta(persona.sedeId),
    supabase
      .from("ventas")
      .select("id, monto_total, metodo_pago, created_at")
      .eq("sede_id", persona.sedeId)
      .gte("created_at", inicioDiaLima().toISOString())
      .order("created_at", { ascending: false }),
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

  const totalHoy = (ventasHoy ?? []).reduce((a, v) => a + Number(v.monto_total), 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Vender · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Caja del día</h1>
      </div>

      <CajaPanel
        sedeId={persona.sedeId}
        sedeCodigo={persona.sedeCodigo}
        cajaAbierta={cajaAbierta}
        variantes={variantesParaVenta}
      />

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="label-cayla text-[10px] text-tinta/45">Ventas de hoy</h2>
          <p className="font-display text-xl text-tinta">S/{totalHoy.toFixed(2)}</p>
        </div>
        {!ventasHoy || ventasHoy.length === 0 ? (
          <p className="font-display border border-tinta/10 bg-papel py-8 text-center text-base italic text-tinta/40">
            Aún no hay ventas hoy.
          </p>
        ) : (
          <div className="divide-y divide-tinta/10 border border-tinta/10 bg-papel">
            {ventasHoy.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-tinta/55">{formatearHora(v.created_at)}</span>
                <span className="text-tinta/55">{ETIQUETA_METODO[v.metodo_pago] ?? v.metodo_pago}</span>
                <span className="font-medium text-tinta">S/{Number(v.monto_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
