import type { ReactNode } from "react";
import { ShoppingBag } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { EstadoDeCuenta } from "./EstadoDeCuenta";
import { dieronDeRonda, gastoDeRonda, pctUsado, quedaDeRonda, type LineaDeCuenta, type RondaDeCompras } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import type { Tramo } from "@/lib/rendimiento-vista-reglas";

// Lo que se DIBUJA del detalle de una persona en Compradores (ADR-0704, act. 2026-11-26 d, «como tu banco»): a la izquierda, su resumen —lo que
// le queda, con la barra de cuánto gastó— y «Te toca», solo si hay algo que hacer; a la derecha, su estado de cuenta por fechas. Debajo, la
// herramienta de revisión de siempre, con lo suyo. Bajo 1280 px todo va en una columna. No lee nada: lo arma la página
// (`app/(app)/compras/compradores/[personaId]/page.tsx`).

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function DetalleComprador({
  nombre,
  ronda,
  lineas,
  tramo,
  hoy,
  pendiente,
  acciones,
  bandeja,
  cerrarRonda,
  tieneSinRonda,
}: {
  /** `null`: el id no es de nadie que compre o tenga un fondo. */
  nombre: string | null;
  /** Su ronda abierta; `null` si no tiene. */
  ronda: RondaDeCompras | null;
  /** Su estado de cuenta en el período (`lineasDeCuenta`). */
  lineas: LineaDeCuenta[];
  tramo: Tramo;
  hoy: string;
  /** Lo que espera de Compras, en TODAS sus rondas (no solo en el período). */
  pendiente: { porRevisar: number; faltaPagar: number };
  acciones?: ReactNode;
  /** Lo que espera revisión de esta persona (la bandeja de Revisar compras, filtrada); `null` si no hay nada. */
  bandeja?: ReactNode;
  /** La acción «Cerrar su ronda», solo si la ronda se puede cerrar desde Compras. */
  cerrarRonda?: ReactNode;
  /** Lo que tiene en la mano quien todavía no abrió su ronda (`fn_compradores_sin_ronda`); sin dato, no tiene plata. */
  tieneSinRonda?: number;
}) {
  const queda = ronda ? quedaDeRonda(ronda) : (tieneSinRonda ?? 0);
  const dieron = ronda ? dieronDeRonda(ronda) : (tieneSinRonda ?? 0);
  const gasto = ronda ? gastoDeRonda(ronda.cuenta) : 0;
  const deMas = queda < -0.005;
  const teToca = pendiente.porRevisar > 0 || pendiente.faltaPagar > 0.005 || Boolean(cerrarRonda);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Compradores"
        titulo={nombre ?? "Persona no encontrada"}
        detalle={!nombre ? undefined : ronda ? `Comprando desde el ${diaMes(ronda.abiertaEn)}` : tieneSinRonda !== undefined ? "Aún no abre su ronda" : "Sin ronda abierta"}
        subtitulo="Lo que le diste y lo que compró, día por día."
        volver={<Volver href="/compras/compradores" a="Compradores" />}
        acciones={acciones}
      />

      {!nombre ? (
        <div className="card-cayla">
          <Vacio icono={<ShoppingBag />} titulo="No encontramos a esta persona">
            Vuelve a Compradores y elígela de la lista.
          </Vacio>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-6">
              <div className="card-cayla space-y-5 p-6" data-guia="comprador.cuenta">
                <div>
                  <span className={`block text-xs font-semibold uppercase tracking-[0.1em] ${deMas ? "text-ambar" : "text-secundario"}`}>{deMas ? "Pagó de más" : "Le queda"}</span>
                  <span className={`font-display mt-1 block text-[2.75rem] leading-none tabular-nums ${deMas ? "text-ambar" : "text-tinta"}`}>{soles(Math.abs(queda))}</span>
                </div>
                {dieron > 0.005 && <BarraAvance pct={pctUsado(dieron, gasto) ?? 0} alto="gruesa" tono="tinta" etiqueta={`Gastó ${soles(gasto)} de ${soles(dieron)}`} />}
                {ronda && (
                  <dl className="space-y-2 border-t border-sand pt-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-secundario">Le diste</dt>
                      <dd className="tabular-nums text-tinta">{soles(dieron)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-secundario">Gastó</dt>
                      <dd className="tabular-nums text-tinta">{soles(gasto)}</dd>
                    </div>
                    {ronda.cuenta.gastaste > 0.005 && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-tenue">De eso, otros gastos</dt>
                        <dd className="tabular-nums text-secundario">{soles(ronda.cuenta.gastaste)}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>

              {teToca && (
                <div className="vd-placa space-y-3 rounded-tarjeta p-5" data-guia="comprador.te-toca">
                  <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-secundario">Te toca</span>
                  {pendiente.porRevisar > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm text-tinta">
                      <span>Revisar {plural(pendiente.porRevisar, "compra", "compras")}</span>
                      {bandeja && (
                        <a href="#por-revisar" className="btn-cayla btn-secundario btn-chico">
                          Revisar
                        </a>
                      )}
                    </div>
                  )}
                  {pendiente.faltaPagar > 0.005 && (
                    <div className="flex items-center justify-between gap-3 text-sm text-tinta">
                      <span>Pagar lo que falta</span>
                      <span className="font-semibold tabular-nums">{soles(pendiente.faltaPagar)}</span>
                    </div>
                  )}
                  {cerrarRonda && (
                    <div className="flex items-center justify-between gap-3 text-sm text-tinta">
                      <span>Su ronda está vacía</span>
                      {cerrarRonda}
                    </div>
                  )}
                </div>
              )}
            </aside>

            <EstadoDeCuenta lineas={lineas} tramo={tramo} hoy={hoy} />
          </div>

          {bandeja && (
            <section id="por-revisar" className="scroll-mt-24 space-y-3" data-guia="comprador.por-revisar">
              <TituloSeccion cuenta={pendiente.porRevisar > 0 ? pendiente.porRevisar : undefined}>Por revisar</TituloSeccion>
              {bandeja}
            </section>
          )}
        </>
      )}
    </div>
  );
}
