"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoSelect } from "@/components/ui/Modal";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { opcionesDeCambio } from "@/lib/cambios-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

export type VarianteCatalogo = {
  varianteId: string;
  productoId: string;
  sku: string;
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  precio: number;
  stockAqui: number;
};
const METODOS = ["efectivo", "tarjeta", "yape", "plin", "transferencia"] as const;

function money(n: number) {
  return (n >= 0 ? "S/" : "-S/") + Math.abs(n).toFixed(2);
}

const OPT = "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer transition-colors";
const OPT_INACTIVA = `${OPT} border-tinta/15 bg-papel text-tinta/70 hover:border-tinta/30`;
const OPT_ACTIVA = `${OPT} border-rojo bg-rojo/8 text-rojo`;

/**
 * Contenido expandido DENTRO de la tarjeta de una línea de Cambios (rediseño visual,
 * 2026-09-18) — antes era un `<Modal>` aparte; ADR-0044 ya había resuelto exactamente
 * este mismo problema para el cobro del POS ("el panel cambia de momento, sin modal,
 * para que nada se preselecciona a ciegas") y esta pantalla nunca lo había aplicado.
 * Sigue sin preselección (mismo criterio, mismo comentario original): un producto o
 * talla/color con una sola opción se completa solo porque ahí no hay decisión que
 * tomar — con dos o más, queda vacío hasta que la colaboradora elige.
 */
