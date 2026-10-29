import type { CSSProperties } from "react";
import { Handshake } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { Herramientas, PieTabla, Superficie } from "@/components/finanzas/kit";
import { fechaCorta, soles } from "@/lib/compras-reglas";
import {
  NOTA_CLAURE,
  cambiosPorRevisar,
  filasContadas,
  fraseClaure,
  resumenClaure,
  seLeDebeDeFila,
  solesConSigno,
  textoMedioClaure,
  textoOrigenClaure,
  type FilaClaure,
} from "@/lib/cuenta-claure-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1). Solo mira: lo que CLAURE cobró en cuentas de CAYLA, día por día, y de
// ahí lo que se le debe (la cifra grande vive en la cabecera, `RespuestaTelar`). Sin estado: sirve en el servidor. El pago a Claudia y el
// aviso del cierre de caja vienen en las actividades 2 y 3.
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function CuentaClaure({ filas, desde }: { filas: FilaClaure[]; desde: string | null }) {
  const contadas = filasContadas(filas);
  const cambios = cambiosPorRevisar(filas);
  const r = resumenClaure(filas);
  const nCobros = contadas.filter((f) => f.origen === "venta").reduce((a, f) => a + f.nPagos, 0);

  return (
    <div className="space-y-6">
      <p className="din-debes-frase anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
        {fraseClaure(desde)}
      </p>

      {contadas.length === 0 && cambios.length === 0 ? (
        <div {...entra(1)}>
          <Superficie>
            <Vacio icono={<Handshake />} titulo="Todavía no hay cobros de CLAURE en cuentas de CAYLA">
              Cuando una venta de una prenda de CLAURE se cobre con tarjeta, QR, Yape o transferencia, aparecerá aquí con lo que se le debe a Claudia.
            </Vacio>
          </Superficie>
        </div>
      ) : (
        <>
          <section className="fin-cifras" data-guia="fin-claure.cifras">
            <TarjetaCifra etiqueta="Cobrado en tus cuentas" valor={soles(r.cobrado)} {...entra(1)}>
              {plural(nCobros, "pago", "pagos")} de prendas de CLAURE
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Devuelto" valor={soles(r.devuelto)} {...entra(2)}>
              reembolsado desde una cuenta de CAYLA
            </TarjetaCifra>
            <TarjetaCifra etiqueta="Comisión del POS" valor={soles(r.comision)} {...entra(3)}>
              estimada con la tarifa; la asume CLAURE
            </TarjetaCifra>
            <TarjetaCifra etiqueta="IGV incluido" valor={soles(r.igv)} {...entra(4)}>
              de lo cobrado menos lo devuelto
            </TarjetaCifra>
          </section>

          {cambios.length > 0 && (
            <div {...entra(5)}>
              <Aviso tono="atencion" titulo={`${plural(cambios.length, "cambio", "cambios")} con prendas de CLAURE por revisar`}>
                No entran al saldo todavía: un cambio mueve plata sin mover cuentas y falta decidir cómo contarlo.{" "}
                {cambios.map((c) => `${fechaCorta(c.fecha)} · ${solesConSigno(c.monto)}${c.cuentaNombre ? ` · ${c.cuentaNombre}` : ""}`).join("; ")}.
              </Aviso>
            </div>
          )}

          {contadas.length > 0 && (
            <div {...entra(6)}>
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
        </>
      )}
    </div>
  );
}
