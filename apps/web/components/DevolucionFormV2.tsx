"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal, campoEtiqueta, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import type { LineaVentaParaDevolucion } from "@/lib/devoluciones";
import { codigoPrenda } from "@/lib/prenda-reglas";

const CONDICIONES = [
  { valor: "vendible", etiqueta: "Vendible — vuelve al stock" },
  { valor: "danada_reparacion", etiqueta: "Dañada — para reparar" },
  { valor: "danada_donar", etiqueta: "Dañada — para donar" },
  { valor: "devolver_proveedor", etiqueta: "Devolver al proveedor" },
] as const;

// Registra la devolución (crear_devolucion) — queda "pendiente", sin tocar
// stock todavía. La aprobación (que sí genera el movimiento, y solo si la
// condición es vendible) es un paso aparte, en DevolucionesLista — mismo
// motivo que el backend ya separa las dos cosas: alguien puede querer que
// un líder revise el reembolso antes de que el stock se mueva.
export function DevolucionFormV2({
  linea,
  ubicacionId,
  onClose,
}: {
  linea: LineaVentaParaDevolucion;
  ubicacionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const disponible = linea.cantidad - linea.yaDevuelto;
  const [cantidad, setCantidad] = useState(Math.min(1, disponible));
  const [condicion, setCondicion] = useState<(typeof CONDICIONES)[number]["valor"]>("vendible");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disponible <= 0) {
      setError("Ya se devolvió toda la cantidad vendida en esta línea.");
      return;
    }
    if (!motivo.trim()) {
      setError("Escribe el motivo de la devolución.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("crear_devolucion", {
      p_venta_id: linea.ventaId,
      p_ubicacion_id: ubicacionId,
      p_items: [{ venta_item_id: linea.ventaItemId, cantidad, condicion }],
      p_motivo: motivo.trim(),
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "registrar la devolución"));
      return;
    }
    setOk(true);
    router.refresh();
  }

  if (ok) {
    return (
      <Modal titulo="Devolución registrada" onClose={onClose}>
        {(cerrar) => (
        <div className="space-y-4 text-center">
          <p className="text-sm text-tinta/75">
            {linea.referencia} {codigoPrenda(linea)} × {cantidad} — queda pendiente de aprobación.
          </p>
          <p className="text-xs text-tinta/65">
            El stock no cambia todavía. Apruébala desde la lista de &ldquo;Devoluciones pendientes&rdquo; para que se aplique.
          </p>
          <button type="button" autoFocus onClick={cerrar} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Registrar devolución"
      subtitulo={`${linea.referencia} ${codigoPrenda(linea)} — vendida × ${linea.cantidad}`}
      onClose={onClose}
    >
      {(cerrar) => (
      <form onSubmit={onSubmit} className="space-y-4">
        {disponible <= 0 ? (
          <p className="text-sm text-rojo">Ya se devolvió toda la cantidad de esta línea.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="devolucion-cantidad">
                Cantidad (disponible para devolver: {disponible})
              </label>
              <input
                id="devolucion-cantidad"
                type="number"
                min={1}
                max={disponible}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Math.min(disponible, Number(e.target.value) || 1)))}
                className="w-24 border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>

            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="devolucion-condicion">
                Condición de la prenda
              </label>
              <select
                id="devolucion-condicion"
                value={condicion}
                onChange={(e) => setCondicion(e.target.value as (typeof CONDICIONES)[number]["valor"])}
                className={campoSelect}
              >
                {CONDICIONES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              {condicion !== "vendible" && (
                <p className="text-xs text-tinta/65">Esta condición no regresa al stock disponible para vender.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="devolucion-motivo">
                Motivo
              </label>
              <input
                id="devolucion-motivo"
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por qué la clienta la devuelve"
                className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || disponible <= 0} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar devolución"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