export function CambioFormV2({
  linea,
  ubicacionId,
  catalogo,
  onCancelar,
}: {
  linea: LineaVentaReciente;
  ubicacionId: string;
  catalogo: VarianteCatalogo[];
  onCancelar: () => void;
}) {
  const router = useRouter();
  const disponible = linea.cantidad - linea.yaCambiado;
  const opciones = opcionesDeCambio(catalogo, linea.varianteId);

  // Agrupadas por producto: la mayoría de cambios son "la misma prenda, otra talla o
  // color" — separar por producto es lo que deja mostrar chips de talla/color en vez
  // de una lista larga de combinaciones, sin perder la posibilidad real de cambiar por
  // una prenda distinta (`opcionesDeCambio` nunca lo restringió).
  const productos = useMemo(() => {
    const mapa = new Map<string, { productoId: string; referencia: string; variantes: VarianteCatalogo[] }>();
    for (const v of opciones) {
      if (!mapa.has(v.productoId)) mapa.set(v.productoId, { productoId: v.productoId, referencia: v.referencia, variantes: [] });
      mapa.get(v.productoId)!.variantes.push(v);
    }
    return [...mapa.values()];
  }, [opciones]);

  const [productoId, setProductoId] = useState<string | null>(productos.length === 1 ? productos[0]!.productoId : null);
  const [talla, setTalla] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(Math.min(1, disponible));
  const [metodoDiferencia, setMetodoDiferencia] = useState<(typeof METODOS)[number]>("efectivo");
  const [loading, setLoading] = useState(false);
  // Reintento (doble clic, o red que se corta después del commit y antes de la
  // respuesta — ADR-0032) debe mandar el MISMO token para que el índice único de
  // `retail.cambios.token_cliente` lo reconozca como el mismo envío.
  const token = useRef<string>(crypto.randomUUID());

  const productoActivo = productos.find((p) => p.productoId === productoId) ?? null;
  const tallas = productoActivo ? [...new Set(productoActivo.variantes.map((v) => v.talla).filter((t): t is string => t !== null))] : [];
  const colores = productoActivo
    ? [...new Map(productoActivo.variantes.filter((v) => v.color).map((v) => [v.color!, v.colorHex])).entries()]
    : [];
  const tallaEfectiva = talla ?? (tallas.length === 1 ? tallas[0]! : null);
  const colorEfectivo = color ?? (colores.length === 1 ? colores[0]![0] : null);

  const varianteNueva =
    productoActivo?.variantes.find(
      (v) => (tallas.length === 0 || v.talla === tallaEfectiva) && (colores.length === 0 || v.color === colorEfectivo)
    ) ?? null;

  const diferencia = useMemo(
    () => ((varianteNueva?.precio ?? 0) - linea.precioUnitario) * cantidad,
    [varianteNueva, linea.precioUnitario, cantidad]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!varianteNueva) {
      avisar.error("Elige qué prenda se le entrega en su lugar.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_cambio", {
      p_venta_item_id: linea.ventaItemId,
      p_ubicacion_id: ubicacionId,
      p_variante_nueva_id: varianteNueva.varianteId,
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
    token.current = crypto.randomUUID();
    onCancelar();
    router.refresh();
  }

  if (disponible <= 0) {
    return <p className="border-t border-sand pt-3 text-sm text-rojo">Ya se cambió toda la cantidad de esta línea.</p>;
  }
  if (opciones.length === 0) {
    return <p className="border-t border-sand pt-3 text-sm text-tinta/65">No hay otra talla o color con stock en esta sede para ofrecer.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-6 border-t border-sand pt-3.5">
      {productos.length > 1 && (
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Prenda</span>
          <div className="flex flex-wrap gap-1.5">
            {productos.map((p) => (
              <button
                key={p.productoId}
                type="button"
                className={p.productoId === productoId ? OPT_ACTIVA : OPT_INACTIVA}
                onClick={() => {
                  setProductoId(p.productoId);
                  setTalla(null);
                  setColor(null);
                }}
              >
                {p.referencia}
              </button>
            ))}
          </div>
        </div>
      )}

      {productoActivo && tallas.length > 1 && (
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Nueva talla</span>
          <div className="flex flex-wrap gap-1.5">
            {tallas.map((t) => (
              <button key={t} type="button" className={t === tallaEfectiva ? OPT_ACTIVA : OPT_INACTIVA} onClick={() => setTalla(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {productoActivo && colores.length > 1 && (
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Nuevo color</span>
          <div className="flex flex-wrap gap-2">
            {colores.map(([nombre, hex]) => (
              <button
                key={nombre}
                type="button"
                title={nombre}
                aria-label={`Color ${nombre}`}
                onClick={() => setColor(nombre)}
                className={`h-7 w-7 rounded-full border-2 transition-shadow ${
                  nombre === colorEfectivo ? "border-rojo shadow-[0_0_0_2px_var(--color-papel),0_0_0_4px_var(--color-rojo)]" : "border-tinta/15"
                }`}
                style={{ background: hex ?? "var(--color-sand)" }}
              />
            ))}
          </div>
        </div>
      )}

      {disponible > 1 && (
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor={`cambio-cantidad-${linea.ventaItemId}`}>
            Cantidad (disponible: {disponible})
          </label>
          <input
            id={`cambio-cantidad-${linea.ventaItemId}`}
            type="number"
            min={1}
            max={disponible}
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Math.min(disponible, Number(e.target.value) || 1)))}
            className="w-20 rounded-lg border border-tinta/20 bg-transparent px-2 py-1.5 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
      )}

      {/* Antes de resolver una prenda nueva, "Diferencia S/0.00" no es un dato — mismo
          criterio de ADR-0044: no se muestra una decisión de pago hasta que hay algo
          real que decidir. */}
      {varianteNueva && diferencia !== 0 && (
        <div className="space-y-1.5">
          <p className={campoEtiqueta}>Diferencia</p>
          <p className={`font-display text-lg leading-none ${diferencia > 0 ? "text-rojo" : "text-verde-profundo"}`}>
            {money(diferencia)} <span className="text-xs font-normal text-tinta/60">{diferencia > 0 ? "se cobra" : "se devuelve"}</span>
          </p>
        </div>
      )}

      {varianteNueva && diferencia !== 0 && (
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor={`cambio-metodo-${linea.ventaItemId}`}>
            Método
          </label>
          <select
            id={`cambio-metodo-${linea.ventaItemId}`}
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="label-cayla rounded-md border border-tinta/20 px-4 py-2.5 text-[12px] text-tinta hover:bg-sand/40"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !varianteNueva}
          className="alza-cayla label-cayla rounded-md bg-tinta px-4 py-2.5 text-[12px] text-crema hover:bg-rojo disabled:opacity-50 disabled:hover:bg-tinta"
        >
          {loading ? "Guardando…" : "Confirmar cambio"}
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {productoActivo && !varianteNueva ? "Falta elegir talla o color para confirmar el cambio." : ""}
      </p>
      <p className="w-full text-[11px] text-tinta/50">
        Se entrega: {linea.referencia} {codigoPrenda(linea)} → {varianteNueva ? `${varianteNueva.referencia} ${codigoPrenda(varianteNueva)}` : "—"}
      </p>
    </form>
  );
}
