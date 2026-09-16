"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { botonPrimario } from "@/components/ui/Modal";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { ETIQUETA_ESTADO_TRASLADO, tonoEstadoTraslado } from "@/lib/movimientos-reglas";
import type { TrasladoDetalle } from "@/lib/traslados";

type VarianteBusqueda = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; codigosBarras: string[] };

// Traslado en dos fases (20260916150000): quien confirma anota lo que
// REALMENTE llegó, línea por línea — puede diferir de lo enviado en
// cantidad, o ser una prenda que nunca se envió (sustitución). Si todo
// coincide exacto, confirmar_traslado cierra solo; si no, queda pendiente de
// que un líder de destino lo revise (cerrar_traslado_con_diferencia) —
// mismo patrón que cerrar_conteo.
export function TrasladoDetallePanel({
  traslado: t,
  esDestino,
  esLider,
  catalogo,
}: {
  traslado: TrasladoDetalle;
  esDestino: boolean;
  esLider: boolean;
  catalogo: VarianteBusqueda[];
}) {
  const router = useRouter();
  const [recibidas, setRecibidas] = useState<Record<string, string>>(
    Object.fromEntries(t.lineas.filter((l) => l.cantidadEnviada != null).map((l) => [l.varianteId, String(l.cantidadRecibida ?? l.cantidadEnviada)]))
  );
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [notaCierre, setNotaCierre] = useState("");
  const [error, setError] = useState<string | null>(null);

  const puedeEditar = esDestino && (t.estado === "en_transito" || t.estado === "recibido_con_diferencia");
  const yaEnLineas = new Set(t.lineas.map((l) => l.varianteId));
  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return catalogo
      .filter((v) => !yaEnLineas.has(v.varianteId) && ((v.sku ?? "").toLowerCase().includes(q) || v.codigosBarras.some((c) => c.toLowerCase() === q)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, catalogo]);

  async function guardarLinea(varianteId: string, cantidad: number) {
    setGuardando(varianteId);
    setError(null);
    const { error } = await createClient().rpc("registrar_recepcion_traslado", {
      p_transferencia_id: t.id,
      p_variante_id: varianteId,
      p_cantidad_recibida: cantidad,
    });
    setGuardando(null);
    if (error) {
      setError(traducirError(error, "registrar lo recibido"));
      return;
    }
    router.refresh();
  }

  async function confirmar() {
    setConfirmando(true);
    setError(null);
    const { data, error } = await createClient().rpc("confirmar_traslado", { p_transferencia_id: t.id });
    setConfirmando(false);
    if (error) {
      setError(traducirError(error, "confirmar la recepción"));
      return;
    }
    const resultado = data?.[0]?.resultado;
    avisar.exito(resultado === "cerrada" ? "Traslado cerrado — coincidió todo" : "Registrado — hay diferencias, un líder tiene que revisarlo");
    router.refresh();
  }

  async function cerrarConDiferencia() {
    setCerrando(true);
    setError(null);
    const { error } = await createClient().rpc("cerrar_traslado_con_diferencia", { p_transferencia_id: t.id, p_nota: notaCierre || undefined });
    setCerrando(false);
    if (error) {
      setError(traducirError(error, "cerrar el traslado"));
      return;
    }
    avisar.exito("Traslado cerrado con la diferencia registrada");
    router.refresh();
  }

  // Ojo: mira el estado ya guardado en el servidor (`cantidadRecibida`), no
  // el valor local del input — el input arranca precargado con lo enviado
  // (para que "coincidió todo" sea un solo clic), pero eso no significa que
  // `registrar_recepcion_traslado` ya se llamó para esa línea. Confirmar
  // antes de que el servidor tenga cada línea solo rebota con el error de
  // la RPC — mejor no ofrecer el botón todavía.
  const faltanPorConfirmar = t.lineas.some((l) => l.cantidadEnviada != null && l.cantidadRecibida == null);

  return (
    <div className="space-y-5">
      <div className="card-cayla flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-2">
          <Chip tono={tonoEstadoTraslado(t.estado)}>{ETIQUETA_ESTADO_TRASLADO[t.estado] ?? t.estado}</Chip>
          {t.fechaEstimadaLlegada && (
            <span className="text-xs text-tinta/65">
              Llega ~{new Date(t.fechaEstimadaLlegada).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <p className="text-xs text-tinta/65">Envió {t.creadoPorNombre}</p>
      </div>
      {t.nota && <p className="text-sm text-tinta/70">Nota de envío: {t.nota}</p>}
      {error && <p className="text-sm text-rojo">{error}</p>}

      <div className="card-cayla overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tinta/10 text-left text-[11px] text-tinta/65">
              <th className="label-cayla px-5 py-2.5">Prenda</th>
              <th className="label-cayla px-3 py-2.5 text-right">Enviado</th>
              <th className="label-cayla px-3 py-2.5 text-right">Recibido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta/10">
            {t.lineas.map((l) => {
              const diferente = l.cantidadEnviada != null && l.cantidadRecibida != null && l.cantidadEnviada !== l.cantidadRecibida;
              const nueva = l.cantidadEnviada == null;
              return (
                <tr key={l.varianteId} className={nueva ? "bg-ambar/5" : ""}>
                  <td className="px-5 py-2.5">
                    <p className="text-tinta">{l.referencia}</p>
                    <p className="text-xs text-tinta/55">
                      {l.sku} {[l.talla, l.color].filter(Boolean).join("/")}
                      {nueva && " · no estaba en el envío"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-tinta/75">{l.cantidadEnviada ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {puedeEditar ? (
                      <input
                        type="number"
                        min={0}
                        value={recibidas[l.varianteId] ?? l.cantidadRecibida ?? ""}
                        onChange={(e) => setRecibidas((a) => ({ ...a, [l.varianteId]: e.target.value }))}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 0) guardarLinea(l.varianteId, n);
                        }}
                        disabled={guardando === l.varianteId}
                        className={`w-20 rounded-lg border px-2 py-1 text-right tabular-nums ${diferente ? "border-ambar text-ambar-profundo" : "border-tinta/15 text-tinta"}`}
                      />
                    ) : (
                      <span className={`tabular-nums ${diferente ? "text-ambar-profundo" : "text-tinta/75"}`}>{l.cantidadRecibida ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeEditar && (
        <div className="card-cayla p-5">
          <p className="label-cayla mb-2 text-[11px] text-tinta/65">Llegó algo que no estaba en el envío</p>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              const exacto = resolverCodigoV2(e.target.value, catalogo);
              if (exacto) {
                guardarLinea(exacto.varianteId, 1);
                setBusqueda("");
              }
            }}
            placeholder="Escanea el código de barras o escribe el SKU…"
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
          {coincidencias.length > 0 && (
            <div className="mt-2 space-y-1">
              {coincidencias.map((v) => (
                <button
                  key={v.varianteId}
                  type="button"
                  onClick={() => {
                    guardarLinea(v.varianteId, 1);
                    setBusqueda("");
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/50"
                >
                  <span>
                    {v.referencia} · {v.sku} {[v.talla, v.color].filter(Boolean).join("/")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {puedeEditar && t.estado === "en_transito" && (
        <button
          type="button"
          onClick={confirmar}
          disabled={confirmando || faltanPorConfirmar}
          className={`${botonPrimario} w-full`}
        >
          {confirmando ? "Confirmando…" : "Confirmar recepción"}
        </button>
      )}
      {puedeEditar && t.estado === "en_transito" && faltanPorConfirmar && (
        <p className="text-center text-xs text-tinta/55">Registra qué pasó con cada prenda enviada (aunque sea 0) antes de confirmar.</p>
      )}

      {t.estado === "recibido_con_diferencia" && (
        esLider ? (
          <div className="card-cayla space-y-3 p-5">
            <p className="text-sm text-tinta/75">Lo recibido no coincide con lo enviado — como líder, puedes cerrarlo así.</p>
            <textarea
              value={notaCierre}
              onChange={(e) => setNotaCierre(e.target.value)}
              placeholder="Nota (opcional): qué pasó con la diferencia"
              className="w-full rounded-lg border border-tinta/15 bg-papel px-3 py-2 text-sm text-tinta"
              rows={2}
            />
            <button type="button" onClick={cerrarConDiferencia} disabled={cerrando} className={`${botonPrimario} w-full`}>
              {cerrando ? "Cerrando…" : "Cerrar con esta diferencia"}
            </button>
          </div>
        ) : (
          <p className="card-cayla p-5 text-center text-sm text-tinta/65">
            Solo un líder puede cerrar este traslado — quedó con una diferencia entre lo enviado y lo recibido.
          </p>
        )
      )}
    </div>
  );
}
