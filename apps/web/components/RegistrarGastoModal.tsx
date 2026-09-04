"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GASTO_CATEGORIAS, type GastoCategoria } from "@cayla-retail/shared";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

const IGV = 0.18;

const ETIQUETA_CATEGORIA: Record<GastoCategoria, string> = {
  alquiler: "Alquiler",
  servicios: "Servicios (luz, agua, internet)",
  planilla: "Planilla / honorarios",
  transporte: "Transporte / envíos / flete",
  marketing: "Marketing",
  mantenimiento: "Mantenimiento",
  suministros: "Suministros (bolsas, empaques, útiles)",
  otro: "Otro",
};

type Props = {
  sedeId: string;
  sedeCodigo: string;
  otrasSedes: { id: string; codigo: string }[];
  onClose: () => void;
};

const METODOS_GASTO = ["efectivo", "banco", "yape", "tarjeta"] as const;
const ETIQUETA_METODO_GASTO: Record<(typeof METODOS_GASTO)[number], string> = {
  efectivo: "Efectivo (sale del cajón)",
  banco: "Banco / transferencia",
  yape: "Yape",
  tarjeta: "Tarjeta",
};

export function RegistrarGastoModal({ sedeId, sedeCodigo, otrasSedes, onClose }: Props) {
  const router = useRouter();
  const [sedeSeleccionada, setSedeSeleccionada] = useState(sedeId);
  const [categoria, setCategoria] = useState<GastoCategoria>(GASTO_CATEGORIAS[0]);
  const [metodoPago, setMetodoPago] = useState<(typeof METODOS_GASTO)[number]>("efectivo");
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
    <Modal
      titulo="Registrar gasto"
      subtitulo="¿Es una inversión (mueble, herramienta, remodelación)? No va aquí: regístrala como activo en Finanzas → Patrimonio. Los insumos del taller tampoco: viven en el costo de cada prenda al recibirla."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Sede</label>
            <select value={sedeSeleccionada} onChange={(e) => setSedeSeleccionada(e.target.value)} className={campoSelect}>
              {todasLasSedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as GastoCategoria)} className={campoSelect}>
              {GASTO_CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Método de pago</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value as (typeof METODOS_GASTO)[number])}
            className={campoSelect}
          >
            {METODOS_GASTO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO_GASTO[m]}
              </option>
            ))}
          </select>
          <p className="text-xs text-tinta/45">Si fue en efectivo, el sistema lo descuenta del cuadre de la sede.</p>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Total pagado (S/)</label>
          <input
            type="number"
            min={0}
            step="0.10"
            autoFocus
            value={total}
            onChange={(e) => setTotal(Number(e.target.value))}
            className={campoTexto}
          />
          <p className="text-xs text-tinta/45">Lo que dice el comprobante — el subtotal e IGV se calculan solos.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Subtotal (S/)</label>
            <input type="number" value={subtotal} readOnly className={`${campoTexto} text-tinta/50`} />
          </div>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>IGV (S/)</label>
            <input type="number" value={igv} readOnly className={`${campoTexto} text-tinta/50`} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Especificación</label>
          <input
            value={especificacion}
            onChange={(e) => setEspecificacion(e.target.value)}
            placeholder="Ej. Alquiler julio, luz, etc."
            className={campoTexto}
          />
        </div>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Guardando…" : "Guardar gasto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
