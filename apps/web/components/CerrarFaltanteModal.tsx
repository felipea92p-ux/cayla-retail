"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_ESTADO_RECEPCION, soles, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { efectoCierre, igvDeMonto, montoNotaSugerido, tasaIgv } from "@/lib/recepciones-reglas";
import { parseMonto } from "@/lib/por-pagar-reglas";
import type { MotivoCierre } from "@/lib/compras-faltantes";

// Cerrar una línea con faltante (D2, ADR-0104). Antes, una factura con 3 prendas que nunca
// llegaron quedaba «parcial» para siempre: contaba como atrasada, inflaba «por recibir» y la
// deuda con el proveedor seguía completa. Ahora la línea se CIERRA (un registro nuevo en el
// libro de cierres — no se edita ni se borra nada) y, si el proveedor emite nota de crédito, se
// registra con el mismo gesto para que la deuda y el crédito fiscal del mes queden al día.
//
// La nota de crédito es plata: solo el líder puede registrarla (`cerrar_linea_compra` lo vuelve
// a exigir en la base). Un integrante puede cerrar la línea sin nota.

const MOTIVOS: { valor: MotivoCierre; texto: string }[] = [
  { valor: "no_llego", texto: "No llegaron" },
  { valor: "danada", texto: "Llegaron dañadas" },
  { valor: "error_proveedor", texto: "Error del proveedor" },
];

// Botones del pie sin `flex-1` (los de `Modal` se estiran).
const BTN_FANTASMA = "label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-50";
const BTN_PRIMARIO = "label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";

