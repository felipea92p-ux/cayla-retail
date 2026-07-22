"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ModeloOpcion = { id: string; referencia: string };
export type LoteRow = {
  id: string;
  fecha: string;
  cantidad: number;
  costoUnitario: number;
  precioTaller: number;
  esMuestra: boolean;
  modelo: string;
  detalle: string | null;
};

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Semáforo por margen de contribución (precio a tienda − costo directo de la prenda).
function semaforo(precioTaller: number, costo: number): { txt: string; dot: string } {
  if (precioTaller <= 0) return { txt: "falta precio", dot: "bg-tinta/25" };
  const margen = precioTaller - costo;
  if (margen < 0) return { txt: "pierde", dot: "bg-rojo" };
  if (margen < 0.2 * precioTaller) return { txt: "al filo", dot: "bg-[#c08a2e]" };
  return { txt: "gana", dot: "bg-[#3f7d55]" };
}

export function ProduccionCosteo({
  unidadId,
  modelos,
  lotes,
}: {
  unidadId: string;
  modelos: ModeloOpcion[];
  lotes: LoteRow[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modoNuevo, setModoNuevo] = useState(true);
  const [q, setQ] = useState("");
  const [productoId, setProductoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [tela, setTela] = useState("");
  const [avios, setAvios] = useState("");
  const [precio, setPrecio] = useState("");
  const [detalle, setDetalle] = useState("");
  const [esMuestra, setEsMuestra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nCant = Number(cantidad) || 0;
  const nTela = Number(tela) || 0;
  const nAvios = Number(avios) || 0;
  const nPrecio = Number(precio) || 0;
  const costoUnit = nCant > 0 ? Math.round(((nTela + nAvios) / nCant) * 100) / 100 : 0;
  const margen = Math.round((nPrecio - costoUnit) * 100) / 100;
  const sem = semaforo(nPrecio, costoUnit);
  const listo = nCant > 0 && nTela + nAvios > 0 && (modoNuevo ? referencia.trim() !== "" : productoId !== "");

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return modelos.filter((m) => m.referencia.toLowerCase().includes(t)).slice(0, 6);
  }, [modelos, q]);
  const seleccionado = modelos.find((m) => m.id === productoId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!listo) {
      setError("Faltan datos: modelo, cantidad y costo.");
      return;
    }
    setLoading(true);
    const { error } = await createClient().rpc("registrar_produccion", {
      p_unidad_id: unidadId,
      p_cantidad: nCant,
      p_costo_tela: nTela,
      p_costo_avios: nAvios,
      p_precio_taller: nPrecio,
      p_producto_id: modoNuevo ? undefined : productoId,
      p_referencia: modoNuevo ? referencia.trim() : undefined,
      p_detalle: detalle || undefined,
      p_es_muestra: esMuestra,
      p_nota: undefined,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setReferencia(""); setProductoId(""); setQ("");
    setCantidad(""); setTela(""); setAvios(""); setPrecio(""); setDetalle(""); setEsMuestra(false);
    setAbierto(false);
    router.refresh();
  }

  const inputCls =
    "w-full border border-tinta/20 bg-crema px-3 py-2.5 text-sm text-tinta transition-colors focus:border-rojo focus:outline-none";
  const labelCls = "label-cayla text-[9px] text-tinta/45";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className={labelCls}>Costos y rentabilidad</p>
          <p className="mt-0.5 text-sm text-tinta/55">Registra una corrida y mira si el modelo te deja o te sangra.</p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
        >
          {abierto ? "Cerrar" : "+ Registrar corrida"}
        </button>
      </div>

      {abierto && (
        <form onSubmit={onSubmit} className="space-y-4 border border-tinta/10 bg-papel p-5">
          {/* Modelo */}
          <div className="space-y-2">
            <div className="flex gap-2">
              {[
                { v: true, t: "Modelo nuevo" },
                { v: false, t: "Ya existe" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setModoNuevo(o.v)}
                  className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${
                    modoNuevo === o.v ? "border-rojo bg-crema text-tinta" : "border-tinta/15 text-tinta/45"
                  }`}
                >
                  {o.t}
                </button>
              ))}
            </div>

            {modoNuevo ? (
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre del modelo</label>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Short Sastre" className={inputCls} />
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
                            className="block w-full px-3 py-2 text-left text-sm text-tinta hover:bg-sand/40">
                            {m.referencia}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Cantidad total + costos + precio */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className={labelCls}>Cantidad total</label>
              <input type="number" min={1} inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Costo tela (total)</label>
              <input type="number" min={0} step="0.10" inputMode="decimal" value={tela} onChange={(e) => setTela(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Costo avíos (total)</label>
              <input type="number" min={0} step="0.10" inputMode="decimal" value={avios} onChange={(e) => setAvios(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Precio a tienda (c/u)</label>
              <input type="number" min={0} step="0.10" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Tallas y colores (opcional)</label>
            <input value={detalle} onChange={(e) => setDetalle(e.target.value)}
              placeholder="Ej. S/M/L en negro y azul" className={inputCls} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-tinta/60">
            <input type="checkbox" checked={esMuestra} onChange={(e) => setEsMuestra(e.target.checked)} className="accent-rojo" />
            Es una muestra (prueba), no producción final
          </label>

          {nCant > 0 && nTela + nAvios > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-tinta/10 bg-crema px-4 py-3">
              <span>
                <span className={labelCls}>Costo por prenda</span>
                <span className="font-display ml-2 text-lg text-tinta">{money(costoUnit)}</span>
              </span>
              {nPrecio > 0 && (
                <span>
                  <span className={labelCls}>Margen del taller</span>
                  <span className={`font-display ml-2 text-lg ${margen < 0 ? "text-rojo" : "text-tinta"}`}>{money(margen)}</span>
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${sem.dot}`} />
                <span className="label-cayla text-[10px] text-tinta/55">{sem.txt}</span>
              </span>
            </div>
          )}

          {error && <p className="text-sm text-rojo">{error}</p>}
          <button type="submit" disabled={loading || !listo}
            className="label-cayla w-full bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-30">
            {loading ? "Guardando…" : "Registrar producción"}
          </button>
        </form>
      )}

      {/* Semáforo por corrida */}
      {lotes.length === 0 ? (
        <p className="font-display border border-tinta/10 bg-papel py-8 text-center text-base italic text-tinta/40">
          Aún no registras producciones con costo.
        </p>
      ) : (
        <div className="overflow-x-auto border border-tinta/10 bg-papel">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-tinta/10 text-tinta/40">
              <tr>
                <th className="label-cayla px-3 py-2 text-[9px]">Modelo</th>
                <th className="label-cayla px-3 py-2 text-[9px]">Cant.</th>
                <th className="label-cayla px-3 py-2 text-right text-[9px]">Costo/prenda</th>
                <th className="label-cayla px-3 py-2 text-right text-[9px]">Precio tienda</th>
                <th className="label-cayla px-3 py-2 text-right text-[9px]">Margen</th>
                <th className="label-cayla px-3 py-2 text-[9px]">Semáforo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/5">
              {lotes.map((l) => {
                const s = semaforo(l.precioTaller, l.costoUnitario);
                const m = Math.round((l.precioTaller - l.costoUnitario) * 100) / 100;
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5 font-medium text-tinta">
                      {l.modelo}
                      {l.detalle && <span className="ml-2 text-[11px] font-normal text-tinta/40">{l.detalle}</span>}
                      {l.esMuestra && <span className="label-cayla ml-2 text-[8px] text-taupe">muestra</span>}
                    </td>
                    <td className="px-3 py-2.5 text-tinta/55">{l.cantidad}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tinta/70">{money(l.costoUnitario)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tinta/70">
                      {l.precioTaller > 0 ? money(l.precioTaller) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${m < 0 ? "text-rojo" : "text-tinta"}`}>
                      {l.precioTaller > 0 ? money(m) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
                        <span className="text-tinta/50">{s.txt}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
