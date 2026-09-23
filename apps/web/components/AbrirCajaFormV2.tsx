"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { diferenciaApertura, leerMonto, motivoAperturaValido } from "@/lib/caja-cierre-reglas";

function money(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Abrir caja (ADR-0185). Si el último cierre de la sede dejó un monto en el cajón (`esperado`), se pide contar el
 * cajón antes de abrir: con un toque si coincide, o escribiendo cuánto hay y por qué no coincide. La diferencia queda
 * guardada y le aparece al líder en Inicio. Sin `esperado` (cierres anteriores a ADR-0185) se escribe el monto como
 * siempre. El candado real está en `abrir_caja`: esto solo lo explica antes de enviar.
 */
export function AbrirCajaFormV2({
  ubicacionId,
  ubicacionEtiqueta,
  esperado,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  esperado: number | null;
}) {
  const router = useRouter();
  const [opcion, setOpcion] = useState<"igual" | "otro" | null>(esperado === null ? "otro" : null);
  const [montoTexto, setMontoTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  // Abrir caja es una acción que guarda en la tienda: pide Responsable (ADR-0161).
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta });

  const monto = opcion === "igual" ? esperado : leerMonto(montoTexto);
  const diferencia = monto === null ? null : diferenciaApertura(monto, esperado);
  const pideMotivo = diferencia !== null && diferencia !== 0;
  const listo = monto !== null && monto >= 0 && (!pideMotivo || motivoAperturaValido(motivo));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listo || monto === null || !responsable.listo) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("abrir_caja", {
        p_ubicacion_id: ubicacionId,
        p_monto_apertura: monto,
        ...(pideMotivo ? { p_motivo_diferencia: motivo.trim() } : {}),
      }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "abrir la caja"));
      return;
    }
    avisar.exito("Caja abierta", {
      detalle: pideMotivo
        ? `Con ${money(monto)}. La diferencia de ${money(Math.abs(diferencia!))} quedó registrada para el líder.`
        : `Con ${money(monto)} de apertura.`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-4 p-5">
      <div>
        <p className="label-cayla text-[11px] text-taupe-profundo">Abrir caja</p>
        <h2 className="font-display mt-0.5 text-2xl text-tinta">
          {esperado === null ? `${ubicacionEtiqueta} no tiene una caja abierta` : "Antes de abrir, cuenta el cajón"}
        </h2>
      </div>

      {esperado !== null && (
        <>
          <div className="flex gap-3 rounded-xl border border-metodo-efectivo/35 bg-metodo-efectivo/10 px-4 py-3 text-sm text-ambar-profundo">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Según el último cierre, en el cajón deberían estar <b className="text-tinta">{money(esperado)}</b>. Cuéntalo
              ahora: si abres con un monto que no está, cualquier faltante de hoy va a parecer tuyo.
            </p>
          </div>
          <div role="radiogroup" aria-label="¿Cuánto hay en el cajón?" className="grid gap-2">
            <Opcion
              activa={opcion === "igual"}
              onElegir={() => setOpcion("igual")}
              titulo={
                <>
                  Conté y hay <b className="tabular-nums">{money(esperado)}</b>
                </>
              }
              detalle="Abre con el mismo monto del cierre."
            />
            <Opcion
              activa={opcion === "otro"}
              onElegir={() => setOpcion("otro")}
              titulo="Hay otro monto"
              detalle="Se abre con lo que cuentes y la diferencia queda registrada."
            />
          </div>
        </>
      )}

      {opcion === "otro" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="apertura-monto">
              {esperado === null ? "Monto con el que abres (efectivo en el cajón)" : "¿Cuánto hay en el cajón?"}
            </label>
            <div className="flex items-baseline gap-1.5 border-b border-tinta/20 focus-within:border-rojo">
              <span className="font-display text-xl text-tinta/50">S/</span>
              <input
                id="apertura-monto"
                inputMode="decimal"
                autoComplete="off"
                autoFocus={esperado !== null}
                placeholder="0.00"
                value={montoTexto}
                onChange={(e) => setMontoTexto(e.target.value)}
                className="font-display w-full bg-transparent py-1 text-2xl tabular-nums text-tinta outline-none"
              />
            </div>
          </div>
          {diferencia === 0 && esperado !== null && (
            <p className="rounded-lg bg-verde/10 px-3 py-2 text-sm text-verde-profundo">Coincide con el último cierre.</p>
          )}
          {pideMotivo && (
            <>
              <p
                className={`rounded-lg px-3 py-2 text-xs ${diferencia! < 0 ? "bg-rojo/10 text-rojo-profundo" : "bg-ambar/10 text-ambar-profundo"}`}
              >
                {diferencia! < 0 ? "Faltan" : "Sobran"} <b>{money(Math.abs(diferencia!))}</b> respecto al último cierre. Se
                abrirá con {money(monto!)} y el líder de equipo lo verá en Inicio.
              </p>
              <div className="space-y-1.5">
                <label className={campoEtiqueta} htmlFor="apertura-motivo">
                  ¿Qué pasó? <span className="normal-case tracking-normal text-tinta/50">(obligatorio si no coincide)</span>
                </label>
                <input
                  id="apertura-motivo"
                  placeholder="Ej.: se usó para vuelto antes de abrir"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className={campoTexto}
                />
              </div>
            </>
          )}
        </div>
      )}

      <ComboResponsable control={responsable} deshabilitado={loading} />
      <button
        type="submit"
        disabled={loading || !listo || !responsable.listo}
        title={responsable.motivo ?? undefined}
        className={`${botonPrimario} w-full`}
      >
        {loading ? "Abriendo…" : monto !== null && listo ? `Abrir caja con ${money(monto)}` : "Abrir caja"}
      </button>
    </form>
  );
}

function Opcion({
  activa,
  onElegir,
  titulo,
  detalle,
}: {
  activa: boolean;
  onElegir: () => void;
  titulo: React.ReactNode;
  detalle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onElegir}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        activa ? "border-tinta bg-crema" : "border-sand bg-papel hover:border-taupe"
      }`}
    >
      <span
        aria-hidden
        className={`relative h-4 w-4 shrink-0 rounded-full border-[1.5px] ${activa ? "border-tinta" : "border-tinta/50"}`}
      >
        {activa && <span className="absolute inset-[3px] rounded-full bg-tinta" />}
      </span>
      <span className="text-sm text-tinta">
        {titulo}
        <span className="block text-xs text-tinta/60">{detalle}</span>
      </span>
    </button>
  );
}
