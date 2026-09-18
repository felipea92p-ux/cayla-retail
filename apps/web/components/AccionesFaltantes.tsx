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
import { hoyLima } from "@/lib/fechas-lima";
import { parseMonto } from "@/lib/por-pagar-reglas";

// Acciones del libro de faltantes desde el DETALLE de un comprobante (D2, ADR-0104):
// cerrar con faltante una línea que ya tiene cantidades pendientes, y registrar DESPUÉS la nota
// de crédito que el proveedor tarda en emitir. El detalle es solo de líder (el layout de Compras
// lo exige), así que estas acciones asumen líder; la base lo vuelve a exigir.

export function BotonCerrarFaltante({ compra, linea, producto }: { compra: CompraResumen; linea: LineaCompra; producto: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla mt-1 block text-left text-[10px] text-rojo hover:underline">
        Cerrar con faltante
      </button>
      {abierto && (
        <CerrarFaltanteModal compra={compra} linea={linea} producto={producto} esLider igvMes={null} porRecibirAtrasadas={null} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}

export function BotonRegistrarNota({ compra }: { compra: CompraResumen }) {
  const [abierto, setAbierto] = useState(false);
  if (compra.estado !== "vigente" || compra.saldo <= 0) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla text-[11px] text-rojo hover:underline">
        Registrar nota de crédito →
      </button>
      {abierto && <RegistrarNotaModal compra={compra} onClose={() => setAbierto(false)} />}
    </>
  );
}

function RegistrarNotaModal({ compra, onClose }: { compra: CompraResumen; onClose: () => void }) {
  const router = useRouter();
  const [serie, setSerie] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [montoTxt, setMontoTxt] = useState("");
  const [motivo, setMotivo] = useState("faltante");
  const [loading, setLoading] = useState(false);
  const monto = parseMonto(montoTxt);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serie.trim()) return void avisar.error("Escribe la serie y el número de la nota de crédito.", { enfocar: "nota-serie" });
    if (Number.isNaN(monto) || monto <= 0) return void avisar.error("El monto de la nota tiene que ser mayor a cero.", { enfocar: "nota-monto" });
    if (monto > compra.saldo + 0.005) return void avisar.error(`La nota no puede pasar de lo que se debe (${soles(compra.saldo)}).`, { enfocar: "nota-monto" });
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
    avisar.exito(`Nota de crédito ${serie.trim().toUpperCase()} registrada`, { detalle: `Bajó lo que se debe de ${compra.documento} en ${soles(monto)}.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Registrar nota de crédito" subtitulo={`${compra.documento} · ${compra.proveedorNombre} · se debe ${soles(compra.saldo)}`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Serie-número" id="nota-serie" mono value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="FC01-000018" autoComplete="off" autoFocus />
            <CampoFecha etiqueta="Fecha" valor={fecha} onValor={setFecha} required />
            <CampoTexto etiqueta="Monto (con IGV)" id="nota-monto" mono inputMode="decimal" value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} placeholder="0.00" />
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">Motivo</p>
              <div role="radiogroup" aria-label="Motivo de la nota" className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(ETIQUETA_MOTIVO_NOTA).map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={motivo === v}
                    onClick={() => setMotivo(v)}
                    className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors ${
                      motivo === v ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-tinta/55">Baja lo que se debe y el crédito fiscal del mes. Queda como un registro nuevo: no se edita ni se borra.</p>
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
