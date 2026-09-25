"use client";

import { Plus, X } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@/lib/comprobantes-produccion-reglas";
import { medioNuevo, montoSugerido, repartoDeMedios, type MedioForm } from "@/lib/medios-pago-reglas";
import { soles } from "@/lib/compras-reglas";
import { OpcionesCuenta } from "@/components/finanzas/CampoCuenta";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara, type CuentaElegible } from "@/lib/cuenta-sellada-reglas";

// Pagar con uno o varios medios (ADR-0133, F4b/F4c): una transferencia + un efectivo son UN pago. Se usa al registrar un comprobante al
// contado y al pagar un saldo desde Por pagar. Muestra cuánto FALTA o SOBRA mientras se escribe; la base vuelve a exigirlo.

export function MediosDePago({
  medios,
  onCambio,
  esperado,
  exacto,
  etiquetaEsperado = "Total a pagar",
  cuentas,
}: {
  medios: MedioForm[];
  onCambio: (m: MedioForm[]) => void;
  esperado: number;
  /** Al contado hay que pagar justo lo que se debe; un pago parcial solo no puede pasarse. */
  exacto: boolean;
  etiquetaEsperado?: string;
  /** ADR-0195 F3b: con las cuentas, cada medio dice «Sale de» (propuesta según el medio). */
  cuentas?: { lista: readonly CuentaElegible[]; listo: boolean };
}) {
  const r = repartoDeMedios(medios, esperado, exacto);
  const cambiar = (i: number, c: Partial<MedioForm>) => onCambio(medios.map((m, j) => (j === i ? { ...m, ...c } : m)));

  return (
    <fieldset className="space-y-2.5">
      <legend className="label-cayla text-[11px] text-tinta/65">Medios de pago</legend>
      <ul className="space-y-2">
        {medios.map((m, i) => (
          <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 max-sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
            <select
              aria-label={`Medio ${i + 1}`}
              value={m.metodo}
              onChange={(e) => cambiar(i, { metodo: e.target.value as MetodoPago })}
              className="h-9 rounded-md border border-tinta/25 bg-papel px-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              {METODOS_PAGO.map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.etiqueta}
                </option>
              ))}
            </select>
            <input
              aria-label={`Monto del medio ${i + 1}`}
              inputMode="decimal"
              placeholder="S/ monto"
              value={m.monto}
              onChange={(e) => cambiar(i, { monto: e.target.value })}
              className="h-9 rounded-md border border-tinta/25 bg-papel px-2 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo"
            />
            <input
              aria-label={`Referencia del medio ${i + 1}`}
              placeholder="N.° de operación"
              value={m.referencia}
              onChange={(e) => cambiar(i, { referencia: e.target.value })}
              className="h-9 rounded-md border border-tinta/25 bg-papel px-2 font-mono text-sm text-tinta outline-none focus:border-rojo max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-2"
            />
            <button
              type="button"
              aria-label={`Quitar el medio ${i + 1}`}
              disabled={medios.length === 1}
              onClick={() => onCambio(medios.filter((_, j) => j !== i))}
              className="grid h-9 w-9 place-items-center rounded-md text-tinta/55 outline-none hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:opacity-30 disabled:hover:text-tinta/55"
            >
              <X size={16} aria-hidden />
            </button>
            {cuentas && <SaleDeCompacto cuentas={cuentas} medio={m} i={i} onCuenta={(v) => cambiar(i, { cuentaId: v })} />}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onCambio([...medios, medioNuevo("efectivo", montoSugerido(medios, esperado))])}
          className="inline-flex items-center gap-1.5 text-[13px] text-tinta/75 underline-offset-2 outline-none hover:text-rojo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
        >
          <Plus size={14} aria-hidden /> Agregar otro medio
        </button>
        <p className="text-[13px] tabular-nums" role="status">
          <span className="text-tinta/65">{etiquetaEsperado} </span>
          <b className="font-semibold text-tinta">{soles(esperado)}</b>
          {r.suma > 0 && (
            <span className={r.cuadra ? "ml-2 text-verde-profundo" : "ml-2 text-ambar-profundo"}>
              {r.sobra > 0 ? `· sobran ${soles(r.sobra)}` : r.falta > 0 && exacto ? `· faltan ${soles(r.falta)}` : r.falta > 0 ? `· quedarían ${soles(r.falta)} por pagar` : "· cuadra"}
            </span>
          )}
        </p>
      </div>
      {r.error && <p className="text-xs text-ambar-profundo">{r.error}</p>}
    </fieldset>
  );
}

/** «Sale de» en una línea, bajo cada medio (F3b): la cuenta propuesta según el medio; del cajón, resta del cierre. */
function SaleDeCompacto({ cuentas, medio: m, i, onCuenta }: { cuentas: { lista: readonly CuentaElegible[]; listo: boolean }; medio: MedioForm; i: number; onCuenta: (v: string) => void }) {
  const hay = cuentas.listo && hayCuentasPara(cuentas.lista, "pago", m.metodo);
  const valor = hay ? (cuentaEfectiva(cuentas.lista, "pago", m.metodo, m.cuentaId) ?? "") : "";
  return (
    <label className="col-span-full grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 text-[12.5px] max-sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <span className="text-tinta/65">Sale de</span>
      <span className="grid gap-0.5">
        <select
          aria-label={`De qué cuenta sale el medio ${i + 1}`}
          value={valor}
          disabled={!hay}
          onChange={(e) => onCuenta(e.target.value)}
          className="h-9 rounded-md border border-tinta/25 bg-papel px-2 text-sm text-tinta outline-none focus:border-rojo disabled:text-tinta/55"
        >
          {hay ? <OpcionesCuenta cuentas={cuentas.lista} clase="pago" medio={m.metodo} /> : <option value="">{cuentas.listo ? "Sin cuentas: se agregan en Configuración" : "…"}</option>}
        </select>
        <span className="text-[11.5px] text-tinta/60">{hay ? ayudaCuenta(cuentas.lista.find((c) => c.id === valor) ?? null, "sale") : "Queda «sin cuenta»; el pago se registra igual."}</span>
      </span>
    </label>
  );
}
