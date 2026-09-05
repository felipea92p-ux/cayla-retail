"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  GASTO_CATEGORIAS,
  ETIQUETA_GASTO_CATEGORIA,
  METODOS_PAGO_GASTO,
  ETIQUETA_METODO_PAGO_GASTO,
  type GastoCategoria,
  type MetodoPagoGasto,
} from "@cayla-retail/shared";

const IGV = 0.18;

type Props = {
  sedeId: string;
  sedeCodigo: string;
  otrasSedes: { id: string; codigo: string }[];
  onClose: () => void;
};

// Rediseño Fase 2 (reemplazo de Alegra): este modal quedó fuera del sistema de
// identidad CAYLA cuando se construyó (usaba bg-white/rounded-2xl/text-red-600
// en vez de card-cayla/rojo/tinta) — mismo tipo de deriva que ya se corrigió en
// globals.css. Etiquetas y método de pago ahora vienen de packages/shared, no
// duplicadas a mano (ya se repetían en 3 sitios distintos).
export function RegistrarGastoModal({ sedeId, sedeCodigo, otrasSedes, onClose }: Props) {
  const router = useRouter();
  const [sedeSeleccionada, setSedeSeleccionada] = useState(sedeId);
  const [categoria, setCategoria] = useState<GastoCategoria>(GASTO_CATEGORIAS[0]);
  const [metodoPago, setMetodoPago] = useState<MetodoPagoGasto>("efectivo");
  const [total, setTotal] = useState(0);
  const [especificacion, setEspecificacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // El comprobante casi siempre muestra el total pagado, no el subtotal — se pide el
  // total y se calcula el resto al revés, en vez de al contrario.
  const subtotal = Math.round((total / (1 + IGV)) * 100) / 100;
  const igv = Math.round((total - subtotal) * 100) / 100;

  const todasLasSedes = [{ id: sedeId, codigo: sedeCodigo }, ...otrasSedes];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!total) {
      setError("El total debe ser mayor a 0");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_gasto", {
      p_sede_id: sedeSeleccionada,
      p_categoria: categoria,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_especificacion: especificacion || undefined,
      p_metodo_pago: metodoPago,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/40 sm:items-center">
      <div className="card-cayla w-full max-w-sm p-6">
        <h2 className="font-display text-lg text-tinta">Registrar gasto</h2>
        <p className="mt-1 text-xs text-tinta/55">
          ¿Es una inversión (mueble, herramienta, remodelación)? No va aquí: regístrala como
          activo en Finanzas → Patrimonio. Los insumos del taller tampoco: viven en el costo
          de cada prenda al recibirla.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label-cayla text-[9px] text-tinta/55">Sede</label>
              <select
                value={sedeSeleccionada}
                onChange={(e) => setSedeSeleccionada(e.target.value)}
                className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta"
              >
                {todasLasSedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.codigo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label-cayla text-[9px] text-tinta/55">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as GastoCategoria)}
                className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta"
              >
                {GASTO_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_GASTO_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label-cayla text-[9px] text-tinta/55">Método de pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPagoGasto)}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta"
            >
              {METODOS_PAGO_GASTO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO_PAGO_GASTO[m]}
                </option>
              ))}
            </select>
            <p className="text-xs text-tinta/45">Si fue en efectivo, el sistema lo descuenta del cuadre de la sede.</p>
          </div>

          <div className="space-y-1.5">
            <label className="label-cayla text-[9px] text-tinta/55">Total pagado (S/)</label>
            <input
              type="number"
              min={0}
              step="0.10"
              autoFocus
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              className="font-display w-full border border-tinta/20 bg-crema px-3 py-2 text-lg text-tinta"
            />
            <p className="text-xs text-tinta/45">Lo que dice el comprobante — el subtotal e IGV se calculan solos.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label-cayla text-[9px] text-tinta/55">Subtotal (S/)</label>
              <input
                type="number"
                value={subtotal}
                readOnly
                className="w-full border border-sand bg-papel px-3 py-2 text-sm tabular-nums text-tinta/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label-cayla text-[9px] text-tinta/55">IGV (S/)</label>
              <input
                type="number"
                value={igv}
                readOnly
                className="w-full border border-sand bg-papel px-3 py-2 text-sm tabular-nums text-tinta/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label-cayla text-[9px] text-tinta/55">Especificación</label>
            <input
              value={especificacion}
              onChange={(e) => setEspecificacion(e.target.value)}
              placeholder="Ej. Alquiler julio, luz, etc."
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta"
            />
          </div>

          {error && <p className="text-sm text-rojo">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-tinta/20 px-3 py-2.5 text-sm text-tinta/70 transition-colors hover:border-rojo hover:text-rojo"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-rojo px-3 py-2.5 text-sm text-crema transition-colors hover:bg-rojo-profundo disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
