"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Desplegable } from "@/components/ui/campos";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

const CONDICIONES = [
  { valor: "vendible", etiqueta: "Vendible — vuelve al stock" },
  { valor: "danada_reparacion", etiqueta: "Dañada — para reparar" },
  { valor: "danada_donar", etiqueta: "Dañada — para donar" },
  { valor: "devolver_proveedor", etiqueta: "Devolver al proveedor" },
] as const;
type Condicion = (typeof CONDICIONES)[number]["valor"];

type ItemVenta = {
  ventaItemId: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`); se muestra con `codigoPrenda`. */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
};

// Anular deshace la venta COMPLETA, no una línea — a diferencia de Devolver,
// que sí es por línea. anular_venta (ADR-0065) exige la condición de cada
// ítem de la venta, así que este formulario carga todas las líneas al abrir,
// no solo la que se clickeó en la lista.
export function AnularVentaForm({
  linea,
  onClose,
}: {
  /** Solo se usa para identificar la venta y decir de qué prenda se clickeó. */
  linea: Pick<LineaVentaReciente, "ventaId" | "referencia" | "codigo" | "sku">;
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ItemVenta[] | null>(null);
  const [condiciones, setCondiciones] = useState<Record<string, Condicion>>({});
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  // Quién anula (ADR-0161): la base firma la anulación con el responsable del combo, no con la cuenta.
  const responsable = useResponsable();

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("venta_items")
        .select(
          `id, cantidad, variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) )`
        )
        .eq("venta_id", linea.ventaId);
      if (cancelado) return;
      if (error) {
        setError(traducirError(error, "cargar las líneas de la venta"));
        return;
      }
      const cargados: ItemVenta[] = (data ?? []).map((f) => ({
        ventaItemId: f.id,
        sku: f.variante?.sku ?? "",
        codigo: f.variante?.codigo ?? null,
        referencia: f.variante?.producto?.referencia ?? "",
        talla: f.variante?.talla?.valor ?? null,
        color: f.variante?.color?.nombre ?? null,
        cantidad: f.cantidad,
      }));
      setItems(cargados);
      setCondiciones(Object.fromEntries(cargados.map((i) => [i.ventaItemId, "vendible" as Condicion])));
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [linea.ventaId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      setError("Escribe el motivo de la anulación.");
      return;
    }
    if (!items) return;
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("anular_venta", {
        p_venta_id: linea.ventaId,
        p_motivo: motivo.trim(),
        p_items: items.map((i) => ({ venta_item_id: i.ventaItemId, condicion: condiciones[i.ventaItemId] })),
      }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, "anular la venta"));
      return;
    }
    setOk(true);
    router.refresh();
  }

  if (ok) {
    return (
      <Modal titulo="Venta anulada" onClose={onClose}>
        {(cerrar) => (
          <div className="space-y-4 text-center">
            <p className="text-sm text-tinta/75">
              La venta de {linea.referencia} {codigoPrenda(linea)} quedó anulada — el stock ya se actualizó.
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
      titulo="Anular venta"
      subtitulo={`${linea.referencia} ${codigoPrenda(linea)} — esto anula la venta completa, no solo esta línea`}
      onClose={onClose}
      ancho="max-w-md"
    >
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          {items === null ? (
            <p className="text-sm text-tinta/65">Cargando las líneas de esta venta…</p>
          ) : (
            <div className="space-y-3">
              {items.map((i) => (
                <div key={i.ventaItemId} className="space-y-1.5 border-b border-tinta/10 pb-3">
                  <p className="text-sm text-tinta">
                    {i.referencia} <span className="text-tinta/65">{[i.talla, i.color].filter(Boolean).join("/")}</span>
                  </p>
                  <p className="font-mono text-[11px] text-tinta/65">
                    {codigoPrenda(i)} × {i.cantidad}
                  </p>
                  <Desplegable
                    valor={condiciones[i.ventaItemId] ?? "vendible"}
                    onValor={(v) => setCondiciones((c) => ({ ...c, [i.ventaItemId]: v }))}
                    opciones={CONDICIONES.map((c) => ({ valor: c.valor, texto: c.etiqueta }))}
                    etiquetaAccesible={`Condición de ${i.referencia}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="anulacion-motivo">
              Motivo
            </label>
            <input
              id="anulacion-motivo"
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se anula esta venta"
              className={campoTexto}
            />
          </div>

          {error && <p className="text-sm text-rojo">{error}</p>}

          <ComboResponsable control={responsable} deshabilitado={loading} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar}>
              Cancelar
            </button>
            <button type="submit" disabled={loading || !items || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
              {loading ? "Anulando…" : "Anular venta"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
