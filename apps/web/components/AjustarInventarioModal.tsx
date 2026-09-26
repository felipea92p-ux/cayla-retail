"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import {
  MOTIVOS_AJUSTE,
  NOTA_REPOSICION_CERRADA,
  armarVariantesAjuste,
  motivosAjusteDisponibles,
  reposicionCerrada,
  type MotivoAjuste,
  type VarianteAjuste,
} from "@/lib/ajuste-reglas";
import { descargarCsv } from "@/lib/exportar-csv";
import type { Sububicacion } from "@/lib/sububicaciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Reusa `retail.registrar_movimiento` (20260914230000_inventario_piso_almacen.sql,
// tipo='ajuste') — la misma RPC que ya escribe ajustes sueltos en el repo. No existe
// una segunda vía: `stock` sigue siendo un snapshot derivado de `movimientos`
// (principio 4), y la guarda de negativos vive en `fn_aplicar_movimiento` (ADR-0023).
// Este modal valida en pantalla con el stock ya cargado para dar feedback instantáneo
// (principio 10) — la RPC queda como red real si el stock cambió mientras el modal
// estaba abierto.

export function AjustarInventarioModal({
  productoId,
  ubicacionId,
  sububicaciones,
  onClose,
}: {
  productoId: string;
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  onClose: () => void;
}) {
  const router = useRouter();
  const sububicacionPiso = sububicaciones.find((s) => s.tipo === "piso_venta") ?? null;
  const sububicacionAlmacen = sububicaciones.find((s) => s.tipo === "almacen_tienda") ?? null;
  const separaPisoAlmacen = !!sububicacionPiso && !!sububicacionAlmacen;

  const [cargando, setCargando] = useState(true);
  const [referencia, setReferencia] = useState("");
  const [variantes, setVariantes] = useState<VarianteAjuste[]>([]);
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [ubicado, setUbicado] = useState<"piso" | "almacen">("piso");
  const [motivo, setMotivo] = useState<MotivoAjuste | "">("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un ajuste de stock guarda en la tienda: pide Responsable (ADR-0161).
  const responsable = useResponsable();

  useEffect(() => {
    let vigente = true;
    // La talla ya no es una columna de texto de `variantes`: es `talla_id` → `tallas.valor`
    // (20260917100500, ADR-0095), igual que en `getCatalogo`. El resultado se pasa SIN castear
    // a propósito: así `tsc` compara este select con `FilaAjuste` y avisa si vuelve a pedir
    // una columna que no existe (antes un `as unknown as` lo tapaba y solo fallaba en vivo).
    // El orden por talla se hace al armar las filas (S · M · L, no alfabético); el `order("sku")`
    // solo fija el desempate para que la lista no baraje entre un refresco y otro.
    createClient()
      .from("variantes")
      .select(
        `id, sku,
         talla:tallas ( valor ),
         color:colores ( nombre ),
         producto:productos ( referencia ),
         stock ( cantidad, sububicacion_id )`
      )
      .eq("producto_id", productoId)
      .eq("stock.ubicacion_id", ubicacionId)
      .order("sku")
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) {
          avisar.error(traducirError(errCarga, "cargar las variantes del producto"));
          setCargando(false);
          return;
        }
        const filas = data ?? [];
        setReferencia(filas[0]?.producto?.referencia ?? "");
        setVariantes(armarVariantesAjuste(filas, sububicacionPiso?.id, sububicacionAlmacen?.id));
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [productoId, ubicacionId, sububicacionPiso?.id, sububicacionAlmacen?.id]);

  function stockActual(v: VarianteAjuste): number {
    if (!separaPisoAlmacen) return v.stockSinDividir;
    return ubicado === "piso" ? v.stockPiso : v.stockAlmacen;
  }

  // Filas con un ajuste entero distinto de cero, y las que dejarían el stock
  // negativo — mismo cálculo que hace `fn_aplicar_movimiento`, adelantado acá
  // para no obligar a un viaje a la base a enterarse.
  const lineas = variantes
    .map((v) => {
      const texto = (deltas[v.varianteId] ?? "").trim();
      if (texto === "") return null;
      const delta = Number(texto);
      if (!Number.isInteger(delta) || delta === 0) return null;
      const actual = stockActual(v);
      return { variante: v, delta, actual, resultado: actual + delta };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const negativas = lineas.filter((l) => l.resultado < 0);

  // «Reposición» no toca el piso de una tienda que separa piso y almacén (ADR-0208, 20260926000400): no se ofrece ahí.
  const motivos = motivosAjusteDisponibles(ubicado, separaPisoAlmacen);
  const cerrada = reposicionCerrada(ubicado, separaPisoAlmacen);

  function cambiarUbicado(siguiente: "piso" | "almacen") {
    setUbicado(siguiente);
    // Si «Reposición» estaba elegida y ya no se ofrece, no se queda escondida en el formulario.
    if (reposicionCerrada(siguiente, separaPisoAlmacen) && motivo === "reposicion") setMotivo("");
  }

  // Reporte de lo tipeado en el formulario, no de lo ya confirmado — sirve tanto
  // de respaldo antes de enviar como para revisar después de un envío exitoso
  // (el modal se cierra solo al confirmar, no queda pantalla de "ya se aplicó").
  function descargarReporte() {
    const motivoTexto = MOTIVOS_AJUSTE.find((m) => m.valor === motivo)?.texto ?? "";
    const fecha = new Date();
    descargarCsv(
      `ajuste-inventario_${referencia || "producto"}_${fecha.toISOString().slice(0, 10)}.csv`.replace(/\s+/g, "-"),
      ["SKU", "Talla", "Color", "Stock actual", "Ajuste", "Stock resultante", "Motivo", "Observación"],
      lineas.map((l) => [
        l.variante.sku,
        l.variante.talla ?? "—",
        l.variante.color ?? "—",
        l.actual,
        l.delta > 0 ? `+${l.delta}` : l.delta,
        l.resultado,
        motivoTexto,
        nota.trim() || "—",
      ])
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    if (!motivo) {
      setError("Elige un motivo para el ajuste.");
      return;
    }
    if (lineas.length === 0) {
      setError("Ingresa al menos un ajuste distinto de cero.");
      return;
    }
    if (negativas.length > 0) {
      setError(
        `${negativas.map((l) => l.variante.sku).join(", ")}: el ajuste dejaría el stock en negativo — hay ${negativas[0].actual} y se pide ${negativas[0].delta}.`
      );
      return;
    }

    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const pendientes = [...lineas];
    // Una sola firma para todo el ajuste: cada línea es una llamada, pero la operación es una y la hace una persona.
    const firma = responsable.firma();
    for (const linea of pendientes) {
      const { error: errorRpc } = await firmar(supabase.rpc("registrar_movimiento", {
        p_variante_id: linea.variante.varianteId,
        p_ubicacion_id: ubicacionId,
        p_tipo: "ajuste",
        p_cantidad: linea.delta,
        p_motivo: motivo,
        p_nota: nota.trim() || undefined,
        ...(separaPisoAlmacen
          ? { p_sububicacion_id: ubicado === "piso" ? sububicacionPiso!.id : sububicacionAlmacen!.id }
          : {}),
      }), firma);
      if (errorRpc) {
        setEnviando(false);
        responsable.despues(errorRpc);
        setError(traducirError(errorRpc, "ajustar el inventario"));
        // Las líneas ya aplicadas se quitan del formulario para no reenviarlas
        // dos veces si Felipe corrige y reintenta.
        setDeltas((prev) => {
          const siguiente = { ...prev };
          for (const aplicada of pendientes.slice(0, pendientes.indexOf(linea))) {
            delete siguiente[aplicada.variante.varianteId];
          }
          return siguiente;
        });
        return;
      }
    }
    setEnviando(false);
    responsable.despues(null);
    avisar.exito(`${lineas.length} ${lineas.length === 1 ? "variante ajustada" : "variantes ajustadas"}`, {
      detalle: referencia,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ajustar inventario" subtitulo={referencia} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          {cargando ? (
            <p className="text-sm text-tinta/65">Cargando variantes…</p>
          ) : variantes.length === 0 ? (
            <p className="text-sm text-tinta/65">Este producto no tiene variantes.</p>
          ) : (
            <>
              {separaPisoAlmacen && (
                <Segmentado
                  etiqueta="Dónde se ajusta"
                  valor={ubicado}
                  onValor={cambiarUbicado}
                  opciones={[
                    { valor: "piso", texto: "Piso de venta" },
                    { valor: "almacen", texto: "Almacén de tienda" },
                  ]}
                />
              )}

              <div className="space-y-2">
                {variantes.map((v) => {
                  const actual = stockActual(v);
                  const texto = deltas[v.varianteId] ?? "";
                  const delta = Number(texto);
                  const conAjuste = texto.trim() !== "" && Number.isInteger(delta) && delta !== 0;
                  return (
                    <div key={v.varianteId} className="flex items-center gap-3 border-b border-tinta/10 pb-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-tinta">
                          {[v.talla, v.color].filter(Boolean).join(" / ") || "Única"}
                        </p>
                        <p className="font-mono text-[11px] text-tinta/55">
                          {v.sku} · stock {actual}
                          {conAjuste ? ` → ${actual + delta}` : ""}
                        </p>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        placeholder="0"
                        value={texto}
                        onChange={(e) => setDeltas((prev) => ({ ...prev, [v.varianteId]: e.target.value }))}
                        className="w-20 border-b border-tinta/20 bg-transparent px-1 py-1.5 text-right text-sm text-tinta outline-none focus:border-rojo"
                      />
                    </div>
                  );
                })}
              </div>

              <CampoSelect
                etiqueta="Motivo"
                valor={motivo}
                onValor={setMotivo}
                opciones={motivos}
                marcador="Elegir motivo"
              />

              {/* Bajo el motivo, y SIEMPRE ocupando su lugar en una tienda que separa piso y almacén: invisible en Almacén,
                  a la vista en Piso. Así cambiar Piso/Almacén no mueve el botón que está bajo el mouse (ADR-0185). */}
              {separaPisoAlmacen && (
                <p className={`nota-cayla ${cerrada ? "" : "invisible"}`} role="status" aria-hidden={!cerrada || undefined}>
                  {NOTA_REPOSICION_CERRADA}
                </p>
              )}

              <CampoTexto
                etiqueta="Observación (opcional)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={200}
                placeholder="Detalle libre del ajuste"
              />
            </>
          )}

          <div className="min-h-[1rem] text-xs text-rojo">{error}</div>

          {lineas.length > 0 && (
            <button
              type="button"
              onClick={descargarReporte}
              className="label-cayla -mt-2 text-[11px] text-tinta/55 hover:text-rojo"
            >
              Descargar reporte de este ajuste
            </button>
          )}

          <ComboResponsable control={responsable} deshabilitado={enviando} />

          <div className="flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={enviando}
              disabled={cargando || variantes.length === 0 || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className="flex-1"
            >
              Confirmar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
