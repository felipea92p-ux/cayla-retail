"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENTOS,
  eventoPorId,
  opcionesPrincipal,
  construirLineas,
  sumaDebe,
  sumaHaber,
  COMPROBANTES,
  type EventoId,
  type Comprobante,
} from "@/lib/registro-contable";

type Unidad = { id: string; codigo: string; nombre: string; tipo: string };
type Cuenta = { codigo: string; nombre: string; elemento: string; es_contra: boolean };

type Props = {
  unidades: Unidad[];
  cuentas: Cuenta[];
  defaultUnidadId: string;
};

function money(n: number) {
  return "S/" + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const hoyLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// Íconos de línea (estética CAYLA: trazo, sin relleno), uno por tipo de hecho.
const ICONO: Record<EventoId, ReactNode> = {
  aporte_dinero: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 9.4v5.2M18 9.4v5.2" />
    </>
  ),
  aporte_especie: (
    <>
      <path d="M12 3 3.5 7v9L12 21l8.5-4.5V7L12 3Z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5V21" />
    </>
  ),
  gasto: (
    <>
      <path d="M6 3h12v17l-2 1-2-1-2 1-2-1-2 1-2-1V3Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  compra: (
    <>
      <path d="M5 7h14l-1.2 13.5H6.2L5 7Z" />
      <path d="M8.5 7V5.5a3.5 3.5 0 0 1 7 0V7" />
    </>
  ),
  ingreso: (
    <>
      <path d="M12 3v10M8.5 9.5 12 13l3.5-3.5" />
      <path d="M4.5 14v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14" />
    </>
  ),
};

function Icono({ id }: { id: EventoId }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONO[id]}
    </svg>
  );
}

