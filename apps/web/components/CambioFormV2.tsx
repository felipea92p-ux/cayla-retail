"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { ComboBuscable, type OpcionCombo } from "@/components/ui/ComboBuscable";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { opcionesDeCambio } from "@/lib/cambios-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

type VarianteCatalogo = {
  varianteId: string;
  sku: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number;
  stockAqui: number;
};
const METODOS = ["efectivo", "tarjeta", "yape", "plin", "transferencia"] as const;

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

export function CambioFormV2({
  linea,
  ubicacionId,
  catalogo,
  onClose,
}: {
  linea: LineaVentaReciente;
  ubicacionId: string;
  catalogo: VarianteCatalogo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const disponible = linea.cantidad - linea.yaCambiado;
  // Ni la vendida ni una sin stock aquí — identificada por varianteId, nunca por sku
  // (ver `cambios-reglas.ts`).
  const opciones = opcionesDeCambio(catalogo, linea.varianteId);
  const opcionesCombo: OpcionCombo<string>[] = opciones.map((v) => ({
    valor: v.varianteId,
    texto: `${v.referencia} ${[v.talla, v.color].filter(Boolean).join("/")}`,
    detalle: `${codigoPrenda(v)} · S/${v.precio.toFixed(2)} · ${v.stockAqui} en sede`,
  }));
  // Sin preselección (mismo criterio que el método de pago del POS, ADR-0044): el primer
  // resultado del catálogo no es una elección de nadie, y antes eso era exactamente lo que
  // salía por defecto del <select> viejo.
  const [varianteNuevaId, setVarianteNuevaId] = useState("");
  const [cantidad, setCantidad] = useState(Math.min(1, disponible));
  const [metodoDiferencia, setMetodoDiferencia] = useState<(typeof METODOS)[number]>("efectivo");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  // Reintento (doble clic, o red que se corta después del commit y antes de la
  // respuesta — ADR-0032) debe mandar el MISMO token para que el índice único de
  // `retail.cambios.token_cliente` lo reconozca como el mismo envío. Se regenera
  // solo tras éxito, igual que `token` en PuntoDeVenta.tsx.
  const token = useRef<string>(crypto.randomUUID());

  const varianteNueva = catalogo.find((v) => v.varianteId === varianteNuevaId);
  const diferencia = useMemo(
    () => ((varianteNueva?.precio ?? 0) - linea.precioUnitario) * cantidad,
    [varianteNueva, linea.precioUnitario, cantidad]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disponible <= 0) {
      avisar.error("Ya se cambió toda la cantidad comprada en esta línea.", { enfocar: "cambio-cantidad" });
      return;
    }
    if (!varianteNuevaId) {
      avisar.error("Elige qué prenda se le entrega en su lugar.", { enfocar: "cambio-variante" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_cambio", {
      p_venta_item_id: linea.ventaItemId,
      p_ubicacion_id: ubicacionId,
      p_variante_nueva_id: varianteNuevaId,
      p_cantidad: cantidad,
      p_metodo_pago_diferencia: diferencia !== 0 ? metodoDiferencia : undefined,
      p_token: token.current,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el cambio"));
      return;
    }
    avisar.exito("Cambio registrado", { detalle: "El stock ya refleja la prenda que salió y la que entró." });
    setOk(true);
    token.current = crypto.randomUUID();
    router.refresh();
  }

  if (ok) {
    return (
      <Modal titulo="Cambio registrado" onClose={onClose}>
        {(cerrar) => (
        <div className="space-y-4 text-center">
          <p className="text-sm text-tinta/75">
            {linea.referencia} {codigoPrenda(linea)} × {cantidad} cambiada por {varianteNueva?.referencia}{" "}
            {varianteNueva && codigoPrenda(varianteNueva)}.
          </p>
          {diferencia !== 0 && (
            <p className="text-sm text-tinta">
              {diferencia > 0 ? "Se cobró" : "Se devolvió"} {money(Math.abs(diferencia))} ({metodoDiferencia}).
            </p>
          )}
          <button type="button" autoFocus onClick={cerrar} className={`${botonPrimario} w-full`}>
            Listo
          </button>
        </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal titulo="Cambiar talla/color" subtitulo={`${linea.referencia} ${codigoPrenda(linea)} — comprada × ${linea.cantidad}`} onClose={onClose}>
      {(cerrar) => (
      <form onSubmit={onSubmit} className="space-y-4">
        {disponible <= 0 ? (
          <p className="text-sm text-rojo">Ya se cambió toda la cantidad de esta línea.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="cambio-variante">
                Entregar en su lugar
              </label>
              {opciones.length === 0 ? (
                <p className="text-sm text-tinta/65">No hay otra talla o color con stock en esta sede para ofrecer.</p>
              ) : (
                <ComboBuscable
                  id="cambio-variante"
                  etiquetaAccesible="Entregar en su lugar"
                  marcador="Busca por prenda, talla o color…"
                  valor={varianteNuevaId}
                  onValor={setVarianteNuevaId}
                  opciones={opcionesCombo}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className={campoEtiqueta} htmlFor="cambio-cantidad">
                Cantidad (disponible para cambiar: {disponible})
              </label>
              <input
                id="cambio-cantidad"
                type="number"
                min={1}
                max={disponible}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Math.min(disponible, Number(e.target.value) || 1)))}
                className="w-24 border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>

            {/* Antes de elegir la prenda nueva, "Diferencia S/0.00" no es un dato —
                es el mismo hueco que ADR-0044 ya cerró en el cobro del POS: no se
                muestra una decisión de pago hasta que hay algo real que decidir. */}
            {varianteNuevaId && (
              <div className="card-cayla p-4 text-center">
                <p className="label-cayla text-[11px] text-tinta/65">Diferencia</p>
                <p className={`font-display text-2xl ${diferencia === 0 ? "text-tinta" : diferencia > 0 ? "text-rojo" : "text-verde-profundo"}`}>
                  {money(diferencia)}
                </p>
                <p className="mt-1 text-xs text-tinta/65">
                  {diferencia === 0 ? "Sin diferencia de precio" : diferencia > 0 ? "Se cobra a la clienta" : "Se devuelve a la clienta"}
                </p>
              </div>
            )}

            {varianteNuevaId && diferencia !== 0 && (
              <div className="space-y-1.5">
                <label className={campoEtiqueta} htmlFor="cambio-metodo">
                  Cómo se {diferencia > 0 ? "cobra" : "devuelve"}
                </label>
                <select
                  id="cambio-metodo"
                  value={metodoDiferencia}
                  onChange={(e) => setMetodoDiferencia(e.target.value as (typeof METODOS)[number])}
                  className={campoSelect}
                >
                  {METODOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}


        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || disponible <= 0 || !varianteNuevaId} className={botonPrimario}>
            {loading ? "Guardando…" : "Confirmar cambio"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
