import Link from "next/link";
import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraDinero } from "@/components/finanzas/CabeceraDinero";
import { GuiaVacia, PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { VerPorPagar } from "@/components/finanzas/PorPagarAcciones";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";
import {
  TEXTO_NATURALEZA,
  TONO_NATURALEZA,
  diasHasta,
  puedePagar,
  resumenTramos,
  textoUnidad,
  textoVence,
  totalPorPagar,
  type FilaPorPagar,
} from "@/lib/por-pagar-consolidado-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Por pagar (ADR-0195 F4; spike `vista-dinero.js`, `vistaPorPagar`): una sola lista de todo lo
// que CAYLA debe —mercadería, gastos, activos e insumos del Taller— y el calendario de vencimientos con sus totales.
// Orden del spike: cabecera con «Ver» → cuatro cifras (vencidas, esta semana, la próxima, más adelante) → la tarjeta con la
// lista → nota. Solo lee: cada fila se paga con el pago que ya existe en su libro (Compras o Producción), abierto aquí mismo
// con `?pagar=<id>`; ninguna regla de pago vive en Finanzas. Sin estado propio: se dibuja en el servidor.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function PorPagarConsolidado({
  filas,
  ver,
  unidades,
  esLider,
  pagaCompras,
  hoy,
  falla,
}: {
  filas: FilaPorPagar[];
  ver: Ver;
  unidades: UbicacionGastos[];
  esLider: boolean;
  /** ¿Esta cuenta registra pagos de Compras? (el líder, o el módulo Por pagar; `fn_puede_pagar_compras`). */
  pagaCompras: boolean;
  hoy: string;
  falla: string | null;
}) {
  const verTodas = !ver.ubicacionId && !ver.soloEmpresa;
  const nombre = ver.soloEmpresa ? "la empresa" : ver.ubicacionId ? (unidades.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda") : null;
  const tramos = resumenTramos(filas, hoy);
  const total = totalPorPagar(filas);
  const cuenta = { esLider, pagaCompras };
  const hayPagables = filas.some((f) => puedePagar(f, cuenta));
  const hrefPagar = (id: string) => `/finanzas/dinero/por-pagar?${new URLSearchParams({ ...(esLider ? { ver: ver.clave } : {}), pagar: id })}`;
  const plural = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;

  return (
    <div className="space-y-6">
      <CabeceraDinero pestana="porpagar" esLider={esLider} conteos={{ porpagar: filas.length }} acciones={<VerPorPagar ver={ver} unidades={unidades} esLider={esLider} />} />

      {falla ? (
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>
      ) : (
        <>
          <section className="fin-cifras">
            {tramos.map((t, i) => (
              <TarjetaCifra
                key={t.clave}
                compacta
                etiqueta={t.etiqueta}
                tono={t.clave === "vencidas" && t.monto > 0 ? "text-rojo" : undefined}
                valor={solesRedondo(t.monto)}
                {...entra(i + 1)}
              >
                {plural(t.n)}
              </TarjetaCifra>
            ))}
          </section>

          {filas.length === 0 ? (
            <div {...entra(5)}>
              <GuiaVacia sobre="Todo pagado" titulo={nombre ? `${mayuscula(nombre)} no debe nada` : "CAYLA no debe nada"}>
                Ninguna factura de mercadería, gasto, activo ni insumo del Taller tiene saldo. Lo pagado y lo anulado no aparecen aquí.
              </GuiaVacia>
            </div>
          ) : (
            <Superficie className="anim-sube">
              <TituloDeTarjeta
                titulo={verTodas ? "Todo lo que CAYLA debe" : `Lo que debe ${nombre}`}
                bajada={
                  ver.ubicacionId
                    ? "Mercadería, gastos, activos e insumos del Taller. De una factura repartida entre tiendas, solo su parte."
                    : "Mercadería, gastos, activos e insumos del Taller en una sola lista."
                }
              >
                {pagaCompras && (
                  <Link href="/compras/por-pagar" className="btn-cayla btn-secundario btn-chico">
                    Pagar varias de un proveedor
                  </Link>
                )}
              </TituloDeTarjeta>
              <div className="fin-tabla-wrap">
                <table className="fin-tabla">
                  <thead>
                    <tr>
                      <th>Vence</th>
                      <th className="min-w-[190px]">Proveedor · factura</th>
                      <th>Tipo</th>
                      {verTodas && <th className="min-w-[110px]">Unidad</th>}
                      <th className="fin-num">Total</th>
                      <th className="fin-num">Pagado</th>
                      <th className="fin-num">Saldo</th>
                      {hayPagables && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => {
                      const vencida = diasHasta(f.vence, hoy) < 0;
                      return (
                        <tr key={`${f.origen}-${f.id}`}>
                          <td data-l="Vence" className="whitespace-nowrap">
                            {fechaCorta(f.vence)}
                            <span className={`fin-sub ${vencida ? "text-rojo-profundo" : ""}`}>{textoVence(f, hoy)}</span>
                          </td>
                          <td className="fin-ancha" data-l="Proveedor">
                            <b>{f.proveedor}</b>
                            <span className="fin-sub">{f.concepto ? `${f.documento} · ${f.concepto}` : f.documento}</span>
                          </td>
                          <td data-l="Tipo">
                            <Chip versalitas={false} tono={TONO_NATURALEZA[f.naturaleza]}>
                              {TEXTO_NATURALEZA[f.naturaleza]}
                            </Chip>
                          </td>
                          {verTodas && <td data-l="Unidad">{textoUnidad(f)}</td>}
                          <td className="fin-num" data-l="Total">
                            {soles(f.total)}
                          </td>
                          <td className="fin-num" data-l="Pagado">
                            {soles(f.pagado)}
                          </td>
                          <td className="fin-num" data-l="Saldo">
                            <b>{soles(f.saldo)}</b>
                          </td>
                          {hayPagables && (
                            <td className="fin-num">
                              {puedePagar(f, cuenta) && (
                                <Link href={hrefPagar(f.id)} scroll={false} className="btn-cayla btn-secundario btn-chico" aria-label={`Pagar ${f.proveedor} ${f.documento}`}>
                                  Pagar
                                </Link>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PieTabla>
                <span>
                  {plural(total.n)} · {solesRedondo(total.saldo)} por pagar{verTodas ? "" : ` de ${nombre}`}
                </span>
                <span>Lo pagado y lo anulado no aparecen.</span>
              </PieTabla>
            </Superficie>
          )}

          <p className="nota-cayla anim-entra" style={{ ["--i" as string]: 6 } as CSSProperties}>
            La planilla no está en esta lista porque la paga Dynamic.{" "}
            {esLider || pagaCompras
              ? "«Pagar» abre el mismo pago de Compras (o de Producción, para la tela del Taller): el pago queda en su factura."
              : "Los pagos los registra quien tiene Por pagar en Compras; aquí se ve cuándo vence cada uno."}
          </p>
        </>
      )}
    </div>
  );
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