export function CerrarFaltanteModal({
  compra,
  linea,
  producto,
  llegandoAhora = 0,
  llegandoEnGuia = 0,
  esLider,
  igvMes,
  porRecibirAtrasadas,
  onClose,
}: {
  compra: CompraResumen;
  linea: LineaCompra;
  /** «Blusa Emma · S / Negro»: cómo se nombra la línea en pantalla. */
  producto: string;
  /** Unidades de ESTA línea que se están contando en la guía en curso (aún sin registrar). */
  llegandoAhora?: number;
  /** Unidades de TODO el comprobante contadas en la guía en curso (para el efecto en la recepción). */
  llegandoEnGuia?: number;
  esLider: boolean;
  igvMes: number | null;
  porRecibirAtrasadas: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const tasa = tasaIgv(compra);
  const faltanIniciales = Math.max(1, linea.pendiente - llegandoAhora);
  const [cantidad, setCantidad] = useState(String(faltanIniciales));
  const [motivo, setMotivo] = useState<MotivoCierre>("no_llego");
  const [conNota, setConNota] = useState(false);
  const [serie, setSerie] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [montoTxt, setMontoTxt] = useState<string | null>(null); // null = sigue la sugerencia
  const [loading, setLoading] = useState(false);

  const n = Math.floor(Number(cantidad));
  const cantidadOk = Number.isFinite(n) && n >= 1 && n <= linea.pendiente;
  const sugerido = montoNotaSugerido(cantidadOk ? n : 0, linea.costoUnitario, tasa);
  const monto = parseMonto(montoTxt ?? sugerido.toFixed(2));
  const montoOk = !Number.isNaN(monto) && monto > 0 && monto <= compra.saldo + 0.005;
  const notaActiva = esLider && conNota;

  // Con lo pendiente del comprobante, ¿este cierre (más lo que llega en la guía) lo deja todo cubierto?
  const pendienteComprobante = compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad;
  const cubreTodo = cantidadOk && pendienteComprobante - llegandoEnGuia - n <= 0;
  const efectos = efectoCierre({
    documento: compra.documento,
    saldo: compra.saldo,
    montoNota: notaActiva && montoOk ? monto : 0,
    igvNota: notaActiva && montoOk ? igvDeMonto(monto, tasa) : 0,
    igvMes,
    recepcionAntes: ETIQUETA_ESTADO_RECEPCION[compra.estadoRecepcion],
    cubreTodo,
    estabaAtrasada: compra.recepcionAtrasada,
    atrasadasAntes: porRecibirAtrasadas,
    formato: soles,
  });

  async function cerrar(conNotaEnvio: boolean) {
    if (!cantidadOk) return void avisar.error(`La cantidad tiene que ser un entero entre 1 y ${linea.pendiente}.`, { enfocar: "cierre-cantidad" });
    if (conNotaEnvio) {
      if (!serie.trim()) return void avisar.error("Escribe la serie y el número de la nota de crédito.", { enfocar: "cierre-serie" });
      if (!montoOk) return void avisar.error(`El monto de la nota tiene que ser mayor a cero y no pasar de lo que se debe (${soles(compra.saldo)}).`, { enfocar: "cierre-monto" });
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("cerrar_linea_compra", {
      p_compra_item_id: linea.id,
      p_cantidad: n,
      p_motivo: motivo,
      ...(conNotaEnvio ? { p_nota_credito: { serie_numero: serie.trim().toUpperCase(), fecha, monto } } : {}),
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la línea"));
      return;
    }
    avisar.exito(`Línea cerrada: ${n} ${n === 1 ? "unidad" : "unidades"} de ${producto}`, {
      detalle: conNotaEnvio ? `Nota de crédito ${serie.trim().toUpperCase()} por ${soles(monto)} registrada.` : "La nota de crédito del proveedor se puede registrar después, desde el comprobante.",
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo={
        <>
          <span className="label-cayla mb-0.5 block text-[11px] font-normal text-tinta/65">Cerrar línea con faltante</span>
          <span className="block text-[28px] leading-tight">{producto}</span>
        </>
      }
      subtitulo={`Comprobante ${compra.documento} · ${compra.proveedorNombre}`}
      ancho="max-w-2xl"
      onClose={onClose}
    >
      {() => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cerrar(notaActiva);
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-3 gap-3">
            <Cifra etiqueta="Facturadas" valor={linea.cantidad} />
            <Cifra etiqueta="Llegaron" valor={linea.recibido + llegandoAhora} />
            <Cifra etiqueta="Faltan" valor={cantidadOk ? n : "—"} ambar />
          </div>

          <div>
            <label htmlFor="cierre-cantidad" className="label-cayla text-[11px] text-tinta/65">
              ¿Cuántas unidades se cierran?
            </label>
            <input
              id="cierre-cantidad"
              type="number"
              min={1}
              max={linea.pendiente}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="ml-3 w-20 border-b border-tinta/25 bg-transparent px-1 py-1 text-center text-sm tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
            />
            <span className="ml-2 text-xs text-tinta/55">de {linea.pendiente} pendientes</span>
          </div>

          <div>
            <p className="label-cayla mb-2 text-[11px] text-tinta/65">¿Qué pasó con las {cantidadOk ? n : "que faltan"}?</p>
            <div role="radiogroup" aria-label="Qué pasó con las unidades que faltan" className="inline-flex h-9 overflow-hidden rounded-lg border border-tinta/15">
              {MOTIVOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  role="radio"
                  aria-checked={motivo === m.valor}
                  onClick={() => setMotivo(m.valor)}
                  className={`label-cayla px-3.5 text-[11px] transition-colors ${motivo === m.valor ? "bg-tinta text-crema" : "text-tinta/65 hover:text-rojo"}`}
                >
                  {m.texto}
                </button>
              ))}
            </div>
          </div>

          {esLider && (
            <div className="rounded-xl border border-sand bg-sand/30 p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={conNota}
                  aria-label="El proveedor emite una nota de crédito por esto"
                  onClick={() => setConNota((v) => !v)}
                  className={`relative h-[23px] w-10 shrink-0 rounded-full transition-colors ${conNota ? "bg-tinta" : "bg-tinta/25"}`}
                >
                  <span aria-hidden className={`absolute left-[3px] top-[3px] h-[17px] w-[17px] rounded-full bg-crema transition-transform ${conNota ? "translate-x-[17px]" : ""}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-tinta">El proveedor emite una nota de crédito por esto</p>
                  <p className="text-xs text-tinta/65">Baja lo que se debe y el crédito fiscal del mes. Si aún no la tienes, puedes registrarla después.</p>
                </div>
              </div>
              {conNota && (
                <div className="mt-4 grid gap-5 sm:grid-cols-[1.2fr_1fr_1fr]">
                  <CampoTexto etiqueta="Serie-número" id="cierre-serie" mono value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} placeholder="FC01-000018" autoComplete="off" />
                  <CampoFecha etiqueta="Fecha" valor={fecha} onValor={setFecha} required />
                  <CampoTexto
                    etiqueta="Monto"
                    id="cierre-monto"
                    mono
                    inputMode="decimal"
                    value={montoTxt ?? sugerido.toFixed(2)}
                    onChange={(e) => setMontoTxt(e.target.value)}
                    pie={`${cantidadOk ? n : 0} × ${soles(linea.costoUnitario)} + IGV ${Math.round(tasa * 100)} %. Puedes ajustarlo.`}
                  />
                </div>
              )}
            </div>
          )}

          {efectos.length > 0 && (
            <div>
              <p className="label-cayla mb-1 text-[11px] text-tinta/65">Cómo quedan tus cuentas</p>
              <div className="divide-y divide-tinta/10 border-t border-tinta/10">
                {efectos.map((f) => (
                  <div key={f.etiqueta} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 py-2">
                    <span className="text-sm text-tinta">{f.etiqueta}</span>
                    <span className="text-sm tabular-nums text-tinta/55">{f.antes}</span>
                    <ChevronRight aria-hidden className="h-3.5 w-3.5 self-center text-tinta/40" />
                    <span className="text-sm font-semibold tabular-nums text-tinta">{f.despues}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed text-tinta/55">No se borra nada: el cierre y la nota quedan como registros nuevos en el historial del comprobante.</p>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-tinta/10 pt-4">
            {notaActiva && (
              <button type="button" onClick={() => void cerrar(false)} className={BTN_FANTASMA} disabled={loading}>
                Solo cerrar, la nota la registro después
              </button>
            )}
            <button type="submit" className={BTN_PRIMARIO} disabled={loading}>
              {loading ? "Cerrando…" : notaActiva ? "Cerrar y registrar nota de crédito" : "Cerrar línea con faltante"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Cifra({ etiqueta, valor, ambar = false }: { etiqueta: string; valor: number | string; ambar?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${ambar ? "border-ambar/40 bg-ambar/[0.06]" : "border-sand bg-papel"}`}>
      <p className={`label-cayla text-[10px] ${ambar ? "text-ambar-profundo" : "text-tinta/55"}`}>{etiqueta}</p>
      <p className={`font-display mt-1 text-[28px] leading-none tabular-nums ${ambar ? "text-ambar-profundo" : "text-tinta"}`}>{valor}</p>
    </div>
  );
}
