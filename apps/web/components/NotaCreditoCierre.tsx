"use client";

import { ChevronRight } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_ESTADO_RECEPCION, soles, type CompraResumen } from "@/lib/compras-reglas";
import {
  disponibilidadNota,
  efectoCierre,
  igvDeMonto,
  notaDelBloque,
  reparteNota,
  tasaIgv,
  textoReparteNota,
  type NotaBorrador,
} from "@/lib/recepciones-reglas";

// La nota de crédito, al FINAL de la guía (ADR-0106, corrección 2026-09-18). Lo que faltó ya se decidió
// fila por fila; acá solo queda el documento del proveedor, y se ofrece únicamente cuando se puede:
//   · una sola nota por faltante por comprobante, que cubre todo lo que no llegó;
//   · solo con el comprobante resuelto al 100 % (todo recibido o cerrado), porque el monto depende de
//     cuánto faltó en total y un cierre posterior obligaría a una segunda nota;
//   · lo que la nota no baje de la deuda (factura ya pagada, al contado) queda como SALDO A FAVOR del
//     proveedor, y se explica en palabras antes de confirmar.
// Los mismos candados los vuelve a exigir la base (`fn_insertar_nota_credito_compra`).

export const NOTA_VACIA = (hoy: string): NotaBorrador => ({ activa: false, serie: "", fecha: hoy, montoTxt: null });

export type BloqueNota = {
  compra: CompraResumen;
  /** Lo que se cierra en ESTA guía (líneas con motivo elegido). */
  cierresAhora: { faltan: number; costoUnitario: number }[];
  /** Lo que ya estaba cerrado antes de esta guía, por línea (cerrado × costo). */
  cerradoAntes: { faltan: number; costoUnitario: number }[];
  /** Pendiente total del comprobante (Σ de sus líneas con algo pendiente). */
  pendiente: number;
  /** Unidades de este comprobante que se están contando en la guía. */
  llegando: number;
  yaTieneNotaFaltante: boolean;
  /** Saldo a favor que ya tiene el proveedor (antes de esta nota). */
  saldoFavorAntes: number;
};