export function RegistroContableForm({ unidades, cuentas, defaultUnidadId }: Props) {
  const router = useRouter();
  const nombreCuenta = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c.nombre])), [cuentas]);
  const elementoDe = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c.elemento])), [cuentas]);

  const [eventoId, setEventoId] = useState<EventoId>("aporte_dinero");
  const [unidadId, setUnidadId] = useState(defaultUnidadId);
  const [cuentaPrincipal, setCuentaPrincipal] = useState("");
  const [medio, setMedio] = useState("");
  const [montoStr, setMontoStr] = useState("");
  const [comprobante, setComprobante] = useState<Comprobante>("boleta");
  const [fecha, setFecha] = useState(hoyLima());
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const ev = eventoPorId(eventoId);
  const monto = Number(montoStr) || 0;

  const gruposPrincipal = useMemo(() => opcionesPrincipal(eventoId, cuentas), [eventoId, cuentas]);

  const lineas = construirLineas({
    evento: eventoId,
    cuentaPrincipal: cuentaPrincipal || undefined,
    medio: medio || undefined,
    monto,
    comprobante,
  });
  const totalDebe = sumaDebe(lineas);
  const totalHaber = sumaHaber(lineas);
  const cuadra = lineas.length >= 2 && totalDebe === totalHaber;

  // "Qué cambia": traduce cada línea debe/haber a sube (↑) / baja (↓) en palabras.
  const efectos = lineas.map((l) => {
    const elem = elementoDe.get(l.cuenta) ?? "activo";
    const deudora = elem === "activo" || elem === "gasto";
    const sube = (l.debe > 0 && deudora) || (l.haber > 0 && !deudora);
    const monto = l.debe > 0 ? l.debe : l.haber;
    const costoso = elem === "gasto" || elem === "pasivo"; // gasto o deuda: peso visual menor
    // El IGV en una compra con factura es un crédito a tu favor: se lee mejor así.
    if (l.cuenta === "4011") {
      return { nombre: "IGV a favor (crédito)", sube: true, monto, costoso: false };
    }
    return { nombre: nombreCuenta.get(l.cuenta) ?? l.cuenta, sube, monto, costoso };
  });

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
      setError("Faltan datos para armar el registro.");
      return;
    }
    const glosa =
      (detalle.trim() || ev.titulo) + (ev.usaComprobante ? ` · ${comprobante}` : "");
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
    "w-full border border-tinta/20 bg-crema px-3 py-2.5 text-sm text-tinta transition-colors focus:border-rojo focus:outline-none";
  const labelCls = "label-cayla text-[9px] text-tinta/45";

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      {/* 1. ¿Qué pasó? — tarjetas con ícono */}
      <div className="space-y-2.5">
        <p className={labelCls}>¿Qué pasó?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENTOS.map((e) => {
            const activo = e.id === eventoId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => cambiarEvento(e.id)}
                className={`flex items-center gap-3 border px-3.5 py-3 text-left transition-colors ${
                  activo ? "border-rojo bg-papel" : "border-tinta/15 bg-crema hover:border-rojo/40"
                }`}
              >
                <span className={activo ? "text-rojo" : "text-tinta/35"}>
                  <Icono id={e.id} />
                </span>
                <span className="text-sm font-medium leading-tight text-tinta">{e.titulo}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-tinta/50">{ev.descripcion}</p>
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

      {/* 3. Cuenta principal — solo opciones con sentido, agrupadas */}
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

      {/* 4. Monto */}
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
          className={`${inputCls} font-display text-lg`}
        />
      </div>

      {/* 4b. Comprobante — define el IGV (crédito solo con factura) */}
      {ev.usaComprobante && (
        <div className="space-y-1.5">
          <label className={labelCls}>¿Qué comprobante te dieron?</label>
          <div className="grid grid-cols-3 gap-2">
            {COMPROBANTES.map((c) => {
              const activo = c.id === comprobante;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setComprobante(c.id)}
                  className={`border px-2.5 py-2 text-left transition-colors ${
                    activo ? "border-rojo bg-papel" : "border-tinta/15 bg-crema hover:border-rojo/40"
                  }`}
                >
                  <span className="block text-xs font-medium text-tinta">{c.etiqueta}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-tinta/45">{c.nota}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Medio / contrapartida */}
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
          placeholder="Ej. Remalladora SIRUBA, alquiler julio…"
          className={inputCls}
        />
      </div>

      {/* Vista previa: "Qué cambia" en palabras + el asiento técnico escondido */}
      {efectos.length >= 2 && (
        <div className="border border-tinta/10 bg-papel">
          <div className="flex items-center justify-between border-b border-tinta/10 px-4 py-2.5">
            <p className={labelCls}>Qué cambia</p>
            <span className={`label-cayla text-[9px] ${cuadra ? "text-tinta/40" : "text-rojo"}`}>
              {cuadra ? "cuadra ✓" : "revisa"}
            </span>
          </div>
          <ul className="divide-y divide-tinta/5">
            {efectos.map((e, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-3">
                  <span
                    className={`font-display text-xl leading-none ${e.costoso ? "text-tinta/40" : "text-rojo"}`}
                  >
                    {e.sube ? "↑" : "↓"}
                  </span>
                  <span className="text-sm text-tinta">{e.nombre}</span>
                </span>
                <span className="font-display tabular-nums text-sm text-tinta">{money(e.monto)}</span>
              </li>
            ))}
          </ul>
          <details className="group border-t border-tinta/10">
            <summary className="label-cayla flex cursor-pointer select-none items-center justify-between px-4 py-2.5 text-[9px] text-tinta/40 transition-colors hover:text-rojo">
              Ver el asiento contable (debe / haber)
              <span className="transition-transform group-open:rotate-90">›</span>
            </summary>
            <table className="w-full text-left text-xs">
              <thead className="text-tinta/35">
                <tr>
                  <th className="label-cayla px-4 py-1.5 text-[8px] font-normal">Cuenta</th>
                  <th className="label-cayla px-4 py-1.5 text-right text-[8px] font-normal">Debe</th>
                  <th className="label-cayla px-4 py-1.5 text-right text-[8px] font-normal">Haber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-tinta/70">{nombreCuenta.get(l.cuenta) ?? l.cuenta}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-tinta/60">
                      {l.debe > 0 ? money(l.debe) : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-tinta/60">
                      {l.haber > 0 ? money(l.haber) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-tinta/10 text-tinta">
                <tr>
                  <td className="label-cayla px-4 py-2 text-right text-[8px] text-tinta/40">Total</td>
                  <td className="px-4 py-2 text-right font-display tabular-nums">{money(totalDebe)}</td>
                  <td className="px-4 py-2 text-right font-display tabular-nums">{money(totalHaber)}</td>
                </tr>
              </tfoot>
            </table>
          </details>
        </div>
      )}

      {error && <p className="text-sm text-rojo">{error}</p>}
      {ok && (
        <p className="border border-tinta/10 bg-papel px-4 py-3 font-display text-base italic text-tinta">
          ✓ Registrado. Puedes cargar otro.
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !cuadra}
        className="label-cayla w-full bg-tinta px-4 py-3.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:cursor-not-allowed disabled:opacity-30"
      >
        {loading ? "Guardando…" : "Registrar"}
      </button>
    </form>
  );
}
