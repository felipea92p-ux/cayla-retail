"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENTOS,
  eventoPorId,
  opcionesPrincipal,
  construirLineas,
  sumaDebe,
  sumaHaber,
  type EventoId,
} from "@/lib/registro-contable";

type Unidad = { id: string; codigo: string; nombre: string; tipo: string };
type Cuenta = { codigo: string; nombre: string; elemento: string; es_contra: boolean };

type Props = {
  unidades: Unidad[];
  cuentas: Cuenta[];
  defaultUnidadId: string;
};

function money(n: number) {
  return "S/" + n.toFixed(2);
}

const hoyLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()); // YYYY-MM-DD

export function RegistroContableForm({ unidades, cuentas, defaultUnidadId }: Props) {
  const router = useRouter();
  const nombreCuenta = useMemo(
    () => new Map(cuentas.map((c) => [c.codigo, c.nombre])),
    [cuentas]
  );

  const [eventoId, setEventoId] = useState<EventoId>("aporte_dinero");
  const [unidadId, setUnidadId] = useState(defaultUnidadId);
  const [cuentaPrincipal, setCuentaPrincipal] = useState("");
  const [medio, setMedio] = useState("");
  const [montoStr, setMontoStr] = useState("");
  const [incluyeIGV, setIncluyeIGV] = useState(true);
  const [fecha, setFecha] = useState(hoyLima());
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const ev = eventoPorId(eventoId);
  const monto = Number(montoStr) || 0;

  // Cuentas elegibles como "principal" según el evento, ya agrupadas por subtítulo:
  // cada acción solo ofrece lo que tiene sentido (comprar no ofrece "Caja", etc.).
  const gruposPrincipal = useMemo(() => opcionesPrincipal(eventoId, cuentas), [eventoId, cuentas]);

  const lineas = construirLineas({
    evento: eventoId,
    cuentaPrincipal: cuentaPrincipal || undefined,
    medio: medio || undefined,
    monto,
    incluyeIGV,
  });
  const totalDebe = sumaDebe(lineas);
  const totalHaber = sumaHaber(lineas);
  const cuadra = lineas.length >= 2 && totalDebe === totalHaber;

  function cambiarEvento(id: EventoId) {
    setEventoId(id);
    setCuentaPrincipal("");
    setMedio("");
    setError(null);
    setOk(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!cuadra) {
      setError("Faltan datos para armar el asiento.");
      return;
    }
    const glosa = detalle.trim() || ev.titulo;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_asiento", {
      p_unidad_id: unidadId,
      p_glosa: glosa,
      p_origen: ev.origen,
      p_lineas: JSON.parse(JSON.stringify(lineas)),
      p_fecha: fecha,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOk(true);
    setMontoStr("");
    setDetalle("");
    setCuentaPrincipal("");
    setMedio("");
    router.refresh();
  }

  const inputCls =
    "w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta focus:border-rojo focus:outline-none";
  const labelCls = "label-cayla text-[9px] text-tinta/45";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 1. ¿Qué pasó? */}
      <div className="space-y-2">
        <p className={labelCls}>¿Qué pasó?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENTOS.map((e) => {
            const activo = e.id === eventoId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => cambiarEvento(e.id)}
                className={`border px-3 py-2.5 text-left transition-colors ${
                  activo
                    ? "border-rojo bg-papel"
                    : "border-tinta/15 bg-crema hover:border-rojo/40"
                }`}
              >
                <span className="block text-sm font-medium text-tinta">{e.titulo}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-tinta/50">{ev.descripcion}</p>
      </div>

      {/* 2. Unidad + fecha */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Unidad de negocio</label>
          <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={inputCls}>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* 3. Cuenta principal (según evento) — solo opciones con sentido, agrupadas */}
      {ev.subgruposPrincipal.length > 0 && (
        <div className="space-y-1.5">
          <label className={labelCls}>{ev.etiquetaPrincipal}</label>
          <select
            value={cuentaPrincipal}
            onChange={(e) => setCuentaPrincipal(e.target.value)}
            className={inputCls}
          >
            <option value="">Elige…</option>
            {gruposPrincipal.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.cuentas.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* 4. Monto + IGV */}
      <div className="space-y-1.5">
        <label className={labelCls}>{ev.etiquetaMonto}</label>
        <input
          type="number"
          min={0}
          step="0.10"
          inputMode="decimal"
          value={montoStr}
          onChange={(e) => setMontoStr(e.target.value)}
          placeholder="0.00"
          className={inputCls}
        />
        {ev.usaIGV && (
          <label className="flex items-center gap-2 pt-1 text-xs text-tinta/60">
            <input
              type="checkbox"
              checked={incluyeIGV}
              onChange={(e) => setIncluyeIGV(e.target.checked)}
              className="accent-rojo"
            />
            El monto incluye IGV (tengo comprobante con factura)
          </label>
        )}
      </div>

      {/* 5. Medio / contrapartida (según evento) */}
      {ev.medios && (
        <div className="space-y-1.5">
          <label className={labelCls}>{ev.etiquetaMedio}</label>
          <select value={medio} onChange={(e) => setMedio(e.target.value)} className={inputCls}>
            <option value="">Elige…</option>
            {ev.medios.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 6. Detalle */}
      <div className="space-y-1.5">
        <label className={labelCls}>Detalle (opcional)</label>
        <input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Ej. Máquina remalladora SIRUBA, alquiler julio…"
          className={inputCls}
        />
      </div>

      {/* Vista previa del asiento */}
      {lineas.length >= 2 && (
        <div className="border border-tinta/10 bg-papel">
          <div className="flex items-center justify-between border-b border-tinta/10 px-3 py-2">
            <p className={labelCls}>Así se registra</p>
            <span className={`label-cayla text-[9px] ${cuadra ? "text-tinta/45" : "text-rojo"}`}>
              {cuadra ? "cuadra ✓" : "no cuadra"}
            </span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-tinta/40">
              <tr>
                <th className="label-cayla px-3 py-1.5 text-[9px]">Cuenta</th>
                <th className="label-cayla px-3 py-1.5 text-right text-[9px]">Debe</th>
                <th className="label-cayla px-3 py-1.5 text-right text-[9px]">Haber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/5">
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-tinta">{nombreCuenta.get(l.cuenta) ?? l.cuenta}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-tinta/70">
                    {l.debe > 0 ? money(l.debe) : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-tinta/70">
                    {l.haber > 0 ? money(l.haber) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-tinta/10 font-medium text-tinta">
              <tr>
                <td className="px-3 py-2 text-right label-cayla text-[9px] text-tinta/45">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalDebe)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalHaber)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-rojo">{error}</p>}
      {ok && <p className="text-sm text-tinta">✓ Registrado. Puedes cargar otro.</p>}

      <button
        type="submit"
        disabled={loading || !cuadra}
        className="label-cayla w-full bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
      >
        {loading ? "Guardando…" : "Registrar"}
      </button>
    </form>
  );
}
