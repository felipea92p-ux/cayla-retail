import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import {
  avisoDeRonda,
  dieronDeRonda,
  estadoDeCompra,
  faltaPagarDeCompra,
  gastoDeRonda,
  llegadaDeCompra,
  nombreDelPapel,
  pctUsado,
  porRevisarDeRonda,
  quedaDeRonda,
  type CompraDelLibro,
  type RondaDeCompras,
} from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";

// Lo que se DIBUJA del detalle de una persona en Compradores (ADR-0704, act. 2026-11-26 c): arriba, cuatro cifras que dicen de dónde sale cada
// número (le diste, gastó, le queda y lo que espera revisión o pago); debajo, dos columnas: a la izquierda lo que se hace aquí —la bandeja de
// revisión, solo con lo suyo, y todas sus compras con su papel, envío y estado—; a la derecha su plata, entrega por entrega, y sus otras
// rondas. Bajo 1280 px la columna de la derecha baja. No lee nada: lo arma la página (`app/(app)/compras/compradores/[personaId]/page.tsx`).

// Día · Proveedor (papel, prendas, medio) · Envío · Estado · Monto.
const PLANTILLA = "sm:grid-cols-[4.5rem_minmax(0,1fr)_10.5rem_10.5rem_7rem]";
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function DetalleComprador({
  nombre,
  ronda,
  otras,
  hoy,
  acciones,
  bandeja,
  cerrarRonda,
  plata,
  entregas,
  personaId,
  tieneSinRonda,
}: {
  /** `null`: el id no es de nadie que compre o tenga un fondo. */
  nombre: string | null;
  personaId: string;
  /** La ronda que se mira; `null` si la persona no tiene ninguna en los últimos 60 días. */
  ronda: RondaDeCompras | null;
  /** Sus otras rondas (abierta o de los últimos 60 días), para pasar de una a otra. */
  otras: readonly RondaDeCompras[];
  hoy: string;
  acciones?: ReactNode;
  /** Lo que espera revisión de esta persona (la bandeja de Revisar compras, filtrada); `null` si no hay nada. */
  bandeja?: ReactNode;
  /** La acción «Cerrar su ronda», solo si la ronda se puede cerrar desde Compras. */
  cerrarRonda?: ReactNode;
  /** Las entregas, devoluciones y pagos de deuda de esta persona, con su «Anular» (antes, la hoja «Entregas y devoluciones»). */
  plata?: ReactNode;
  /** El resumen de sus entregas vigentes (`entregasDe`): dice de dónde sale «Le diste». */
  entregas?: { cuantas: number; total: number; ultima: string | null };
  /** Lo que tiene en la mano quien todavía no abrió su ronda (`fn_compradores_sin_ronda`); sin dato, no tiene plata. */
  tieneSinRonda?: number;
}) {
  const aviso = ronda ? avisoDeRonda(ronda, hoy, soles) : null;
  const queda = ronda ? quedaDeRonda(ronda) : (tieneSinRonda ?? 0);
  const dieron = ronda ? dieronDeRonda(ronda) : (tieneSinRonda ?? 0);
  const gasto = ronda ? gastoDeRonda(ronda.cuenta) : 0;
  const usado = pctUsado(dieron, gasto);
  const noCuadra = queda < -0.005;
  const porRevisar = ronda ? porRevisarDeRonda(ronda) : 0;
  const faltaPagar = ronda ? ronda.compras.reduce((a, c) => a + faltaPagarDeCompra(c), 0) : 0;
  const sinCompras = !ronda || ronda.compras.length === 0;
  const detalle = ronda
    ? ronda.cerradaEn
      ? `Ronda ${ronda.texto ?? ""} del ${diaMes(ronda.abiertaEn)} al ${diaMes(ronda.cerradaEn)}`
      : `Ronda ${ronda.texto ?? ""} abierta desde el ${diaMes(ronda.abiertaEn)}`
    : nombre
      ? "Sin ronda abierta"
      : undefined;
  // «Todavía no anota compras» ya lo dice el vacío de la tabla: arriba va solo lo que pide actuar.
  const avisoArriba = aviso?.tono === "ambar" ? aviso : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Compradores"
        titulo={nombre ?? "Persona no encontrada"}
        detalle={detalle}
        subtitulo="Lo que compró con la plata que le diste."
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
          <div className="@container">
            <div data-guia="comprador.cuenta" className="grid grid-cols-1 gap-3 @[36rem]:grid-cols-2 @[68rem]:grid-cols-4">
              <TarjetaCifra etiqueta="Le diste" valor={soles(dieron)}>
                {entregas && entregas.cuantas > 0
                  ? `En ${plural(entregas.cuantas, "entrega", "entregas")}, la última el ${diaMes(entregas.ultima)}`
                  : dieron > 0.005
                    ? "Plata para esta ronda"
                    : "Sin plata registrada"}
              </TarjetaCifra>
              <TarjetaCifra
                etiqueta="Gastó"
                valor={soles(gasto)}
                pie={usado !== null ? <BarraAvance pct={usado} alto="normal" tono="tinta" etiqueta={`Usó el ${usado} % de su plata`} /> : undefined}
              >
                {ronda && ronda.cuenta.compras > 0
                  ? `${plural(ronda.cuenta.compras, "compra", "compras")}, ${plural(ronda.cuenta.prendas, "prenda", "prendas")}${ronda.cuenta.gastaste > 0 ? ` y ${soles(ronda.cuenta.gastaste)} de gastos` : ""}`
                  : "Todavía no compra"}
              </TarjetaCifra>
              <TarjetaCifra etiqueta={noCuadra ? (dieron > 0.005 ? "No cuadra" : "Sin plata") : "Le queda"} valor={soles(Math.abs(queda))} punto={noCuadra ? "ambar" : undefined}>
                {noCuadra ? (dieron > 0.005 ? "Pagó más de lo que le diste" : "Pagó sin plata registrada") : ronda?.cerradaEn ? textoCierre(ronda) : "En la mano, hoy"}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Por revisar" valor={porRevisar} unidad={porRevisar === 1 ? "compra" : "compras"} punto={porRevisar > 0 || faltaPagar > 0.005 ? "ambar" : "verde"}>
                {faltaPagar > 0.005 ? `Falta pagar ${soles(faltaPagar)} a proveedores` : porRevisar > 0 ? "Falta revisar su papel" : sinCompras ? "Sin compras todavía" : "Todo revisado y pagado"}
              </TarjetaCifra>
            </div>
          </div>

          {avisoArriba && <Aviso tono="atencion" titulo={avisoArriba.texto} accion={avisoArriba.cerrarRonda ? cerrarRonda : undefined} chico />}

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-w-0 space-y-6">
              {bandeja && (
                <section className="space-y-3" data-guia="comprador.por-revisar">
                  <TituloSeccion>Por revisar</TituloSeccion>
                  {bandeja}
                </section>
              )}

              <section className="space-y-3">
                <TituloSeccion cuenta={ronda?.compras.length ?? 0} dato={sinCompras || !ronda ? undefined : soles(ronda.compras.reduce((a, c) => a + c.monto, 0))}>
                  Sus compras
                </TituloSeccion>
                {sinCompras || !ronda ? (
                  <div className="card-cayla">
                    <Vacio icono={<ShoppingBag />} titulo={ronda ? "Todavía no anota compras" : tieneSinRonda !== undefined ? `${nombre} todavía no abre su ronda` : `${nombre} no compró en los últimos dos meses`}>
                      {ronda ? "Cuando anote una compra en «Mis compras», aparece aquí." : "Cuando abra su ronda en «Mis compras», sus compras aparecen aquí."}
                    </Vacio>
                  </div>
                ) : (
                  <Tabla guia="comprador.compras">
                    <Encabezado
                      plantilla={PLANTILLA}
                      columnas={[{ titulo: "Día" }, { titulo: "Proveedor" }, { titulo: "Envío" }, { titulo: "Estado" }, { titulo: "Monto", alinear: "der" }]}
                    />
                    {ronda.compras.map((c) => (
                      <FilaCompra key={c.id} c={c} />
                    ))}
                  </Tabla>
                )}
              </section>
            </div>

            {(plata || otras.length > 0) && (
              <aside className="min-w-0 space-y-6">
                {plata && (
                  <section className="space-y-3" data-guia="comprador.plata">
                    <TituloSeccion dato={entregas && entregas.cuantas > 0 ? soles(entregas.total) : undefined}>Su plata</TituloSeccion>
                    <div className="card-cayla p-4 sm:p-5">{plata}</div>
                  </section>
                )}

                {otras.length > 0 && (
                  <section className="space-y-3" data-guia="comprador.rondas">
                    <TituloSeccion cuenta={otras.length}>Sus otras rondas</TituloSeccion>
                    <ul className="card-cayla divide-y divide-sand p-0">
                      {otras.map((r) => (
                        <li key={r.id}>
                          <Link href={`/compras/compradores/${personaId}?ronda=${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-5 py-3 text-sm vd-pasa">
                            <span className="min-w-0">
                              <span className="block truncate text-tinta">{r.cerradaEn ? `Del ${diaMes(r.abiertaEn)} al ${diaMes(r.cerradaEn)}` : `Abierta desde el ${diaMes(r.abiertaEn)}`}</span>
                              <span className="flex flex-wrap gap-x-3 text-detalle text-secundario">
                                <span>{plural(r.cuenta.compras, "compra", "compras")}</span>
                                {r.cerradaEn && <span>{textoCierre(r)}</span>}
                              </span>
                            </span>
                            <span className="tabular-nums text-tinta">{soles(gastoDeRonda(r.cuenta))}</span>
                            <ChevronRight aria-hidden className="h-4 w-4 text-tenue" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const MEDIOS: Record<string, string> = { yape: "Yape", efectivo: "Efectivo", transferencia: "Transferencia" };

function FilaCompra({ c }: { c: CompraDelLibro }) {
  const estado = estadoDeCompra(c, soles);
  const envio = c.envios.at(-1);
  const medio = c.medioPago ? (MEDIOS[c.medioPago] ?? c.medioPago) : null;
  const falta = faltaPagarDeCompra(c);
  return (
    <div className={fila(PLANTILLA, "sm:items-center")}>
      <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(c.fecha)}</span>
      <span className={celda("izq", "min-w-0")}>
        <span className="block truncate text-sm font-medium text-tinta">{c.proveedor}</span>
        <span className="block whitespace-normal text-detalle text-secundario">
          {[c.comprobante?.documento || nombreDelPapel(c.tipo), plural(c.prendas, "prenda", "prendas"), medio].filter(Boolean).join(", ")}
        </span>
      </span>
      <span className={celda("izq", "whitespace-normal text-sm")}>
        {envio ? (
          <>
            <span className="block tabular-nums text-tinta">{envio.numero}</span>
            <span className="block text-detalle text-secundario">{llegadaDeCompra(c)}</span>
          </>
        ) : (
          <span className="text-secundario">Sin enviar</span>
        )}
      </span>
      <span className={celda("izq", "overflow-visible")}>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </span>
      <span className={celda("der", "text-sm text-tinta")}>
        <span className="block">{soles(c.monto)}</span>
        {falta > 0.005 && <span className="block text-detalle text-secundario">Pagó {soles(c.monto - falta)}</span>}
      </span>
    </div>
  );
}

/** Cómo cerró, en palabras de tienda. */
export function textoCierre(r: Pick<RondaDeCompras, "cierre">): string {
  if (!r.cierre) return "Cerrada";
  if (r.cierre.decision === "devuelve") return `Devolvió ${soles(r.cierre.monto)}`;
  if (r.cierre.decision === "le_deben") return `CAYLA le debía ${soles(r.cierre.monto)}`;
  return "Se quedó en cero";
}