export function NotaCreditoCierre({
  bloques,
  notas,
  onNota,
  hoy,
  esLider,
  igvMes,
  porRecibirAtrasadas,
}: {
  bloques: BloqueNota[];
  notas: Record<string, NotaBorrador | undefined>;
  onNota: (compraId: string, cambio: Partial<NotaBorrador>) => void;
  hoy: string;
  esLider: boolean;
  igvMes: number | null;
  porRecibirAtrasadas: number | null;
}) {
  // El crédito fiscal, el saldo a favor y las entregas atrasadas se encadenan entre comprobantes del mismo
  // proveedor: el «antes» del segundo es el «después» del primero. Se arma en un recorrido aparte.
  let igvAcumulado = 0;
  let atrasadasAcumuladas = 0;
  const favorAcumulado: Record<string, number> = {};
  const vistas = [];
  for (const b of bloques) {
    const disp = disponibilidadNota({
      pendiente: b.pendiente,
      llegando: b.llegando,
      cerrandoAhora: b.cierresAhora.reduce((a, c) => a + c.faltan, 0),
      cerradoAntes: b.cerradoAntes.reduce((a, c) => a + c.faltan, 0),
      yaTieneNotaFaltante: b.yaTieneNotaFaltante,
    });
    if (disp.estado === "sin_cierres") continue;
    // «Todavía no se puede» solo tiene sentido cuando en esta guía se está cerrando algo: si solo se recibe
    // mercadería de un comprobante que ya tenía cierres viejos, la nota no es el tema.
    if (disp.estado === "bloqueada" && b.cierresAhora.length === 0) continue;
    const tasa = tasaIgv(b.compra);
    const borrador = notas[b.compra.id] ?? NOTA_VACIA(hoy);
    const todosLosCierres = [...b.cerradoAntes, ...b.cierresAhora];
    const nota = notaDelBloque({ tasa, cierres: todosLosCierres, esLider, borrador });
    const lista = disp.estado === "disponible" && nota.activa && nota.problema === null;
    const reparte = reparteNota(lista ? nota.monto : nota.sugerido, b.compra.saldo);
    const igvDeEstaNota = lista ? igvDeMonto(nota.monto, tasa) : 0;
    const efectos = lista
      ? efectoCierre({
          documento: b.compra.documento,
          saldo: b.compra.saldo,
          montoNota: reparte.baja,
          aFavor: reparte.aFavor,
          saldoFavorAntes: b.saldoFavorAntes + (favorAcumulado[b.compra.proveedorId] ?? 0),
          proveedor: b.compra.proveedorNombre,
          igvNota: igvDeEstaNota,
          igvMes: igvMes == null ? null : Math.round((igvMes - igvAcumulado) * 100) / 100,
          recepcionAntes: ETIQUETA_ESTADO_RECEPCION[b.compra.estadoRecepcion],
          cubreTodo: true,
          estabaAtrasada: b.compra.recepcionAtrasada,
          atrasadasAntes: porRecibirAtrasadas == null ? null : porRecibirAtrasadas - atrasadasAcumuladas,
          formato: soles,
        })
      : [];
    if (lista) {
      igvAcumulado += igvDeEstaNota;
      favorAcumulado[b.compra.proveedorId] = (favorAcumulado[b.compra.proveedorId] ?? 0) + reparte.aFavor;
      if (b.compra.recepcionAtrasada) atrasadasAcumuladas += 1;
    }
    vistas.push({ b, disp, tasa, borrador, nota, reparte, efectos });
  }
  if (vistas.length === 0) return null;

  return (
    <>
      {vistas.map(({ b, disp, tasa, borrador, nota, reparte, efectos }) => (
        <section key={b.compra.id} aria-label={`Nota de crédito de ${b.compra.documento}`} className="card-cayla divide-y divide-tinta/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <p className="font-display text-xl text-tinta">Nota de crédito · {b.compra.documento}</p>
            {disp.estado === "disponible" && <span className="label-cayla text-[11px] text-verde-profundo">El comprobante queda resuelto al 100 %</span>}
          </div>

          {disp.estado === "ya_registrada" && (
            <p className="px-5 py-4 text-sm text-tinta/70">{b.compra.documento} ya tiene su nota de crédito por faltante: es una sola por comprobante. Lo que se cierre ahora queda cubierto por esa nota.</p>
          )}

          {disp.estado === "bloqueada" && (
            <div className="space-y-1 px-5 py-4">
              <p className="text-sm font-semibold text-tinta">Todavía no se puede registrar</p>
              <p className="text-sm leading-relaxed text-tinta/70">
                La nota por faltante es una sola por comprobante y cubre todo lo que no llegó, así que se registra cuando el comprobante queda resuelto al 100 %. Después de esta guía quedan{" "}
                <b className="font-semibold">{disp.quedan} {disp.quedan === 1 ? "unidad" : "unidades"}</b> sin recibir ni cerrar en {b.compra.documento}. Cuando las recibas o las cierres, podrás registrarla aquí o desde el comprobante.
              </p>
            </div>
          )}

          {disp.estado === "disponible" && !esLider && <p className="px-5 py-4 text-sm text-tinta/70">La nota de crédito la registra un líder, desde el comprobante.</p>}

          {disp.estado === "disponible" && esLider && (
            <>
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={borrador.activa}
                    aria-label={`El proveedor emitió la nota de crédito de ${b.compra.documento}`}
                    onClick={() => onNota(b.compra.id, { activa: !borrador.activa })}
                    className={`relative h-[23px] w-10 shrink-0 rounded-full transition-colors ${borrador.activa ? "bg-tinta" : "bg-tinta/25"}`}
                  >
                    <span aria-hidden className={`absolute left-[3px] top-[3px] h-[17px] w-[17px] rounded-full bg-crema transition-transform ${borrador.activa ? "translate-x-[17px]" : ""}`} />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-tinta">Ya tengo la nota de crédito del proveedor</p>
                    <p className="text-xs text-tinta/65">Una sola para todo lo que no llegó. Si aún no la tienes, déjalo apagado y regístrala después desde el comprobante.</p>
                  </div>
                </div>

                {borrador.activa && (
                  <div className="mt-4 grid gap-5 sm:grid-cols-[1.2fr_1fr_1fr]">
                    <CampoTexto
                      etiqueta="Serie-número"
                      id={`nota-serie-${b.compra.id}`}
                      mono
                      value={borrador.serie}
                      onChange={(e) => onNota(b.compra.id, { serie: e.target.value.toUpperCase() })}
                      placeholder="FC01-000018"
                      autoComplete="off"
                    />
                    <CampoFecha etiqueta="Fecha" valor={borrador.fecha} onValor={(v) => onNota(b.compra.id, { fecha: v })} required />
                    <CampoTexto
                      etiqueta="Monto (con IGV)"
                      id={`nota-monto-${b.compra.id}`}
                      mono
                      inputMode="decimal"
                      value={borrador.montoTxt ?? nota.sugerido.toFixed(2)}
                      onChange={(e) => onNota(b.compra.id, { montoTxt: e.target.value })}
                      pie={`Lo cerrado a su costo + IGV ${Math.round(tasa * 100)} %. Puedes ajustarlo hasta ${soles(nota.tope)}.`}
                    />
                  </div>
                )}
              </div>

              {borrador.activa && nota.problema === null && (
                <div className="space-y-3 px-5 py-4">
                  <p className="rounded-xl border border-sand bg-sand/30 px-4 py-3 text-sm leading-relaxed text-tinta">
                    {textoReparteNota(reparte, { documento: b.compra.documento, proveedor: b.compra.proveedorNombre, saldo: b.compra.saldo, dinero: soles })}
                  </p>
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
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </>
  );
}
