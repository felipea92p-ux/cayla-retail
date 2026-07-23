"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ModeloOpcion = { id: string; referencia: string };
export type OrdenLinea = { varianteId: string; talla: string | null; color: string | null; cantidad: number };
export type OrdenRow = {
  id: string;
  modelo: string;
  material: string | null;
  detalle: string | null;
  esMuestra: boolean;
  estado: string;
  inventariado: boolean;
  cantidad: number;
  costoUnitario: number;
  precioTaller: number;
  costoTela: number;
  costoAvios: number;
  costoMaquila: number;
  etapas: Record<string, string>;
  fechaEntrega: string | null;
  lineas: OrdenLinea[];
};

// El proceso se parte en DOS tipos de orden (decisión con Felipe, jul-2026):
// MUESTRA = desarrollar el modelo, una sola vez · PRODUCCIÓN = fabricar el lote, cada vez.
// Un modelo que "ya tiene muestra" arranca directo en Producción.
type EtapaDef = { key: string; label: string; desc: string };
const ETAPAS_MUESTRA: EtapaDef[] = [
  { key: "patronaje", label: "Patronaje", desc: "Crear el molde base del modelo." },
  { key: "muestra", label: "Muestra y aprobación", desc: "Coser un prototipo y revisarlo antes de producir." },
  { key: "escalado", label: "Escalado y ploteo", desc: "Molde a todas las tallas + trazar la marca (tizado) sobre la tela." },
];
const ETAPAS_PRODUCCION: EtapaDef[] = [
  { key: "corte", label: "Corte", desc: "Tender la tela y cortar las piezas." },
  { key: "confeccion", label: "Confección", desc: "Costura, ojal y botón — armar la prenda." },
  { key: "acabado", label: "Acabados", desc: "Planchado, limpiar hilos, control de calidad, etiqueta y empaque." },
];
const etapasDe = (esMuestra: boolean): EtapaDef[] => (esMuestra ? ETAPAS_MUESTRA : ETAPAS_PRODUCCION);

// Umbrales del semáforo — margen = precio a tienda − costo directo, como % del precio.
// Alto a propósito: de ese margen salen costura, taller y utilidad (mano de obra fija).
const UMBRAL_GANA = 0.6;
const UMBRAL_FILO = 0.4;

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function semaforo(precio: number, costo: number): { txt: string; dot: string } {
  if (precio <= 0) return { txt: "falta precio", dot: "bg-tinta/25" };
  const pct = (precio - costo) / precio;
  if (precio - costo < 0) return { txt: "pierde", dot: "bg-rojo" };
  if (pct < UMBRAL_FILO) return { txt: "no cubre taller", dot: "bg-rojo" };
  if (pct < UMBRAL_GANA) return { txt: "al filo", dot: "bg-ambar" };
  return { txt: "gana", dot: "bg-verde" };
}

function parseEje(raw: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    const k = p.toLowerCase();
    if (!vistos.has(k)) { vistos.add(k); out.push(p); }
  }
  return out;
}

const inputCls =
  "w-full border border-tinta/20 bg-crema px-3 py-2.5 text-sm text-tinta transition-colors focus:border-rojo focus:outline-none";
const labelCls = "label-cayla text-[9px] text-tinta/45";

