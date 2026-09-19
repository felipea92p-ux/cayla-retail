"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CerrarFaltanteModal } from "@/components/CerrarFaltanteModal";
import { ETIQUETA_MOTIVO_NOTA, soles, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import type { NotaCreditoCompra } from "@/lib/compras-faltantes";
import { hoyLima } from "@/lib/fechas-lima";
import { parseMonto } from "@/lib/por-pagar-reglas";
import { disponibilidadNota, MARGEN_NOTA, montoDeCierres, reparteNota, tasaIgv, textoReparteNota } from "@/lib/recepciones-reglas";

// Acciones del libro de faltantes desde el DETALLE de un comprobante (D2, ADR-0106): cerrar con faltante una línea
// que ya tiene cantidades pendientes, y registrar la nota de crédito que el proveedor emite. El detalle es solo de
// líder (el layout de Compras lo exige), así que estas acciones asumen líder; la base lo vuelve a exigir.

export function BotonCerrarFaltante({ compra, linea, producto }: { compra: CompraResumen; linea: LineaCompra; producto: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla mt-1 block text-left text-[10px] text-rojo hover:underline">
        Cerrar con faltante
      </button>
      {abierto && <CerrarFaltanteModal compra={compra} linea={linea} producto={producto} onClose={() => setAbierto(false)} />}
    </>
  );
}

/** Lo que dice la base sobre una nota por faltante de este comprobante, para decidir qué ofrecer. */
export function estadoNotaFaltante(compra: CompraResumen, notas: NotaCreditoCompra[]) {
  return disponibilidadNota({
    pendiente: compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad,
    llegando: 0,
    cerrandoAhora: 0,
    cerradoAntes: compra.cerradoCantidad,
    yaTieneNotaFaltante: notas.some((n) => n.motivo === "faltante"),
  });
}

export function BotonRegistrarNota({ compra, notas, cerrados }: { compra: CompraResumen; notas: NotaCreditoCompra[]; cerrados: { faltan: number; costoUnitario: number }[] }) {
  const [abierto, setAbierto] = useState(false);
  // Un comprobante que ya acreditó todo su total no admite más notas.
  const yaAcreditado = notas.reduce((a, n) => a + n.monto, 0);
  if (compra.estado !== "vigente" || yaAcreditado >= compra.total) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla text-[11px] text-rojo hover:underline">
        Registrar nota de crédito →
      </button>
      {abierto && <RegistrarNotaModal compra={compra} notas={notas} cerrados={cerrados} yaAcreditado={yaAcreditado} onClose={() => setAbierto(false)} />}
    </>
  );
}

const MOTIVOS_NOTA = ["faltante", "devolucion", "descuento", "otro"] as const;

