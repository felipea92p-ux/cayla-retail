"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeftRight, ArrowUp, Banknote, Clock, DollarSign, EqualNot, Landmark, OctagonAlert, type LucideIcon } from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Volver } from "@/components/ui/Volver";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";
import { HistorialModal } from "@/components/finanzas/dinero/HistorialDinero";
import { montoConSigno } from "@/lib/dinero-telar-reglas";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import { TEXTO_MOVIMIENTO, type CuentaDinero, type MovimientoDinero } from "@/lib/cuentas-dinero-reglas";
import { AYUDA_ETAPA, ETAPAS_EN_ORDEN, TEXTO_ETAPA, fraseDeEtapas, totalesPorEtapa, type EtapaDinero, type FilaEstado, type ItemAtencion, type TipoAtencion } from "@/lib/dinero-estados-reglas";

// Cuentas y dinero ▸ Dónde está (rediseño «Fusión», Felipe 2026-10-31): la COMPOSICIÓN es la de la maqueta aprobada
// (docs/maquetas/finanzas-dinero-rediseno-2026-10/index.html#d): la tarjeta «Tienes en total» con su barra partida por etapa, las cuatro
// etapas a su lado, «Mis cuentas» (por etapa o por sede) con su insignia redonda, el detalle de una cuenta y «Pide tu atención». Donde la
// maqueta pedía una pieza que el ERP ya tiene decidida (ADR-0358, «una función, una pieza»), se usa esa pieza: `TarjetaCifra` para las etapas,
// `BarraApilada` para la barra partida, `Aviso` para cada aviso, `TituloSeccion`/`TituloGrupo` para los títulos. Estilos de la composición:
// `app/estilos/finanzas-dinero.css`. Todo sale de lo que la pantalla ya lee (`lib/dinero-estados-reglas.ts`); cada acción abre la hoja de
// siempre. Sin la curva de 14 días de la maqueta: no hay una serie de saldos en la base.

/** El color de cada etapa (un token, nunca un hex): el filete de la tarjeta, el tramo de la barra y la insignia de sus cuentas. */
const COLOR_ETAPA: Record<EtapaDinero, string> = {
  banco: "var(--color-pizarra)",
  camino: "color-mix(in srgb, var(--color-pizarra) 55%, var(--color-verde))",
  deposito: "var(--color-verde)",
  caja: "var(--color-taupe)",
};

/** El ícono de cada aviso, en su círculo (los de la maqueta eran signos: «$», «↑», «≠», «S/»). */
const ICONO_ATENCION: Record<TipoAtencion, LucideIcon> = {
  negativo: OctagonAlert,
  dueno: DollarSign,
  maquina: Clock,
  conciliar: EqualNot,
  depositar: ArrowUp,
  cierres: Banknote,
  planilla: Banknote,
};

type Agrupar = "sede" | "etapa";

/** El evento con el que un aviso abre la campana en una de sus vistas (la campana vive en la cabecera: otra rama del árbol). */
export const EVENTO_ABRIR_CAMPANA = "campana-dinero:abrir";

/** «BCP», «IZI», «CAJ»: las tres primeras letras de la cuenta, en su insignia redonda. */
const siglas = (nombre: string) => nombre.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/)[0].slice(0, 3).toUpperCase();

