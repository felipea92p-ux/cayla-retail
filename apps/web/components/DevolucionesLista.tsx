"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { campoEtiqueta, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { DevolucionFormV2 } from "@/components/DevolucionFormV2";
import type { LineaVentaParaDevolucion, DevolucionPendiente } from "@/lib/devoluciones";

const METODOS = ["efectivo", "tarjeta", "yape", "plin", "transferencia"] as const;

// Mismo patrón que ComprobantesPanel/ProformasPanel: la integrante necesita saber
// CUÁNDO se vendió para reconocer la línea de la clienta que tiene enfrente —
// `creadoEn` ya viajaba en `LineaVentaParaDevolucion` y no se pintaba.
function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

const ETIQUETA_CONDICION: Record<string, string> = {
  vendible: "Vendible",
  danada_reparacion: "Dañada · reparar",
  danada_donar: "Dañada · donar",
  devolver_proveedor: "Devolver a proveedor",
};

export function DevolucionesLista({
  lineas,
  pendientes,
  ubicacionId,
  esLider,
}: {
  lineas: LineaVentaParaDevolucion[];
  pendientes: DevolucionPendiente[];
  ubicacionId: string;
  esLider: boolean;
}) {
  const [enDevolucion, setEnDevolucion] = useState<LineaVentaParaDevolucion | null>(null);

  return (
    <div className="space-y-8">
      {pendientes.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">
            Devoluciones pendientes de aprobación ({pendientes.length})
          </p>
          <div className="card-cayla divide-y divide-tinta/10">
            {pendientes.map((d) => (
              <FilaPendiente key={d.id} devolucion={d} puedeResolver={esLider} />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Ventas recientes</p>
        <div className="card-cayla divide-y divide-tinta/10">
          {lineas.map((l) => {
            const disponible = l.cantidad - l.yaDevuelto;
            return (
              <div key={l.ventaItemId} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-tinta">
                    {l.referencia} <span className="text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/")}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-tinta/65">
                    {l.sku} · vendida × {l.cantidad}
                    {l.yaDevuelto > 0 && ` · ya devuelta × ${l.yaDevuelto}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tinta/50">{formatearFecha(l.creadoEn)}</p>
                </div>
                <button
                  type="button"
                  disabled={disponible <= 0}
                  onClick={() => setEnDevolucion(l)}
                  className="label-cayla text-[11px] text-tinta/65 hover:text-rojo disabled:text-tinta/30 disabled:hover:text-tinta/30"
                >
                  {disponible <= 0 ? "Sin devolución disponible" : "Devolver"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {enDevolucion && (
        <DevolucionFormV2 linea={enDevolucion} ubicacionId={ubicacionId} onClose={() => setEnDevolucion(null)} />
      )}
    </div>
  );
}

function FilaPendiente({ devolucion: d, puedeResolver }: { devolucion: DevolucionPendiente; puedeResolver: boolean }) {
  const router = useRouter();
  const [resolviendo, setResolviendo] = useState<"aprobar" | "rechazar" | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>("efectivo");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aprobar() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("aprobar_devolucion", {
      p_devolucion_id: d.id,
      p_reembolso_monto: monto ? Number(monto) : undefined,
      p_reembolso_metodo: monto ? metodo : undefined,
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "aprobar la devolución"));
      return;
    }
    router.refresh();
  }

  async function rechazar() {
    if (!motivoRechazo.trim()) {
      setError("Escribe el motivo del rechazo.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("rechazar_devolucion", {
      p_devolucion_id: d.id,
      p_motivo: motivoRechazo.trim(),
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "rechazar la devolución"));
      return;
    }
    router.refresh();
  }

  return (
    // `anim-revelar` sin `key` extra: `key={d.id}` en el `.map` de arriba ya hace que
    // React reutilice la fila de una devolución que sigue pendiente tras un
    // `router.refresh()` (no reanima) y solo monte —y por lo tanto anime— la que
    // recién se registró.
    <div className="anim-revelar px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {d.items.map((i, n) => (
            <p key={n} className="text-sm text-tinta">
              {i.referencia} <span className="text-tinta/65">{[i.talla, i.color].filter(Boolean).join("/")}</span>{" "}
              <span className="font-mono text-[11px] text-tinta/65">
                {i.sku} × {i.cantidad} · {ETIQUETA_CONDICION[i.condicion] ?? i.condicion}
              </span>
            </p>
          ))}
          <p className="mt-1 text-xs text-tinta/65">
            {d.motivo} — pidió {d.solicitadoPorNombre}
          </p>
        </div>
        {puedeResolver && !resolviendo && (
          <div className="flex shrink-0 gap-3">
            <button type="button" onClick={() => setResolviendo("aprobar")} className="label-cayla text-[11px] text-verde hover:opacity-70">
              Aprobar
            </button>
            <button type="button" onClick={() => setResolviendo("rechazar")} className="label-cayla text-[11px] text-rojo hover:opacity-70">
              Rechazar
            </button>
          </div>
        )}
      </div>

      {resolviendo === "aprobar" && (
        <div className="mt-3 space-y-3 border-t border-tinta/10 pt-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className={campoEtiqueta}>Reembolso (opcional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="S/ 0.00"
                className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>
            {monto && (
              <div className="flex-1 space-y-1.5">
                <label className={campoEtiqueta}>Método</label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as (typeof METODOS)[number])} className={campoSelect}>
                  {METODOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-rojo">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setResolviendo(null)} className={botonCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={aprobar} disabled={loading} className={botonPrimario}>
              {loading ? "Aprobando…" : "Confirmar aprobación"}
            </button>
          </div>
        </div>
      )}

      {resolviendo === "rechazar" && (
        <div className="mt-3 space-y-3 border-t border-tinta/10 pt-3">
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Motivo del rechazo</label>
            <input
              type="text"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          {error && <p className="text-xs text-rojo">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setResolviendo(null)} className={botonCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={rechazar} disabled={loading} className={botonPrimario}>
              {loading ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