function RegistrarNotaModal({
  compra,
  notas,
  cerrados,
  yaAcreditado,
  onClose,
}: {
  compra: CompraResumen;
  notas: NotaCreditoCompra[];
  cerrados: { faltan: number; costoUnitario: number }[];
  yaAcreditado: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const disp = estadoNotaFaltante(compra, notas);
  const faltantePermitido = disp.estado === "disponible";
  const tasa = tasaIgv(compra);
  const sugeridoFaltante = montoDeCierres(cerrados, tasa);
  const [motivo, setMotivo] = useState<string>(faltantePermitido ? "faltante" : "devolucion");
  const [serie, setSerie] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [montoTxt, setMontoTxt] = useState<string | null>(null); // null = sigue la sugerencia (solo en faltante)
  const [loading, setLoading] = useState(false);

  const esFaltante = motivo === "faltante";
  const monto = parseMonto(montoTxt ?? (esFaltante ? sugeridoFaltante.toFixed(2) : ""));
  // El tope: en faltante, lo cerrado a su costo con IGV (+ S/ 1); en cualquier otro motivo, lo que aún queda por acreditar del total.
  const tope = esFaltante ? Math.round((sugeridoFaltante + MARGEN_NOTA) * 100) / 100 : Math.round((compra.total - yaAcreditado) * 100) / 100;
  const montoOk = !Number.isNaN(monto) && monto > 0 && monto <= tope;
  const reparte = reparteNota(montoOk ? monto : 0, compra.saldo);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (esFaltante && !faltantePermitido) return void avisar.error("La nota por faltante todavía no se puede registrar en este comprobante.");
    if (!serie.trim()) return void avisar.error("Escribe la serie y el número de la nota de crédito.", { enfocar: "nota-serie" });
    if (!montoOk) return void avisar.error(`El monto de la nota tiene que ser mayor a cero y no pasar de ${soles(tope)}.`, { enfocar: "nota-monto" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_nota_credito_compra", {
      p_compra_id: compra.id,
      p_serie_numero: serie.trim().toUpperCase(),
      p_fecha: fecha,
      p_monto: monto,
      p_motivo: motivo,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar la nota de crédito"));
      return;
    }
    avisar.exito(`Nota de crédito ${serie.trim().toUpperCase()} registrada`, {
      detalle: reparte.aFavor > 0 ? `Quedan ${soles(reparte.aFavor)} a favor con ${compra.proveedorNombre}.` : `Bajó lo que se debe de ${compra.documento} en ${soles(monto)}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Registrar nota de crédito" subtitulo={`${compra.documento} · ${compra.proveedorNombre} · se debe ${soles(compra.saldo)}`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Motivo</p>
            <div role="radiogroup" aria-label="Motivo de la nota" className="mt-2 flex flex-wrap gap-1.5">
              {MOTIVOS_NOTA.map((v) => {
                const bloqueado = v === "faltante" && !faltantePermitido;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={motivo === v}
                    disabled={bloqueado}
                    onClick={() => {
                      setMotivo(v);
                      setMontoTxt(null);
                    }}
                    className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      motivo === v ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"
                    }`}
                  >
                    {ETIQUETA_MOTIVO_NOTA[v] ?? v}
                  </button>
                );
              })}
            </div>
            {!faltantePermitido && (
              <p className="mt-2 text-xs leading-relaxed text-tinta/65">
                {disp.estado === "ya_registrada" && "«Faltante» no está disponible: este comprobante ya tiene su nota por faltante (es una sola por comprobante)."}
                {disp.estado === "sin_cierres" && "«Faltante» no está disponible: primero cierra con faltante las líneas que no llegaron."}
                {disp.estado === "bloqueada" &&
                  `«Faltante» no está disponible todavía: quedan ${disp.quedan} unidades sin recibir ni cerrar. Se habilita cuando el comprobante quede resuelto al 100 %.`}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Serie-número" id="nota-serie" mono value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="FC01-000018" autoComplete="off" autoFocus />
            <CampoFecha etiqueta="Fecha" valor={fecha} onValor={setFecha} required />
            <div className="sm:col-span-2">
              <CampoTexto
                etiqueta="Monto (con IGV)"
                id="nota-monto"
                mono
                inputMode="decimal"
                value={montoTxt ?? (esFaltante ? sugeridoFaltante.toFixed(2) : "")}
                onChange={(e) => setMontoTxt(e.target.value)}
                placeholder="0.00"
                pie={esFaltante ? `Lo cerrado a su costo + IGV ${Math.round(tasa * 100)} %. Puedes ajustarlo hasta ${soles(tope)}.` : `Hasta ${soles(tope)}, lo que aún queda por acreditar del comprobante.`}
              />
            </div>
          </div>

          {montoOk && (
            <p className="rounded-xl border border-sand bg-sand/30 px-4 py-3 text-sm leading-relaxed text-tinta">
              {textoReparteNota(reparte, { documento: compra.documento, proveedor: compra.proveedorNombre, saldo: compra.saldo, dinero: soles })}
            </p>
          )}
          <p className="text-xs text-tinta/55">También resta el IGV de la nota del crédito fiscal del mes. Queda como un registro nuevo: no se edita ni se borra.</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} disabled={loading} className="label-cayla flex-1 rounded-md border border-tinta/25 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="label-cayla flex-1 rounded-md bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Registrando…" : "Registrar nota"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
