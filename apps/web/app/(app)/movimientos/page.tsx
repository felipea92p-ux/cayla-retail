import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getMovimientos } from "@/lib/movimientos-v2";

// Fase UI 1 (2026-09-11): pantalla nueva — V1 no tenía un historial dedicado
// de `movimientos`. Responde "¿por qué cambió este stock?": cada fila es
// una entrada del ledger append-only (nunca se edita ni se borra), con el
// motivo (recepción, venta, ajuste, traslado) y quién lo hizo.
const ETIQUETA_TIPO: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  traslado: "Traslado",
};

export default async function MovimientosPage() {
  const persona = await requirePersonaActualV2();
  const movimientos = await getMovimientos(persona.ubicacionId, 100);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Movimientos</h1>
        <p className="mt-1 text-sm text-tinta/65">
          El historial completo de por qué cambió el stock — no se edita ni se borra nunca.
        </p>
      </div>

      {movimientos.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay movimientos en esta ubicación.</p>
      ) : (
        <div className="card-cayla divide-y divide-tinta/10">
          {movimientos.map((m) => (
            <div key={m.id} className="flex flex-wrap items-baseline gap-3 px-5 py-3">
              <span className="w-24 shrink-0 text-xs tabular-nums text-tinta/65">
                {new Date(m.creadoEn).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="label-cayla shrink-0 text-[11px] text-tinta/65">{ETIQUETA_TIPO[m.tipo] ?? m.tipo}</span>
              <span className="min-w-0 flex-1 text-sm text-tinta">
                {m.referencia} <span className="text-tinta/65">{m.sku}</span>{" "}
                <span className="text-tinta/65">
                  {m.tipo === "salida" || m.tipo === "traslado" ? "−" : m.tipo === "ajuste" && m.cantidad < 0 ? "" : "+"}
                  {Math.abs(m.cantidad)}
                </span>
                {m.ubicacionDestino && <span className="text-tinta/65"> → {m.ubicacionDestino}</span>}
              </span>
              {m.motivo && <span className="shrink-0 text-xs text-tinta/65">{m.motivo}</span>}
              {m.usuario && <span className="hidden shrink-0 text-xs text-tinta/65 sm:inline">{m.usuario}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
