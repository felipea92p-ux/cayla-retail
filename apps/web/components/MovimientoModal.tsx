"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TIPOS_MOVIMIENTO, MOTIVOS_SALIDA, MOTIVOS_DEVOLUCION } from "@cayla-retail/shared";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";

type SedeDestino = { id: string; codigo: string; esAlmacen: boolean };

type Props = {
  varianteId: string;
  referencia: string;
  sku: string;
  sedeId: string;
  sedeCodigo: string;
  otrasSedes: SedeDestino[];
  contenedoresAlmacen: { id: string; codigo: string }[];
  onClose: () => void;
  /** Botones por tarea (rediseño UX 2026-07-18): si viene, el tipo queda fijo y no se muestra el selector. */
  tipoFijo?: (typeof TIPOS_MOVIMIENTO)[number];
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

const ETIQUETA_MOTIVO_DEVOLUCION: Record<(typeof MOTIVOS_DEVOLUCION)[number], string> = {
  no_vendida: "No vendida (vuelve a rotar)",
  danada_reparacion: "Dañada — necesita reparación/lavado",
  danada_donar: "Dañada — para donar",
  devolver_proveedor: "Devolver al proveedor",
};

// "Venta" queda fuera de este modal a propósito: registrarla acá crearía un
// movimiento sin fila en `ventas` ni caja asociada — el Estado de Resultados lo
// contaría como venta, pero el Diario de Caja nunca lo vería (no hay método de pago
// ni caja). Una venta real se registra con el botón "Vender" del dashboard
// (RegistrarVentaModal), la única fuente de verdad para eso.
const MOTIVOS_SALIDA_MANUAL = MOTIVOS_SALIDA.filter((m) => m !== "venta");

export function MovimientoModal({
  varianteId,
  referencia,
  sku,
  sedeId,
  sedeCodigo,
  otrasSedes,
  contenedoresAlmacen,
  onClose,
  tipoFijo,
}: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<(typeof TIPOS_MOVIMIENTO)[number]>(tipoFijo ?? "entrada");
  const [cantidad, setCantidad] = useState(1);
  const [motivo, setMotivo] = useState(tipoFijo === "salida" ? MOTIVOS_SALIDA.filter((m) => m !== "venta")[0] : "");
  const [motivoDevolucion, setMotivoDevolucion] = useState<(typeof MOTIVOS_DEVOLUCION)[number]>(MOTIVOS_DEVOLUCION[0]);
  const [contenedorDestinoId, setContenedorDestinoId] = useState(contenedoresAlmacen[0]?.id ?? "");
  const [sedeDestinoId, setSedeDestinoId] = useState(otrasSedes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sedeDestino = otrasSedes.find((s) => s.id === sedeDestinoId);
  const esDevolucion = tipo === "traslado" && sedeDestino?.esAlmacen === true;

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
      p_motivo: esDevolucion ? motivoDevolucion : motivo || undefined,
      p_sede_destino_id: tipo === "traslado" ? sedeDestinoId : undefined,
      p_contenedor_id: esDevolucion ? contenedorDestinoId || undefined : undefined,
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
      titulo={tipoFijo ? `${ETIQUETA_TIPO[tipoFijo]} — ${referencia}` : referencia}
      subtitulo={`${sku} · sede ${sedeCodigo}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!tipoFijo && (
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Tipo de movimiento</label>
            <select
              value={tipo}
              onChange={(e) => {
                const nuevoTipo = e.target.value as (typeof TIPOS_MOVIMIENTO)[number];
                setTipo(nuevoTipo);
                setMotivo(nuevoTipo === "salida" ? MOTIVOS_SALIDA_MANUAL[0] : "");
              }}
              className={campoSelect}
            >
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo === "traslado" && (
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>{esDevolucion ? "Devolver a" : "Sede destino"}</label>
            <select value={sedeDestinoId} onChange={(e) => setSedeDestinoId(e.target.value)} className={campoSelect}>
              {otrasSedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo}
                  {s.esAlmacen ? " (almacén)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className={campoEtiqueta}>Cantidad</label>
          <input
            type="number"
            min={1}
            required
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className={campoTexto}
          />
        </div>

        {esDevolucion ? (
          <>
            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Motivo de la devolución</label>
              <select
                value={motivoDevolucion}
                onChange={(e) => setMotivoDevolucion(e.target.value as (typeof MOTIVOS_DEVOLUCION)[number])}
                className={campoSelect}
              >
                {MOTIVOS_DEVOLUCION.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_MOTIVO_DEVOLUCION[m]}
                  </option>
                ))}
              </select>
            </div>
            {contenedoresAlmacen.length > 0 && (
              <div className="space-y-1.5">
                <label className={campoEtiqueta}>Contenedor en el almacén</label>
                <select
                  value={contenedorDestinoId}
                  onChange={(e) => setContenedorDestinoId(e.target.value)}
                  className={campoSelect}
                >
                  <option value="">Sin contenedor</option>
                  {contenedoresAlmacen.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : tipo === "salida" ? (
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campoSelect}>
              {MOTIVOS_SALIDA_MANUAL.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO_SALIDA[m]}
                </option>
              ))}
            </select>
            <p className="text-xs text-tinta/45">
              ¿Es una venta? Usa el botón <span className="font-medium text-tinta">Vender</span> del dashboard — así
              queda asociada a la caja y al método de pago.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Motivo (opcional)</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Recepción de pedido"
              className={campoTexto}
            />
          </div>
        )}

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading} className={botonPrimario}>
            {loading ? "Guardando…" : esDevolucion ? "Devolver a almacén" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
