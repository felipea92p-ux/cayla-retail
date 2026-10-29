import type { CSSProperties } from "react";
import { Handshake } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { AbrirPagoDesdeUrl } from "@/components/finanzas/dinero/AbrirPagoDesdeUrl";
import { BotonPagarClaure } from "@/components/finanzas/dinero/BotonPagarClaure";
import { Herramientas, PieTabla, Superficie } from "@/components/finanzas/kit";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import {
  NOTA_CLAURE,
  NOTA_GASTOS_CLAURE,
  NOTA_PAGOS_CLAURE,
  cambiosPorRevisar,
  filasContadas,
  fraseClaure,
  montoSugeridoPago,
  resumenClaure,
  seLeDebeDeFila,
  solesConSigno,
  textoMedioClaure,
  textoOrigenClaure,
  type FilaClaure,
  type GastoClaure,
  type PagoClaure,
} from "@/lib/cuenta-claure-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1). Solo mira: lo que CLAURE cobró en cuentas de CAYLA, día por día, y de
// ahí lo que se le debe (la cifra grande vive en la cabecera, `RespuestaTelar`) menos lo que ya se le pagó. Sirve en el servidor; solo el botón
// «Pagar a CLAURE» (el líder) es de cliente. El aviso del cierre de caja viene en la actividad 3.
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function CuentaClaure({ filas, pagos, gastos, desde, esLider }: { filas: FilaClaure[]; pagos: PagoClaure[]; gastos: GastoClaure[]; desde: string | null; esLider: boolean }) {
  const contadas = filasContadas(filas);
  const cambios = cambiosPorRevisar(filas);
  const r = resumenClaure(filas, pagos, gastos);
  const nCobros = contadas.filter((f) => f.origen === "venta").reduce((a, f) => a + f.nPagos, 0);

  return (
    <div className="space-y-6">
      {esLider && <AbrirPagoDesdeUrl montoSugerido={montoSugeridoPago(r.saldo)} />}
      <p className="din-debes-frase anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
        {fraseClaure(desde)}
      </p>

      {contadas.length === 0 && cambios.length === 0 && pagos.length === 0 && gastos.length === 0 ? (
        <div {...entra(1)}>
          <Superficie>
            <Vacio icono={<Handshake />} titulo="Todavía no hay cobros de CLAURE en cuentas de CAYLA">
              Cuando una venta de una prenda de CLAURE se cobre con tarjeta, QR, Yape o transferencia, aparecerá aquí con lo que se le debe a Claudia.
            </Vacio>
          </Superficie>
        </div>
      ) : (
        <>
          <section className={`fin-cifras ${gastos.length > 0 ? "fin-seis" : "fin-cinco"}`} data-guia="fin-claure.cifras">
            <TarjetaCifra etiqueta="Cobrado en tus cuentas" valor={soles(r.cobrado)} {...entra(1)}>
              {plural(nCobros, "pago", "pagos")} de prendas de CLAURE
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Devuelto" valor={soles(r.devuelto)} {...entra(2)}>
              reembolsado desde una cuenta de CAYLA
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Comisión del POS" valor={soles(r.comision)} {...entra(3)}>
              estimada con la tarifa; la asume CLAURE
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Ya pagado" valor={soles(r.pagado)} {...entra(4)}>
              {plural(pagos.length, "pago", "pagos")} a CLAURE
            </TarjetaCifra>
            {gastos.length > 0 && (
              <TarjetaCifra etiqueta="Gastos suyos" valor={soles(r.gastos)} {...entra(5)}>
                {plural(gastos.length, "gasto", "gastos")} que pagó CAYLA
              </TarjetaCifra>
            )}
            <TarjetaCifra etiqueta="IGV (lo paga CAYLA)" valor={soles(r.igv)} {...entra(5)}>
              de lo cobrado menos lo devuelto; se descuenta
            </TarjetaCifra>
          </section>

          {cambios.length > 0 && (
            <div {...entra(6)}>
              <Aviso tono="atencion" titulo={`${plural(cambios.length, "cambio", "cambios")} con prendas de CLAURE por revisar`}>
                No entran al saldo todavía: un cambio mueve plata sin mover cuentas y falta decidir cómo contarlo.{" "}
                {cambios.map((c) => `${fechaCorta(c.fecha)} · ${solesConSigno(c.monto)}${c.cuentaNombre ? ` · ${c.cuentaNombre}` : ""}`).join("; ")}.
              </Aviso>
            </div>
          )}

          {contadas.length > 0 && (
            <div {...entra(7)}>
              <Superficie className="anim-sube" guia="fin-claure.tabla">
                <Herramientas>
                  <b className="text-sm font-semibold text-tinta">Lo que entró a cuentas de CAYLA</b>
                </Herramientas>
                <div className="fin-tabla-wrap">
                  <table className="fin-tabla">{/* unificar-fijo: la tabla del kit de Finanzas (fin-tabla, ADR-0195 y El telar), como las demás caras de Cuentas y dinero; Felipe no la unió en la ronda 7 */}
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th>Qué</th>
                        <th>Cuenta</th>
                        <th className="fin-num">Cobrado</th>
                        <th className="fin-num">IGV</th>
                        <th className="fin-num">Comisión</th>
                        <th className="fin-num">Se le debe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contadas.map((f) => (
                        <tr key={`${f.fecha}-${f.origen}-${f.medio}-${f.cuentaId ?? "sin"}-${f.ubicacionId ?? "sin"}`}>
                          <td data-l="Día">{fechaCorta(f.fecha)}</td>
                          <td className="fin-ancha" data-l="Qué">
                            <b>{textoOrigenClaure(f.origen)}</b>
                            <span className="fin-sub">
                              {textoMedioClaure(f.medio)} · {plural(f.nPagos, f.origen === "devolucion" ? "devolución" : "pago", f.origen === "devolucion" ? "devoluciones" : "pagos")}
                            </span>
                          </td>
                          <td data-l="Cuenta">{f.cuentaNombre ?? "Sin cuenta asignada"}</td>
                          <td className="fin-num" data-l="Cobrado">
                            {solesConSigno(f.monto)}
                          </td>
                          <td className="fin-num" data-l="IGV">
                            {f.igv === null ? "—" : solesConSigno(f.igv)}
                          </td>
                          <td className="fin-num" data-l="Comisión">
                            {f.comision === null ? "Sin tarifa" : f.comision === 0 ? "—" : soles(f.comision)}
                          </td>
                          <td className="fin-num" data-l="Se le debe">
                            <b>{solesConSigno(seLeDebeDeFila(f))}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PieTabla>{NOTA_CLAURE}</PieTabla>
              </Superficie>
            </div>
          )}

          {gastos.length > 0 && (
            <div {...entra(8)}>
              <Superficie className="anim-sube" guia="fin-claure.gastos">
                <Herramientas>
                  <b className="text-sm font-semibold text-tinta">Gastos de CLAURE que pagó CAYLA</b>
                </Herramientas>
                <div className="fin-tabla-wrap">
                  <table className="fin-tabla">{/* unificar-fijo: la tabla del kit de Finanzas (fin-tabla, ADR-0195 y El telar), como las demás caras de Cuentas y dinero; Felipe no la unió en la ronda 7 */}
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th>Gasto</th>
                        <th className="fin-num">Pagó CAYLA</th>
                        <th className="fin-num">De CLAURE</th>
                        <th className="fin-num">Se resta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastos.map((g) => (
                        <tr key={g.gastoId}>
                          <td data-l="Día">{fechaCorta(g.fecha)}</td>
                          <td className="fin-ancha" data-l="Gasto">
                            <b>{g.descripcion || g.categoriaNombre}</b>
                            <span className="fin-sub">{g.categoriaNombre}</span>
                          </td>
                          <td className="fin-num" data-l="Pagó CAYLA">
                            {soles(g.montoTotal)}
                          </td>
                          <td className="fin-num" data-l="De CLAURE">
                            {Math.round(g.pct)} %
                          </td>
                          <td className="fin-num" data-l="Se resta">
                            <b>{soles(g.parte)}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PieTabla>{NOTA_GASTOS_CLAURE}</PieTabla>
              </Superficie>
            </div>
          )}

          <div {...entra(9)}>
            <Superficie className="anim-sube" guia="fin-claure.pagos">
              <Herramientas>
                <b className="text-sm font-semibold text-tinta">Lo que ya se le pagó</b>
                {esLider && (
                  <span className="ml-auto">
                    <BotonPagarClaure montoSugerido={montoSugeridoPago(r.saldo)} />
                  </span>
                )}
              </Herramientas>
              {pagos.length === 0 ? (
                <Vacio tamano="chico" icono={<Handshake />} titulo="Todavía no se le pagó nada">
                  {esLider ? "Cuando le pases la plata a Claudia, regístralo aquí: sale de un banco de CAYLA y baja lo que se le debe." : "El pago a Claudia lo registra el líder."}
                </Vacio>
              ) : (
                <div className="fin-tabla-wrap">
                  <table className="fin-tabla">{/* unificar-fijo: la tabla del kit de Finanzas (fin-tabla, ADR-0195 y El telar), como las demás caras de Cuentas y dinero; Felipe no la unió en la ronda 7 */}
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th>Desde</th>
                        <th>N.º de operación</th>
                        <th>Lo registró</th>
                        <th className="fin-num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagos.map((p) => (
                        <tr key={p.id}>
                          <td data-l="Día">{fechaCorta(p.fecha)}</td>
                          <td data-l="Desde">{p.cuentaNombre ?? "—"}</td>
                          <td data-l="N.º de operación">{p.referencia ?? "—"}</td>
                          <td data-l="Lo registró">{p.registradoPor ?? "—"}</td>
                          <td className="fin-num" data-l="Monto">
                            <b>{soles(p.monto)}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PieTabla>{NOTA_PAGOS_CLAURE}</PieTabla>
            </Superficie>
          </div>
        </>
      )}
    </div>
  );
}
