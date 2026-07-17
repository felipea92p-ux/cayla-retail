"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TIPOS_MOVIMIENTO, MOTIVOS_SALIDA } from "@cayla-retail/shared";

type Props = {
  varianteId: string;
  referencia: string;
  sku: string;
  sedeId: string;
  sedeCodigo: string;
  otrasSedes: { id: string; codigo: string }[];
  onClose: () => void;
};

const ETIQUETA_TIPO: Record<(typeof TIPOS_MOVIMIENTO)[number], string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste (conteo físico)",
  traslado: "Traslado a otra sede",
};

const ETIQUETA_MOTIVO_SALIDA: Record<(typeof MOTIVOS_SALIDA)[number], string> = {
  venta: "Venta",
  merma: "Merma / pérdida",
  regalo: "Regalo o cortesía",
  muestra: "Muestra",
  otro: "Otro (especificar en nota)",
};

// "Venta" queda fuera de este modal a propósito: registrarla acá crearía un
// movimiento sin fila en `ventas` ni caja asociada — el Estado de Resultados lo
// contaría como venta, pero el Diario de Caja nunca lo vería (no hay método de pago
// ni caja). Una venta real se registra con el botón "Vender" del dashboard
// (RegistrarVentaModal), la única fuente de verdad para eso.
const MOTIVOS_SALIDA_MANUAL = MOTIVOS_SALIDA.filter((m) => m !== "venta");

export function MovimientoModal({ varianteId, referencia, sku, sedeId, sedeCodigo, otrasSedes, onClose }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<(typeof TIPOS_MOVIMIENTO)[number]>("entrada");
  const [cantidad, setCantidad] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [sedeDestinoId, setSedeDestinoId] = useState(otrasSedes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_movimiento", {
      p_variante_id: varianteId,
      p_sede_id: sedeId,
      p_tipo: tipo,
      p_cantidad: cantidad,
      p_motivo: motivo || undefined,
      p_sede_destino_id: tipo === "traslado" ? sedeDestinoId : undefined,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-neutral-900">{referencia}</h2>
        <p className="mb-4 text-xs text-neutral-400">{sku} · sede {sedeCodigo}</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Tipo de movimiento</label>
            <select
              value={tipo}
              onChange={(e) => {
                const nuevoTipo = e.target.value as (typeof TIPOS_MOVIMIENTO)[number];
                setTipo(nuevoTipo);
                setMotivo(nuevoTipo === "salida" ? MOTIVOS_SALIDA_MANUAL[0] : "");
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </div>

          {tipo === "traslado" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Sede destino</label>
              <select
                value={sedeDestinoId}
                onChange={(e) => setSedeDestinoId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {otrasSedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Cantidad</label>
            <input
              type="number"
              min={1}
              required
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {tipo === "salida" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Motivo</label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {MOTIVOS_SALIDA_MANUAL.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_MOTIVO_SALIDA[m]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-400">
                ¿Es una venta? Usa el botón <span className="font-medium">Vender</span> del dashboard — así queda
                asociada a la caja y al método de pago.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Motivo (opcional)</label>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Recepción de pedido"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
