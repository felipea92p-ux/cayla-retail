"use client";

import { useState } from "react";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { PagarComprobanteProduccionModal } from "@/components/PagarComprobanteProduccionModal";
import { diasHasta, etiquetaTipo, type ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";
import { nombreDeMes, resumenDeuda, tramosPorPagar, type DeudaFila, type IgvMes } from "@/lib/por-pagar-produccion-reglas";

// Por pagar de Producción (ADR-0133, F4c) y el consolidado de D-I. Arriba, lo que Producción le debe a sus proveedores, por urgencia. Abajo,
// «Deuda total de CAYLA»: lo mismo de Compras y de Producción juntos, y el IGV del mes de los dos libros. Es una LECTURA que suma dos libros;
// nada se digita. Solo líder. El rojo lo lleva solo la cifra «Vencido» (máximo 2 por pantalla); lo vencido en filas va en ámbar.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function PorPagarProduccionPanel({ comprobantes, deuda, igv, hoy }: { comprobantes: ComprobanteProduccion[]; deuda: DeudaFila[]; igv: IgvMes | null; hoy: string }) {
  const [pagando, setPagando] = useState<ComprobanteProduccion | null>(null);
  const tramos = tramosPorPagar(comprobantes, hoy);
  const totalPorPagar = tramos.reduce((s, t) => s + t.monto, 0);
  const vencido = tramos.find((t) => t.clave === "vencido");
  const semana = tramos.find((t) => t.clave === "semana");
  const consolidado = resumenDeuda(deuda);
  const n = (t: (typeof tramos)[number] | undefined) => t?.comprobantes.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="anim-entra">
        <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Por pagar</h1>
        <p className="mt-1 max-w-xl text-sm text-tinta/65">Lo que el Taller le debe a sus proveedores, del más urgente al menos. El saldo se calcula de los pagos: nunca se digita.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra
          compacta
          punto={totalPorPagar > 0 ? "ambar" : "verde"}
          etiqueta="Por pagar"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          vacia={totalPorPagar === 0}
          valor={totalPorPagar === 0 ? "—" : <CifraQueCuenta valor={totalPorPagar} formato="soles" alMontar />}
        >
          {totalPorPagar > 0 ? plural(tramos.reduce((s, t) => s + t.comprobantes.length, 0), "comprobante", "comprobantes") : "no se debe nada"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={vencido ? "rojo" : "verde"}
          etiqueta="Vencido"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          vacia={!vencido}
          valor={!vencido ? "—" : <CifraQueCuenta valor={vencido.monto} formato="soles" alMontar />}
          detalleTono={vencido ? "text-rojo-profundo" : "text-verde-profundo"}
        >
          {vencido ? plural(n(vencido), "comprobante ya venció", "comprobantes ya vencieron") : "nada vencido"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={semana ? "ambar" : "verde"}
          etiqueta="Vence en 7 días"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          vacia={!semana}
          valor={!semana ? "—" : <CifraQueCuenta valor={semana.monto} formato="soles" alMontar />}
        >
          {semana ? plural(n(semana), "comprobante", "comprobantes") : "nada esta semana"}
        </TarjetaCifra>
      </div>

      {tramos.length === 0 ? (
        <div className="card-cayla space-y-1.5 p-5 text-sm text-tinta/75">
          <p>El Taller no debe nada ahora. Cuando registres un comprobante a crédito, aparecerá aquí con su vencimiento.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {tramos.map((t) => (
            <section key={t.clave} className="space-y-2" aria-label={t.etiqueta}>
              <h2 className="font-display flex flex-wrap items-baseline gap-x-3 text-lg text-tinta">
                {t.etiqueta}
                <small className="font-sans text-xs tabular-nums text-tinta/65">
                  {soles(t.monto)} · {plural(t.comprobantes.length, "comprobante", "comprobantes")}
                </small>
              </h2>
              <ul className="card-cayla overflow-hidden">
                {t.comprobantes.map((c) => {
                  const d = c.fechaVencimiento ? diasHasta(c.fechaVencimiento, hoy) : null;
                  return (
                    <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-tinta/10 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_9rem_7rem_auto]">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] text-tinta">{c.proveedor}</span>
                        <span className="block text-xs text-tinta/65">
                          {etiquetaTipo(c.tipo, true)} {c.serie}-{c.numero}
                          {c.pagado > 0 ? ` · pagado ${soles(c.pagado)} de ${soles(c.total)}` : ""}
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        {c.fechaVencimiento && d !== null && (
                          <Chip tono={t.clave === "vencido" || t.clave === "semana" ? "ambar" : "neutro"}>
                            {d < 0 ? `Venció ${diaMes(c.fechaVencimiento)} · ${Math.abs(d)} d` : d === 0 ? "Vence hoy" : `Vence ${diaMes(c.fechaVencimiento)} · ${d} d`}
                          </Chip>
                        )}
                      </span>
                      <span className="text-right text-[14px] font-semibold tabular-nums text-tinta">{soles(c.saldo)}</span>
                      <Boton peso="fantasma" onClick={() => setPagando(c)} className="col-span-2 sm:col-span-1">
                        Pagar
                      </Boton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section aria-label="Deuda total de CAYLA" className="card-cayla anim-entra space-y-4 p-5" style={{ ["--i" as string]: 3 }}>
        <div>
          <h2 className="font-display text-xl text-tinta">Deuda total de CAYLA</h2>
          <p className="text-xs text-tinta/65">Compras y Producción juntos, en un solo lugar. Solo se lee: cada deuda se paga en su propio módulo.</p>
        </div>

        {consolidado.total === 0 ? (
          <p className="text-sm text-tinta/70">CAYLA no debe nada a ningún proveedor.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="font-display text-3xl tabular-nums text-tinta">
                <CifraQueCuenta valor={consolidado.total} formato="soles" alMontar />
              </p>
              <p className="text-sm text-tinta/65">
                {consolidado.vencido > 0 ? `${soles(consolidado.vencido)} ya vencidos` : "nada vencido"}
              </p>
            </div>
            <div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-sand" role="img" aria-label={`Producción ${Math.round((consolidado.parteProduccion ?? 0) * 100)} % de la deuda, Compras el resto`}>
                <span className="bg-tinta" style={{ width: `${(consolidado.parteProduccion ?? 0) * 100}%` }} />
                <span className="bg-tinta/30" style={{ width: `${(1 - (consolidado.parteProduccion ?? 0)) * 100}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta/70">
                <span>
                  <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-tinta align-middle" />
                  Producción {soles(consolidado.porOrigen.produccion.saldo)} · {plural(consolidado.porOrigen.produccion.proveedores, "proveedor", "proveedores")}
                </span>
                <span>
                  <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-tinta/30 align-middle" />
                  Compras {soles(consolidado.porOrigen.compras.saldo)} · {plural(consolidado.porOrigen.compras.proveedores, "proveedor", "proveedores")}
                </span>
              </p>
            </div>
            <ul>
              {deuda.slice(0, 8).map((f) => (
                <li key={`${f.origen}-${f.proveedorId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-tinta/10 py-2 text-[13px] last:border-b-0">
                  <span className="min-w-0">
                    <span className="truncate text-tinta">{f.proveedor}</span>
                    <span className="ml-2 align-middle">
                      <Chip tono="neutro">{f.origen === "produccion" ? "Producción" : "Compras"}</Chip>
                    </span>
                    <small className="block text-xs text-tinta/65">
                      {plural(f.comprobantes, "comprobante", "comprobantes")}
                      {f.proximoVencimiento ? ` · vence ${diaMes(f.proximoVencimiento)}` : ""}
                      {f.vencido > 0 ? ` · ${soles(f.vencido)} vencidos` : ""}
                    </small>
                  </span>
                  <span className="text-right tabular-nums text-tinta">{soles(f.saldo)}</span>
                </li>
              ))}
            </ul>
            {deuda.length > 8 && <p className="text-xs text-tinta/65">y {deuda.length - 8} proveedores más con saldos menores.</p>}
          </>
        )}

        {igv && (
          <div className="border-t border-tinta/10 pt-4">
            <h3 className="label-cayla text-[11px] text-tinta/65">IGV crédito fiscal · {nombreDeMes(igv.mes)}</h3>
            <dl className="mt-2 divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-crema text-[13px]">
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt>Comprobantes de Compras</dt>
                <dd className="tabular-nums">{soles(igv.igvCompras)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt>Comprobantes de Producción</dt>
                <dd className="tabular-nums">{soles(igv.igvProduccion)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-2">
                <dt>Notas de crédito de Compras</dt>
                <dd className="tabular-nums">− {soles(igv.igvNotasCredito)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <dt className="font-semibold">IGV a favor del mes</dt>
                <dd className="font-display text-lg tabular-nums">{soles(igv.igvNeto)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-tinta/65">Según la fecha de emisión de los comprobantes vigentes. Es una lectura de apoyo, no el registro de compras de SUNAT.</p>
          </div>
        )}
      </section>

      {pagando && <PagarComprobanteProduccionModal comprobante={pagando} hoy={hoy} onClose={() => setPagando(null)} />}
    </div>
  );
}