export function PanoramaDinero({
  titulo,
  total,
  tarjeta,
  notas,
  filas,
  cuentas,
  movimientos,
  hoy,
  items,
  alcanza,
  ultimos,
}: {
  /** «Tienes en total», o «Tiene Trujillo» con una sede elegida. */
  titulo: string;
  /** Lo que se tiene de lo que se mira (la cifra que antes decía la cabecera); nulo si no se pudo leer. */
  total: number | null;
  /** Lo que se debe en la tarjeta de crédito (aparte: es deuda, no plata). */
  tarjeta: number;
  /** Líneas de contexto bajo la barra («Disponible sin los S/ 295 de Claudia»), cada una con su tono. */
  notas: { texto: string; tono: TonoChip }[];
  filas: FilaEstado[];
  cuentas: CuentaDinero[];
  movimientos: MovimientoDinero[];
  hoy: string;
  items: ItemAtencion[];
  /** «¿Me alcanza?», que llega ya dibujada del servidor y va en la columna derecha, bajo los avisos. */
  alcanza?: ReactNode;
  /** «Últimos movimientos», que llega ya dibujada y va al final de la columna derecha: llena el espacio que dejaba la lista de cuentas. */
  ultimos?: ReactNode;
}) {
  const abrirMovimiento = useAbrirMovimiento();
  const [agrupar, setAgrupar] = useState<Agrupar>("etapa");
  const [etapa, setEtapa] = useState<EtapaDinero | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);

  if (filas.length === 0) {
    return (
      <Vacio icono={<Landmark />} titulo="Todavía no hay cuentas: agrega los bancos de CAYLA">
        Los cajones y las cajas fuertes nacen con cada tienda. Los bancos, las billeteras, el POS y la tarjeta se agregan en Configuración ▸ Cuentas y cobros.
      </Vacio>
    );
  }

  const totales = totalesPorEtapa(filas);
  const visibles = etapa ? filas.filter((f) => f.etapa === etapa) : filas;
  const sel = filas.find((f) => f.id === elegida) ?? null;
  const cuentaSel = cuentas.find((c) => c.id === elegida) ?? null;

  const grupos: { clave: string; titulo: string; total: number; filas: FilaEstado[] }[] = [];
  if (agrupar === "etapa") {
    for (const e of ETAPAS_EN_ORDEN) {
      const f = visibles.filter((x) => x.etapa === e);
      if (f.length) grupos.push({ clave: e, titulo: TEXTO_ETAPA[e], total: suma(f), filas: f });
    }
  } else {
    for (const sede of [...new Set(visibles.map((f) => f.sede))]) {
      const f = visibles.filter((x) => x.sede === sede);
      grupos.push({ clave: sede, titulo: sede, total: suma(f), filas: f });
    }
  }

  const ejecutar = (a: NonNullable<ItemAtencion["accion"]>) => {
    if (a.tipo === "movimiento") abrirMovimiento(a.que, a.cuentaId);
    else if (a.tipo === "campana") window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CAMPANA, { detail: a.vista }));
  };

  return (
    <section className="dp" aria-label="Dónde está la plata">
      <div className="card-cayla dp-franja" data-guia="fin-dinero.total">
        <div className="dp-franja-fila">
          <div className="dp-franja-total">
            <span className="dp-versalita">{titulo}</span>
            {total === null ? (
              <span className="dp-tenue">No se pudo leer</span>
            ) : (
              <div className="dp-franja-cifra">
                <small>S/</small>
                {Math.round(total).toLocaleString("en-US")}
              </div>
            )}
          </div>
          <div className="dp-franja-etapas" role="group" aria-label="Las etapas de la plata: toca una para ver solo sus cuentas" data-guia="fin-dinero.etapas">
            {totales.map((t) => (
              <button
                key={t.etapa}
                type="button"
                className="dp-franja-celda"
                style={{ ["--c" as string]: COLOR_ETAPA[t.etapa] } as CSSProperties}
                aria-pressed={etapa === t.etapa}
                title={AYUDA_ETAPA[t.etapa]}
                onClick={() => setEtapa(etapa === t.etapa ? null : t.etapa)}
              >
                <span className="dp-versalita">{TEXTO_ETAPA[t.etapa]}</span>
                <span className="dp-v">{montoConSigno(t.total)}</span>
                <span className="dp-q">
                  {t.cuentas} {t.cuentas === 1 ? "cuenta" : "cuentas"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="dp-franja-pie">
          <div className="dp-franja-barra">
            <BarraApilada
              decorativa
              unidad="soles"
              formato={(v) => montoConSigno(v)}
              segmentos={totales.filter((t) => t.total > 0).map((t) => ({ clave: t.etapa, nombre: TEXTO_ETAPA[t.etapa], valor: t.total, color: COLOR_ETAPA[t.etapa] }))}
            />
          </div>
          <p>
            {fraseDeEtapas(totales)}
            {tarjeta > 0 && <> Además debes {solesRedondo(tarjeta)} en la tarjeta de crédito.</>}
          </p>
          {notas.map((n) => (
            <Chip key={n.texto} tono={n.tono} versalitas={false}>
              {n.texto}
            </Chip>
          ))}
        </div>
      </div>

      <div className="dp-cuerpo">
        <section className="card-cayla dp-lista" aria-label="Mis cuentas" data-guia="fin-dinero.cuentas">
          <div className="dp-lista-in">
          <div className="dp-lista-cab">
            <TituloSeccion cuenta={visibles.length}>{etapa ? TEXTO_ETAPA[etapa] : "Mis cuentas"}</TituloSeccion>
          </div>
          <div className="dp-lista-modo">
            <SegmentoDeslizante
              etiqueta="Agrupar las cuentas"
              forma="modo"
              valor={agrupar}
              onCambio={(v) => setAgrupar(v as Agrupar)}
              opciones={[
                { clave: "etapa", etiqueta: "Por etapa" },
                { clave: "sede", etiqueta: "Por sede" },
              ]}
            />
          </div>
          <div className="dp-grupos">
            {grupos.map((g) => (
              <div key={g.clave}>
                <div className="dp-grupo-cab">
                  <TituloGrupo nota={montoConSigno(g.total)}>{g.titulo}</TituloGrupo>
                </div>
                <ul role="list" className="m-0 list-none p-0">
                  {g.filas.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="dp-cuenta" style={{ ["--c" as string]: COLOR_ETAPA[f.etapa] } as CSSProperties} aria-pressed={elegida === f.id} onClick={() => setElegida(elegida === f.id ? null : f.id)}>
                        <span className="dp-pt" aria-hidden>
                          {siglas(f.nombre)}
                        </span>
                        <span className="min-w-0">
                          <b>
                            {f.nombre}
                            {f.pide && <i className="dp-ambar-punto" title="Pide atención" />}
                          </b>
                          <small>
                            {agrupar === "etapa" ? (f.sinSede ? "Sin sede" : f.sede) : TEXTO_ETAPA[f.etapa]}
                            {f.estado ? ` · ${f.estado.texto}` : ""}
                          </small>
                        </span>
                        <span className={`dp-saldo ${f.saldo !== null && Math.round(f.saldo) < 0 ? "dp-neg" : ""}`}>
                          {f.saldo === null ? <small>Lo ve quien cierra la caja</small> : montoConSigno(f.saldo)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="dp-leyenda-etapas" aria-label="Qué es cada etapa">
              <span className="dp-versalita">Las etapas</span>
              <ul role="list">
                {ETAPAS_EN_ORDEN.map((e) => (
                  <li key={e} style={{ ["--c" as string]: COLOR_ETAPA[e] } as CSSProperties}>
                    <i aria-hidden />
                    <span>
                      <b>{TEXTO_ETAPA[e]}</b>
                      {AYUDA_ETAPA[e]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="dp-lista-pie">
            <span>Suma de lo que ves</span>
            <b className="dp-num">{montoConSigno(suma(visibles))}</b>
          </div>
          </div>
        </section>

        <div className="dp-derecha">
          {sel && (
            <section className="card-cayla dp-detalle anim-sube" aria-label={`Detalle de ${sel.nombre}`}>
              <Volver onClick={() => setElegida(null)} a="Volver al panorama" className="dp-volver" />
              <div>
                <span className="dp-versalita">
                  {TEXTO_ETAPA[sel.etapa]} · {sel.sinSede ? "todavía sin sede" : sel.sede}
                </span>
                <TituloSeccion>{sel.nombre}</TituloSeccion>
                {sel.detalle && (
                  <p className="dp-tenue" style={{ fontSize: "13.5px", maxWidth: "52ch" }}>
                    {sel.detalle}
                  </p>
                )}
              </div>
              <div className={`dp-saldo-grande ${sel.saldo !== null && Math.round(sel.saldo) < 0 ? "dp-neg" : ""}`}>{sel.saldo === null ? "—" : montoConSigno(sel.saldo)}</div>
              {sel.estado && (
                <div style={{ alignSelf: "flex-start" }}>
                  <Chip tono={sel.estado.tono}>{sel.estado.texto}</Chip>
                </div>
              )}
              <div className="dp-meta">
                <MetaCaja titulo="Última actividad" valor={ultimaActividad(sel.id, movimientos)} />
                <MetaCaja titulo="Conciliada con el banco" valor={cuentaSel?.ultimaConciliacion ? fechaCorta(cuentaSel.ultimaConciliacion) : sel.etapa === "banco" ? "Todavía no" : "No aplica"} />
                <MetaCaja titulo={sel.etapa === "camino" ? "Último abono" : "Etapa"} valor={sel.etapa === "camino" ? (cuentaSel?.ultimoAbono ? fechaCorta(cuentaSel.ultimoAbono) : "Sin abonos todavía") : TEXTO_ETAPA[sel.etapa]} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
                {sel.pide === "conciliar" && (
                  <Link href="/finanzas/dinero/conciliacion" className="btn-cayla btn-enlace">
                    Cuadrar con el banco
                  </Link>
                )}
                {sel.pide === "abonar" && (
                  <button type="button" className="btn-cayla btn-enlace" onClick={() => abrirMovimiento("abono_tarjeta", sel.id)}>
                    Registrar el depósito
                  </button>
                )}
                {sel.pide === "depositar" && (
                  <button type="button" className="btn-cayla btn-enlace" onClick={() => abrirMovimiento("deposito", sel.id)}>
                    Registrar el depósito
                  </button>
                )}
              </div>
              <MovimientosDeLaCuenta cuenta={{ id: sel.id, nombre: sel.nombre }} movimientos={movimientos} hoy={hoy} />
            </section>
          )}

          <section className="card-cayla" aria-label="Pide tu atención" data-guia="fin-dinero.atencion">
            <div className="dp-atencion-cab">
              <TituloSeccion>Pide tu atención</TituloSeccion>
              <Chip tono={items.length ? "ambar" : "verde"} versalitas>
                {items.length === 0 ? "Todo en orden" : `${items.length} ${items.length === 1 ? "cosa" : "cosas"}`}
              </Chip>
            </div>
            {items.length === 0 ? (
              <p className="dp-tenue" style={{ padding: "0 24px 22px", fontSize: "13.5px" }}>
                Ninguna cuenta ni cierre pide revisión.
              </p>
            ) : (
              <ul className="dp-aten" role="list">
                {items.map((i) => {
                  const Icono = ICONO_ATENCION[i.tipo];
                  return (
                    <li key={i.clave} style={{ ["--c" as string]: i.tono === "error" ? "var(--color-rojo-profundo)" : "var(--color-ambar)" } as CSSProperties}>
                      <span className="dp-ic" aria-hidden>
                        <Icono className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <b>{i.titulo}</b>
                        <span className="dp-d">{i.detalle}</span>
                      </div>
                      {i.accion &&
                        (i.accion.tipo === "enlace" ? (
                          <Link href={i.accion.href} className="btn-cayla btn-enlace">
                            {i.accion.texto}
                          </Link>
                        ) : (
                          <button type="button" className="btn-cayla btn-enlace" aria-haspopup="dialog" onClick={() => ejecutar(i.accion!)}>
                            {i.accion.texto}
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {alcanza}
          {ultimos}
        </div>
      </div>
    </section>
  );
}

function suma(f: readonly FilaEstado[]): number {
  return Math.round(f.reduce((a, x) => a + (x.saldo ?? 0), 0) * 100) / 100;
}

function MetaCaja({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <span className="dp-versalita">{titulo}</span>
      <b>{valor}</b>
    </div>
  );
}

/** El día del último movimiento entre cuentas que toca la cuenta, o «Sin movimientos» si no hay. */
function ultimaActividad(id: string, movimientos: readonly MovimientoDinero[]): string {
  const m = movimientos.find((x) => x.estado === "vigente" && (x.origenId === id || x.destinoId === id));
  return m ? fechaCorta(m.fecha) : "Sin movimientos";
}

/** Los últimos movimientos entre cuentas que tocan esta cuenta: lo que entró en verde y lo que salió en rojo. */
function MovimientosDeLaCuenta({ cuenta, movimientos, hoy }: { cuenta: { id: string; nombre: string }; movimientos: MovimientoDinero[]; hoy: string }) {
  const id = cuenta.id;
  const [historial, setHistorial] = useState(false);
  const suyos = movimientos.filter((m) => m.estado === "vigente" && (m.origenId === id || m.destinoId === id)).slice(0, 5);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <TituloSeccion nivel={3} cuenta={suyos.length}>
          Movimientos de esta cuenta
        </TituloSeccion>
        {suyos.length > 0 && (
          <button type="button" className="btn-cayla btn-enlace" aria-haspopup="dialog" onClick={() => setHistorial(true)}>
            Ver historial completo
          </button>
        )}
      </div>
      {historial && <HistorialModal movimientos={movimientos} hoy={hoy} cuenta={cuenta} titulo={`Historial · ${cuenta.nombre}`} onCerrar={() => setHistorial(false)} />}
      {suyos.length === 0 ? (
        <Vacio tamano="chico" icono={<ArrowLeftRight />}>
          Sin movimientos entre cuentas todavía.
        </Vacio>
      ) : (
        <ul className="dp-mov" role="list">
          {suyos.map((m) => {
            const entra = m.destinoId === id;
            return (
              <li key={m.id}>
                <span className="dp-versalita">{fechaCorta(m.fecha)}</span>
                <span className="min-w-0">
                  <b style={{ display: "block", fontSize: "14px", fontWeight: 600 }}>{TEXTO_MOVIMIENTO[m.tipo]}</b>
                  <small className="dp-tenue" style={{ fontSize: "12.5px" }}>
                    {m.origenNombre ?? "El dueño"} → {m.destinoNombre ?? "Sale del negocio"}
                  </small>
                </span>
                <b className={`dp-m ${entra ? "dp-ent" : "dp-sal"}`}>
                  {entra ? "+" : "−"}
                  {solesRedondo(m.monto)}
                </b>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