export function OrdenesProduccion({
  unidadId,
  modelos,
  materiales,
  ordenes,
}: {
  unidadId: string;
  modelos: ModeloOpcion[];
  materiales: string[];
  ordenes: OrdenRow[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);

  const enProceso = ordenes.filter((o) => !o.inventariado && o.estado !== "terminado");
  const terminadas = ordenes.filter((o) => o.inventariado || o.estado === "terminado");

  async function llamar(fn: () => PromiseLike<{ error: { message: string } | null }>, id: string) {
    setOcupadoId(id);
    setError(null);
    const { error } = await fn();
    setOcupadoId(null);
    if (error) { setError(error.message); return false; }
    router.refresh();
    return true;
  }

  async function fijarEtapa(o: OrdenRow, etapa: string, estado: string) {
    await llamar(() => createClient().rpc("set_etapa_produccion", { p_produccion_id: o.id, p_etapa: etapa, p_estado: estado }), o.id);
  }

  async function eliminar(id: string) {
    if (!window.confirm("¿Eliminar esta orden? No entró al inventario, así que no deja rastro.")) return;
    await llamar(() => createClient().rpc("eliminar_produccion", { p_produccion_id: id }), id);
  }

  async function revertir(id: string) {
    if (!window.confirm("¿Sacar estas prendas del inventario? Vuelven a salir del stock y la orden regresa a 'en proceso'.")) return;
    await llamar(() => createClient().rpc("revertir_produccion_inventario", { p_produccion_id: id }), id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button onClick={() => setAbierto((v) => !v)}
          className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo">
          {abierto ? "Cerrar" : "+ Nueva orden"}
        </button>
      </div>

      {error && <p className="rounded-lg border border-rojo/30 bg-rojo/5 px-3 py-2 text-sm text-rojo">{error}</p>}

      {abierto && <NuevaOrdenForm unidadId={unidadId} modelos={modelos} materiales={materiales} onDone={() => { setAbierto(false); router.refresh(); }} onError={setError} />}

      {/* En proceso */}
      {enProceso.length > 0 && (
        <div className="space-y-3">
          <p className="label-cayla text-[10px] text-tinta/45">En proceso · marca solo las etapas que apliquen</p>
          {enProceso.map((o) => (
            <OrdenEnProceso
              key={o.id} orden={o} ocupado={ocupadoId === o.id} cerrando={cerrandoId === o.id}
              onEtapa={(et, estado) => fijarEtapa(o, et, estado)}
              onEliminar={() => eliminar(o.id)}
              onAbrirCierre={() => setCerrandoId(cerrandoId === o.id ? null : o.id)}
              onCerrado={() => { setCerrandoId(null); router.refresh(); }}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* Terminadas */}
      <div className="space-y-3">
        <p className="label-cayla text-[10px] text-tinta/45">Terminadas · en el inventario del taller</p>
        {terminadas.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/40">
            Aún no cierras ninguna orden al inventario.
          </p>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/40">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[9px]">Modelo</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Entraron</th>
                  <th className="label-cayla px-3 py-2 text-right text-[9px]">Costo real/prenda</th>
                  <th className="label-cayla px-3 py-2 text-right text-[9px]">Precio tienda</th>
                  <th className="label-cayla px-3 py-2 text-[9px]">Semáforo</th>
                  <th className="label-cayla px-3 py-2 text-right text-[9px]">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {terminadas.map((o) => {
                  const s = semaforo(o.precioTaller, o.costoUnitario);
                  const m = Math.round((o.precioTaller - o.costoUnitario) * 100) / 100;
                  return (
                    <tr key={o.id}>
                      <td className="px-3 py-2.5 font-medium text-tinta">
                        {o.modelo}
                        {o.material && <span className="ml-2 text-[11px] font-normal text-tinta/40">· {o.material}</span>}
                        {o.detalle && <span className="ml-2 text-[11px] font-normal text-tinta/40">{o.detalle}</span>}
                        {o.esMuestra && <span className="label-cayla ml-2 text-[8px] text-taupe">muestra</span>}
                      </td>
                      <td className="px-3 py-2.5 text-tinta/55">{o.esMuestra ? "—" : o.cantidad}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-tinta/70">{money(o.costoUnitario)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-tinta/70">{o.precioTaller > 0 ? money(o.precioTaller) : "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
                          <span className="text-tinta/50">{o.precioTaller > 0 ? `${s.txt} · ${Math.round((m / o.precioTaller) * 100)}%` : s.txt}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {o.esMuestra ? (
                          <span className="label-cayla text-[9px] text-taupe">muestra cerrada</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {ocupadoId === o.id ? (
                              <span className="label-cayla text-[9px] text-tinta/40">Procesando…</span>
                            ) : (
                              <>
                                <span className="label-cayla text-[9px] text-verde">en inventario</span>
                                <button onClick={() => revertir(o.id)} className="label-cayla text-[9px] text-tinta/40 transition-colors hover:text-rojo">Revertir</button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdenEnProceso({
  orden, ocupado, cerrando, onEtapa, onEliminar, onAbrirCierre, onCerrado, onError,
}: {
  orden: OrdenRow;
  ocupado: boolean;
  cerrando: boolean;
  onEtapa: (etapa: string, estado: string) => void;
  onEliminar: () => void;
  onAbrirCierre: () => void;
  onCerrado: () => void;
  onError: (m: string) => void;
}) {
  const etapas = etapasDe(orden.esMuestra);
  const [verGlosario, setVerGlosario] = useState(false);
  const s = semaforo(orden.precioTaller, orden.costoUnitario);
  const margen = Math.round((orden.precioTaller - orden.costoUnitario) * 100) / 100;
  const pct = orden.precioTaller > 0 ? Math.round((margen / orden.precioTaller) * 100) : 0;
  const sub = [orden.detalle, `${orden.cantidad} planeadas`, orden.fechaEntrega ? `entrega ${orden.fechaEntrega}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card-cayla p-5">
      {/* Encabezado + badge de estado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-display text-base text-tinta">{orden.modelo}</span>
          {orden.material && (
            <span className="ml-2 rounded-full border border-tinta/15 px-2 py-0.5 align-middle text-[9px] text-tinta/45">{orden.material}</span>
          )}
          <p className="mt-0.5 text-xs text-tinta/45">{sub}</p>
        </div>
        <span className="label-cayla shrink-0 rounded-full border border-ambar/30 bg-ambar/10 px-3 py-1 text-[9px] text-ambar">
          {orden.esMuestra ? "Muestra" : "En proceso"}
        </span>
      </div>

      {/* Etapas — se adaptan al tipo de orden (muestra = desarrollo, producción = fabricación). */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <p className="label-cayla text-[9px] text-tinta/40">
            {orden.esMuestra ? "Etapas de desarrollo" : "Etapas"} — toca para marcar hecha
          </p>
          <button type="button" onClick={() => setVerGlosario((v) => !v)}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-tinta/25 text-[9px] leading-none text-tinta/45 transition-colors hover:border-rojo hover:text-rojo"
            aria-label="Qué significa cada etapa">i</button>
        </div>
        {verGlosario && (
          <ul className="mt-2 space-y-1 rounded-lg border border-tinta/10 bg-crema px-3 py-2 text-[11px] text-tinta/55">
            {etapas.map((e) => (
              <li key={e.key}><span className="font-medium text-tinta/75">{e.label}:</span> {e.desc}</li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {etapas.map((e) => {
            const estado = orden.etapas?.[e.key] ?? "pendiente";
            const cls =
              estado === "hecho" ? "border-verde/45 bg-verde/10 text-verde"
              : estado === "tercerizado" ? "border-taupe/40 bg-sand/40 text-taupe"
              : "border-tinta/20 text-tinta/55 hover:border-tinta/45";
            return (
              <button key={e.key} type="button" disabled={ocupado}
                onClick={() => onEtapa(e.key, estado === "hecho" ? "pendiente" : "hecho")}
                className={`label-cayla rounded-full border px-3.5 py-1.5 text-[9px] transition-colors disabled:opacity-40 ${cls}`}>
                {estado === "hecho" && <span className="mr-1">✓</span>}
                {e.label}
                {estado === "tercerizado" && <span className="ml-1 opacity-70">· afuera</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-tinta/35">
          <span>¿Tercerizaste alguna?</span>
          {etapas.map((e) => {
            const terc = (orden.etapas?.[e.key] ?? "pendiente") === "tercerizado";
            return (
              <button key={e.key} type="button" disabled={ocupado}
                onClick={() => onEtapa(e.key, terc ? "pendiente" : "tercerizado")}
                className={`transition-colors disabled:opacity-40 ${terc ? "text-taupe underline" : "hover:text-rojo"}`}>
                {e.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumen en una línea + acciones */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 pt-3">
        <span className="text-xs text-tinta/55">
          Estimado · <span className="font-medium text-tinta">{money(orden.costoUnitario)}/prenda</span>
          {orden.precioTaller > 0 && (
            <>
              {" · deja "}<span className="font-medium text-tinta">{money(margen)}</span>{` · ${pct}% `}
              <span className={`ml-0.5 inline-block h-2 w-2 translate-y-px rounded-full ${s.dot}`} />
              <span className="ml-1 text-tinta/45">{s.txt}</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={onEliminar} disabled={ocupado}
            className="label-cayla text-[9px] text-tinta/40 transition-colors hover:text-rojo disabled:opacity-40">
            Eliminar
          </button>
          <button onClick={onAbrirCierre} disabled={ocupado}
            className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-40">
            {cerrando ? "Cancelar cierre" : orden.esMuestra ? "Cerrar muestra" : "Terminar orden"}
          </button>
        </div>
      </div>

      {cerrando && <CierreOrden orden={orden} onCerrado={onCerrado} onError={onError} />}
    </div>
  );
}

function CierreOrden({ orden, onCerrado, onError }: { orden: OrdenRow; onCerrado: () => void; onError: (m: string) => void }) {
  const [buenas, setBuenas] = useState<Record<string, string>>(
    () => Object.fromEntries(orden.lineas.map((l) => [l.varianteId, String(l.cantidad)]))
  );
  const [tela, setTela] = useState(String(orden.costoTela));
  const [avios, setAvios] = useState(String(orden.costoAvios));
  const [maquila, setMaquila] = useState(String(orden.costoMaquila));
  const [loading, setLoading] = useState(false);

  const totalBuenas = orden.lineas.reduce((s, l) => s + (Number(buenas[l.varianteId]) || 0), 0);
  const costoReal = Number(tela) + Number(avios) + Number(maquila) || 0;
  const costoUnit = totalBuenas > 0 ? Math.round((costoReal / totalBuenas) * 100) / 100 : 0;
  const margen = Math.round((orden.precioTaller - costoUnit) * 100) / 100;
  const sem = semaforo(orden.precioTaller, costoUnit);

  async function confirmar() {
    setLoading(true);
    onError("");
    const p_buenas = orden.lineas.map((l) => ({ variante_id: l.varianteId, cantidad: Number(buenas[l.varianteId]) || 0 }));
    const { error } = await createClient().rpc("cerrar_produccion", {
      p_produccion_id: orden.id,
      p_costo_tela: Number(tela) || 0,
      p_costo_avios: Number(avios) || 0,
      p_costo_maquila: Number(maquila) || 0,
      p_buenas,
    });
    setLoading(false);
    if (error) { onError(error.message); return; }
    onCerrado();
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-rojo/40 bg-crema p-4">
      <p className="text-xs text-tinta/55">
        Confirma <span className="font-medium text-tinta">cuántas salieron buenas</span> y el <span className="font-medium text-tinta">costo real</span>. Eso es lo que entra al inventario.
      </p>

      {!orden.esMuestra && (
        <div className="space-y-1.5">
          <label className={labelCls}>¿Cuántas salieron buenas? (ajusta si hubo alguna falla)</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {orden.lineas.map((l) => {
              const etiqueta = [l.talla, l.color].filter(Boolean).join(" · ") || "Única";
              const menos = (Number(buenas[l.varianteId]) || 0) < l.cantidad;
              return (
                <label key={l.varianteId} className="flex items-center gap-2 card-cayla px-2.5 py-1.5">
                  <span className="flex-1 truncate text-xs text-tinta/70">{etiqueta} <span className="text-tinta/35">({l.cantidad})</span></span>
                  <input type="number" min={0} inputMode="numeric" value={buenas[l.varianteId] ?? ""}
                    onChange={(e) => setBuenas((p) => ({ ...p, [l.varianteId]: e.target.value }))}
                    className={`w-14 border bg-crema px-1.5 py-1 text-center text-sm focus:border-rojo focus:outline-none ${menos ? "border-rojo/50 text-rojo" : "border-tinta/20 text-tinta"}`} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>Costo real</label>
        <div className="grid grid-cols-3 gap-2">
          <div><span className="mb-1 block text-[10px] text-tinta/40">Tela</span><input type="number" min={0} step="0.10" value={tela} onChange={(e) => setTela(e.target.value)} className={inputCls} /></div>
          <div><span className="mb-1 block text-[10px] text-tinta/40">Avíos</span><input type="number" min={0} step="0.10" value={avios} onChange={(e) => setAvios(e.target.value)} className={inputCls} /></div>
          <div><span className="mb-1 block text-[10px] text-tinta/40">Maquila / terceros</span><input type="number" min={0} step="0.10" value={maquila} onChange={(e) => setMaquila(e.target.value)} className={inputCls} /></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 card-cayla px-4 py-3">
        {!orden.esMuestra && (
          <span><span className={labelCls}>Entran al inventario</span><span className="font-display ml-2 text-lg text-tinta">{totalBuenas}</span></span>
        )}
        <span><span className={labelCls}>Costo real / prenda</span><span className="font-display ml-2 text-lg text-tinta">{money(costoUnit)}</span></span>
        {orden.precioTaller > 0 && (
          <span><span className={labelCls}>Deja para taller</span><span className={`font-display ml-2 text-lg ${margen < 0 ? "text-rojo" : "text-tinta"}`}>{money(margen)}</span><span className="ml-1.5 text-sm text-tinta/40">{Math.round((margen / orden.precioTaller) * 100)}%</span></span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${sem.dot}`} />
          <span className="label-cayla text-[10px] text-tinta/55">{sem.txt}</span>
        </span>
      </div>

      <button onClick={confirmar} disabled={loading || (!orden.esMuestra && totalBuenas <= 0)}
        className="label-cayla w-full bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-30">
        {loading ? "Cerrando…" : orden.esMuestra ? "Cerrar muestra" : "Confirmar y mandar al inventario"}
      </button>
    </div>
  );
}

function NuevaOrdenForm({
  unidadId, modelos, materiales, onDone, onError,
}: {
  unidadId: string;
  modelos: ModeloOpcion[];
  materiales: string[];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [esMuestra, setEsMuestra] = useState(false);
  const [modoNuevo, setModoNuevo] = useState(true);
  const [q, setQ] = useState("");
  const [productoId, setProductoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [material, setMaterial] = useState("");
  const [tallasRaw, setTallasRaw] = useState("");
  const [coloresRaw, setColoresRaw] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cantidadSimple, setCantidadSimple] = useState("");
  const [tela, setTela] = useState("");
  const [avios, setAvios] = useState("");
  const [maquila, setMaquila] = useState("");
  const [precio, setPrecio] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [marcarTerminado, setMarcarTerminado] = useState(false);
  const [loading, setLoading] = useState(false);

  const tallas = useMemo(() => parseEje(tallasRaw), [tallasRaw]);
  const colores = useMemo(() => parseEje(coloresRaw), [coloresRaw]);
  const combos = useMemo(() => {
    if (tallas.length === 0 && colores.length === 0) return [];
    const filas = tallas.length ? tallas : [""];
    const cols = colores.length ? colores : [""];
    const out: { talla: string; color: string; key: string; label: string }[] = [];
    for (const t of filas) for (const c of cols) out.push({ talla: t, color: c, key: `${t}||${c}`, label: [t, c].filter(Boolean).join(" · ") || "Única" });
    return out;
  }, [tallas, colores]);

  const matrixMode = combos.length > 0;
  const total = matrixMode ? combos.reduce((s, c) => s + (Number(qty[c.key]) || 0), 0) : Number(cantidadSimple) || 0;
  const nTela = Number(tela) || 0, nAvios = Number(avios) || 0, nMaquila = Number(maquila) || 0, nPrecio = Number(precio) || 0;
  const costoUnit = total > 0 ? Math.round(((nTela + nAvios + nMaquila) / total) * 100) / 100 : 0;
  const margen = Math.round((nPrecio - costoUnit) * 100) / 100;
  const sem = semaforo(nPrecio, costoUnit);
  const listo = total > 0 && nTela + nAvios + nMaquila > 0 && (modoNuevo ? referencia.trim() !== "" : productoId !== "");

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? modelos.filter((m) => m.referencia.toLowerCase().includes(t)).slice(0, 6) : [];
  }, [modelos, q]);
  const seleccionado = modelos.find((m) => m.id === productoId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    if (!listo) { onError("Faltan datos: modelo, cantidad y costo."); return; }
    const variantes = matrixMode
      ? combos.map((c) => ({ talla: c.talla || null, color: c.color || null, cantidad: Number(qty[c.key]) || 0 })).filter((v) => v.cantidad > 0)
      : [];
    const detalle = matrixMode ? [tallas.join("/"), colores.join(", ")].filter(Boolean).join(" · ") || null : null;
    setLoading(true);
    const { error } = await createClient().rpc("registrar_produccion", {
      p_unidad_id: unidadId,
      p_cantidad: total,
      p_costo_tela: nTela,
      p_costo_avios: nAvios,
      p_costo_maquila: nMaquila,
      p_precio_taller: nPrecio,
      p_variantes: variantes,
      p_producto_id: modoNuevo ? undefined : productoId,
      p_referencia: modoNuevo ? referencia.trim() : undefined,
      p_detalle: detalle ?? undefined,
      p_es_muestra: esMuestra,
      p_fecha_entrega: fechaEntrega || undefined,
      p_marcar_terminado: marcarTerminado && !esMuestra,
      p_material: modoNuevo ? (material.trim() || undefined) : undefined,
      p_nota: undefined,
    });
    setLoading(false);
    if (error) { onError(error.message); return; }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 card-cayla p-5">
      <div className="flex gap-2">
        {[{ v: false, t: "Producción" }, { v: true, t: "Muestra" }].map((o) => (
          <button key={String(o.v)} type="button" onClick={() => setEsMuestra(o.v)}
            className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${esMuestra === o.v ? "border-rojo bg-crema text-tinta" : "border-tinta/15 text-tinta/45"}`}>
            {o.t}
          </button>
        ))}
        {esMuestra && <span className="self-center text-[11px] text-tinta/40">Muestra = desarrollo del modelo (patrón, prototipo, escalado). Su costo queda en el modelo y no entra al inventario.</span>}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {[{ v: true, t: "Modelo nuevo" }, { v: false, t: "Ya existe" }].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => setModoNuevo(o.v)}
              className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${modoNuevo === o.v ? "border-rojo bg-crema text-tinta" : "border-tinta/15 text-tinta/45"}`}>
              {o.t}
            </button>
          ))}
        </div>
        {modoNuevo ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Nombre del modelo</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Short Sastre Lino" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Material / tela</label>
              <input value={material} onChange={(e) => setMaterial(e.target.value)} list="materiales-cayla" placeholder="Lino" className={inputCls} />
              <datalist id="materiales-cayla">
                {materiales.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className={labelCls}>Buscar modelo existente</label>
            {seleccionado ? (
              <div className="flex items-center justify-between border border-tinta/15 bg-crema px-3 py-2 text-sm">
                <span className="text-tinta">{seleccionado.referencia}</span>
                <button type="button" onClick={() => setProductoId("")} className="label-cayla text-[9px] text-rojo">Cambiar</button>
              </div>
            ) : (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre del modelo…" className={inputCls} />
                {resultados.length > 0 && (
                  <div className="divide-y divide-tinta/5 border border-tinta/10 bg-crema">
                    {resultados.map((m) => (
                      <button key={m.id} type="button" onClick={() => { setProductoId(m.id); setQ(""); }}
                        className="block w-full px-3 py-2 text-left text-sm text-tinta hover:bg-sand/40">{m.referencia}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-tinta/10 pt-4">
        <p className={labelCls}>Variantes — tallas, colores y cuántas planeas de cada una</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><label className={labelCls}>Tallas (separadas por coma)</label><input value={tallasRaw} onChange={(e) => setTallasRaw(e.target.value)} placeholder="S, M, L" className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>Colores (separados por coma)</label><input value={coloresRaw} onChange={(e) => setColoresRaw(e.target.value)} placeholder="Negro, Palo Rosa" className={inputCls} /></div>
        </div>
        {matrixMode ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              {combos.map((c) => (
                <label key={c.key} className="flex items-center gap-2 border border-tinta/10 bg-crema px-2.5 py-1.5">
                  <span className="flex-1 truncate text-xs text-tinta/70">{c.label}</span>
                  <input type="number" min={0} inputMode="numeric" value={qty[c.key] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [c.key]: e.target.value }))} placeholder="0"
                    className="w-14 card-cayla px-1.5 py-1 text-center text-sm text-tinta focus:border-rojo focus:outline-none" />
                </label>
              ))}
            </div>
            <p className="text-xs text-tinta/45">Total planeado: <span className="font-medium text-tinta/70">{total} prendas</span></p>
          </div>
        ) : (
          <div className="space-y-1.5"><label className={labelCls}>Cantidad total (si no separas por talla/color)</label><input type="number" min={1} inputMode="numeric" value={cantidadSimple} onChange={(e) => setCantidadSimple(e.target.value)} placeholder="0" className={`${inputCls} max-w-40`} /></div>
        )}
      </div>

      <div className="space-y-2 border-t border-tinta/10 pt-4">
        <p className={labelCls}>Costo estimado (para ver el semáforo y decidir)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5"><label className={labelCls}>Tela</label><input type="number" min={0} step="0.10" value={tela} onChange={(e) => setTela(e.target.value)} placeholder="0.00" className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>Avíos</label><input type="number" min={0} step="0.10" value={avios} onChange={(e) => setAvios(e.target.value)} placeholder="0.00" className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>Maquila / terceros</label><input type="number" min={0} step="0.10" value={maquila} onChange={(e) => setMaquila(e.target.value)} placeholder="0.00" className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>Precio a tienda (c/u)</label><input type="number" min={0} step="0.10" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" className={inputCls} /></div>
        </div>
        <p className="text-[11px] text-tinta/40">Maquila cubre lo que mandas afuera: planchado de tela, corte de lotes grandes o difíciles, etc.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-tinta/10 pt-4">
        <div className="space-y-1.5"><label className={labelCls}>Para cuándo (opcional)</label><input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className={inputCls} /></div>
        {total > 0 && nTela + nAvios + nMaquila > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <span><span className={labelCls}>Costo est./prenda</span><span className="font-display ml-2 text-lg text-tinta">{money(costoUnit)}</span></span>
            {nPrecio > 0 && <span><span className={labelCls}>Deja</span><span className={`font-display ml-2 text-lg ${margen < 0 ? "text-rojo" : "text-tinta"}`}>{money(margen)}</span><span className="ml-1 text-sm text-tinta/40">{Math.round((margen / nPrecio) * 100)}%</span></span>}
            <span className="flex items-center gap-2"><span className={`inline-block h-2.5 w-2.5 rounded-full ${sem.dot}`} /><span className="label-cayla text-[10px] text-tinta/55">{sem.txt}</span></span>
          </div>
        )}
      </div>

      {!esMuestra && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-tinta/60">
          <input type="checkbox" checked={marcarTerminado} onChange={(e) => setMarcarTerminado(e.target.checked)} className="accent-rojo" />
          Ya está terminado — mándalo al inventario ahora (para lo que ya tienes hecho)
        </label>
      )}

      <button type="submit" disabled={loading || !listo}
        className="label-cayla w-full bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-30">
        {loading ? "Guardando…" : marcarTerminado && !esMuestra ? "Abrir y mandar al inventario" : "Abrir orden"}
      </button>
    </form>
  );
}
