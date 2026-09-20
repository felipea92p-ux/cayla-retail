"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { cantidadTexto, previsualizarConsumo, previsualizarDevolucion, UNIDADES_INSUMO } from "@/lib/insumos-reglas";
import { costoUnitario } from "@/lib/produccion-reglas";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";
import type { OrdenProduccion } from "@/lib/produccion";

// Insumos de una orden (ADR-0133, F3): qué tela y qué avíos se descontaron de qué lote, y el formulario para descontar más.
// Descontar reemplaza el «costo de tela / avíos» que se tecleó al abrir la orden por lo que de verdad salió del estante
// (`registrar_consumo_insumo` recalcula el campo del tipo consumido). La vista previa dice ANTES de confirmar de qué lote
// sale y cuánto cuesta, con la misma regla de la base: el lote más antiguo con saldo, sin partir el consumo entre lotes.
//
// F3b: cada insumo descontado se puede DEVOLVER mientras la orden siga en proceso (`devolver_insumo_de_produccion`): la
// cantidad vuelve al último lote del que salió, al mismo costo, y el costo de la orden baja en lo devuelto.
//
// Quien no es líder ve cantidades y lotes, no dinero.

export function OrdenInsumos({
  orden,
  insumos,
  consumos,
  esLider,
  editable,
}: {
  orden: OrdenProduccion;
  insumos: InsumoVista[];
  consumos: ConsumoDeOrden[];
  esLider: boolean;
  /** Solo una orden en proceso descuenta insumos (la base lo exige). */
  editable: boolean;
}) {
  const router = useRouter();
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [cargando, setCargando] = useState(false);
  const [devolviendoId, setDevolviendoId] = useState<string | null>(null);
  const [cantidadDev, setCantidadDev] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);

  // Lo descontado de la orden, agrupado por insumo: lo que importa es lo NETO (consumo − devolución).
  const grupos = (() => {
    const mapa = new Map<string, { insumoId: string; nombre: string; unidad: ConsumoDeOrden["unidad"]; neto: number; costo: number | null; movs: ConsumoDeOrden[] }>();
    for (const c of [...consumos].reverse()) {
      const g = mapa.get(c.insumoId) ?? { insumoId: c.insumoId, nombre: c.insumo, unidad: c.unidad, neto: 0, costo: esLider ? 0 : null, movs: [] };
      g.neto += c.cantidad;
      if (g.costo !== null && c.costo !== null) g.costo += c.costo;
      g.movs.push(c);
      mapa.set(c.insumoId, g);
    }
    return [...mapa.values()].reverse();
  })();

  const grupoDev = grupos.find((g) => g.insumoId === devolviendoId) ?? null;
  const insumoDev = insumos.find((i) => i.id === devolviendoId) ?? null;
  const qDev = Number(cantidadDev.replace(",", ".")) || 0;
  const previsionDev =
    grupoDev && insumoDev ? previsualizarDevolucion(insumoDev.lotes, grupoDev.movs.map((m) => ({ loteId: m.loteId, cantidad: m.cantidad })), qDev, insumoDev.nombre, insumoDev.unidad) : null;
  const efectoDev = (() => {
    if (!esLider || !insumoDev || !previsionDev?.ok || previsionDev.lote.costoUnitario === null) return null;
    const delTipo = consumos.filter((c) => c.tipo === insumoDev.tipo);
    const antesTipo = delTipo.reduce((s, c) => s + (c.costo ?? 0), 0);
    const costoDevuelto = qDev * previsionDev.lote.costoUnitario;
    const despuesTipo = antesTipo - costoDevuelto;
    const tela = insumoDev.tipo === "tela" ? despuesTipo : orden.costoTela;
    const avios = insumoDev.tipo === "avio" ? despuesTipo : orden.costoAvios;
    return {
      etiqueta: insumoDev.tipo === "tela" ? "Tela de la orden" : "Avíos de la orden",
      antesTipo,
      despuesTipo,
      cppAntes: orden.costoUnitario,
      cppDespues: costoUnitario(tela, avios, orden.costoMaquila, orden.cantidadPlan),
    };
  })();

  const insumo = insumos.find((i) => i.id === insumoId) ?? null;
  const q = Number(cantidad.replace(",", ".")) || 0;
  const prevision = insumo ? previsualizarConsumo(insumo.lotes, q, insumo.nombre, insumo.unidad) : null;

  // Lo que la base hará con el costo: la primera vez que se descuenta un tipo, el monto tecleado se reemplaza por la suma
  // real de lo consumido; las siguientes veces se suma a esa suma.
  const efectoEnCosto = (() => {
    if (!esLider || !insumo || !prevision?.ok || prevision.lote.costoUnitario === null) return null;
    const delTipo = consumos.filter((c) => c.tipo === insumo.tipo);
    const sumaReal = delTipo.reduce((s, c) => s + (c.costo ?? 0), 0);
    const antesTipo = delTipo.length > 0 ? sumaReal : insumo.tipo === "tela" ? orden.costoTela : orden.costoAvios;
    const despuesTipo = sumaReal + q * prevision.lote.costoUnitario;
    const tela = insumo.tipo === "tela" ? despuesTipo : orden.costoTela;
    const avios = insumo.tipo === "avio" ? despuesTipo : orden.costoAvios;
    return {
      etiqueta: insumo.tipo === "tela" ? "Tela de la orden" : "Avíos de la orden",
      antesTipo,
      despuesTipo,
      reemplazaTecleado: delTipo.length === 0 && antesTipo > 0,
      cppAntes: orden.costoUnitario,
      cppDespues: costoUnitario(tela, avios, orden.costoMaquila, orden.cantidadPlan),
      costoConsumo: q * prevision.lote.costoUnitario,
    };
  })();

  async function descontar() {
    if (!insumo || !prevision?.ok) return;
    setCargando(true);
    const { error } = await createClient().rpc("registrar_consumo_insumo", {
      p_produccion_id: orden.id,
      p_insumo_id: insumo.id,
      p_cantidad: q,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "descontar el insumo"));
      return;
    }
    avisar.exito(`${cantidadTexto(q, insumo.unidad)} de ${insumo.nombre} descontados`, {
      detalle: `Salieron del lote ${prevision.lote.codigo ?? "más antiguo"}${esLider && efectoEnCosto ? ` · ${orden.referencia} ahora cuesta ${soles(efectoEnCosto.cppDespues)} por prenda` : ""}`,
      duracion: 6000,
    });
    setCantidad("");
    setInsumoId(null);
    router.refresh();
  }

  async function devolver() {
    if (!grupoDev || !insumoDev || !previsionDev?.ok) return;
    setDevolviendo(true);
    const { error } = await createClient().rpc("devolver_insumo_de_produccion", {
      p_produccion_id: orden.id,
      p_insumo_id: insumoDev.id,
      p_cantidad: qDev,
    });
    setDevolviendo(false);
    if (error) {
      avisar.error(traducirError(error, "devolver el insumo"));
      return;
    }
    avisar.exito(`${cantidadTexto(qDev, insumoDev.unidad)} de ${insumoDev.nombre} volvieron al estante`, {
      detalle: `Al lote ${previsionDev.lote.codigo ?? "del que salieron"}${esLider && efectoDev ? ` · ${orden.referencia} ahora cuesta ${soles(efectoDev.cppDespues)} por prenda` : ""}`,
      duracion: 6000,
    });
    setCantidadDev("");
    setDevolviendoId(null);
    router.refresh();
  }

  return (
    <section aria-label="Insumos descontados">
      <h3 className="label-cayla mb-3 text-[11px] text-tinta/65">Insumos descontados</h3>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ambar/45 bg-ambar/[0.06] px-3.5 py-3 text-[13px] text-ambar-profundo">
          <b className="font-semibold">Todavía no se descontó tela ni avíos.</b>{" "}
          {esLider ? "El costo que ves es el que se anotó al abrir la orden; al descontar el primer insumo de cada tipo se reemplaza por lo real." : "Registra lo que salió del estante."}
        </p>
      ) : (
        <ul>
          {grupos.map((g) => {
            const abierto = g.insumoId === devolviendoId;
            const puedeDevolver = editable && g.neto > 0;
            return (
              <li key={g.insumoId} className="border-b border-tinta/10 py-2.5 text-[13px]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-tinta">{g.nombre}</p>
                    <p className="text-xs text-tinta/65">
                      {[...new Set(g.movs.filter((m) => m.lote).map((m) => `lote ${m.lote}`))].join(" · ") || "sin lote"}
                      {" · "}
                      {diaMes(g.movs[g.movs.length - 1].creadoEn.slice(0, 10))}
                      {g.movs.some((m) => m.cantidad < 0) && " · con devoluciones"}
                    </p>
                  </div>
                  <p className="text-right tabular-nums text-tinta">
                    {cantidadTexto(g.neto, g.unidad)}
                    {esLider && g.costo !== null && <small className="block text-xs text-tinta/65">{soles(g.costo)}</small>}
                  </p>
                </div>
                {puedeDevolver && (
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => {
                      setDevolviendoId(abierto ? null : g.insumoId);
                      setCantidadDev("");
                    }}
                    className="mt-1.5 text-xs text-tinta/70 underline underline-offset-2 outline-none hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
                  >
                    {abierto ? "Cancelar devolución" : "Devolver al estante"}
                  </button>
                )}
                {abierto && insumoDev && (
                  <div className="anim-entra mt-2 space-y-2.5 rounded-xl border border-sand bg-crema p-3">
                    <label className="flex items-center gap-2">
                      <span className="sr-only">Cantidad de {insumoDev.nombre} a devolver</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cantidadDev}
                        onChange={(e) => setCantidadDev(e.target.value)}
                        placeholder="0"
                        className="w-28 rounded-lg border border-tinta/25 bg-papel px-3 py-2 text-center text-lg tabular-nums text-tinta outline-none focus:border-rojo"
                      />
                      <span className="text-sm text-tinta/65">{UNIDADES_INSUMO[insumoDev.unidad].corta}</span>
                      <button
                        type="button"
                        onClick={() => setCantidadDev(String(previsionDev?.ok ? previsionDev.netoLote : g.neto))}
                        className="ml-auto text-xs text-tinta/70 underline underline-offset-2 hover:text-rojo"
                      >
                        Devolver todo
                      </button>
                    </label>
                    {qDev > 0 && previsionDev && !previsionDev.ok && <p className="rounded-lg bg-rojo/[0.07] px-3 py-2 text-[13px] text-rojo-profundo">{previsionDev.motivo}</p>}
                    {previsionDev?.ok && (
                      <dl className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-papel text-[13px]">
                        <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                          <dt>
                            Vuelve al lote <b className="font-semibold">{previsionDev.lote.codigo ?? "del que salió"}</b>
                            <small className="block text-xs text-tinta/65">el último del que salió esta orden</small>
                          </dt>
                          <dd className="whitespace-nowrap tabular-nums">
                            <s className="mr-1.5 text-tinta/45">{cantidadTexto(previsionDev.lote.saldo, insumoDev.unidad)}</s>
                            <b className="font-semibold">{cantidadTexto(previsionDev.saldoLoteDespues, insumoDev.unidad)}</b>
                          </dd>
                        </div>
                        {efectoDev && (
                          <>
                            <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                              <dt>{efectoDev.etiqueta}</dt>
                              <dd className="whitespace-nowrap tabular-nums">
                                <s className="mr-1.5 text-tinta/45">{soles(efectoDev.antesTipo)}</s>
                                <b className="font-semibold">{soles(efectoDev.despuesTipo)}</b>
                              </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                              <dt>Costo por prenda</dt>
                              <dd className="whitespace-nowrap tabular-nums">
                                <s className="mr-1.5 text-tinta/45">{soles(efectoDev.cppAntes)}</s>
                                <b className="font-semibold">{soles(efectoDev.cppDespues)}</b>
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    )}
                    <Boton peso="fantasma" cargando={devolviendo} disabled={!previsionDev?.ok} onClick={devolver} className="w-full">
                      {devolviendo ? "Devolviendo…" : "Devolver al lote"}
                    </Boton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div className="mt-3 rounded-2xl border border-sand bg-crema p-3.5">
          <p className="label-cayla text-[11px] text-tinta/65">Descontar al cortar</p>
          {insumos.length === 0 ? (
            <p className="mt-2 text-[13px] text-tinta/75">
              Todavía no hay insumos en el catálogo.{" "}
              <Link href="/produccion/insumos" className="underline underline-offset-2 hover:text-rojo">
                Cárgalos en Insumos
              </Link>{" "}
              para descontar tela y avíos desde aquí.
            </p>
          ) : (
            <>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {insumos.map((i) => {
                  const sinSaldo = i.saldo <= 0;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      disabled={sinSaldo}
                      aria-pressed={i.id === insumoId}
                      onClick={() => {
                        setInsumoId(i.id);
                        setCantidad("");
                      }}
                      className="rounded-full border border-tinta/15 px-3 py-1.5 text-[12.5px] text-tinta/80 outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-crema disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-tinta/15"
                    >
                      {i.nombre}
                      <small className="ml-1.5 opacity-70">{sinSaldo ? "sin saldo" : cantidadTexto(i.saldo, i.unidad)}</small>
                    </button>
                  );
                })}
              </div>

              {insumo && (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Cantidad de {insumo.nombre}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      placeholder="0"
                      className="w-28 rounded-lg border border-tinta/25 bg-papel px-3 py-2.5 text-center text-lg tabular-nums text-tinta outline-none focus:border-rojo"
                    />
                    <span className="text-sm text-tinta/65">{UNIDADES_INSUMO[insumo.unidad].corta}</span>
                  </label>

                  {q > 0 && prevision && !prevision.ok && (
                    <p className="rounded-lg bg-rojo/[0.07] px-3 py-2.5 text-[13px] text-rojo-profundo">{prevision.motivo}</p>
                  )}
                  {prevision?.ok && (
                    <dl className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-papel text-[13px]">
                      <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                        <dt>
                          Sale del lote <b className="font-semibold">{prevision.lote.codigo ?? "más antiguo"}</b>
                          <small className="block text-xs text-tinta/65">el más antiguo con saldo{esLider && prevision.lote.costoUnitario !== null ? ` · ${soles(prevision.lote.costoUnitario)} por ${UNIDADES_INSUMO[insumo.unidad].corta}` : ""}</small>
                        </dt>
                        <dd className="whitespace-nowrap tabular-nums">
                          <s className="mr-1.5 text-tinta/45">{cantidadTexto(prevision.saldoLote, insumo.unidad)}</s>
                          <b className="font-semibold">{cantidadTexto(prevision.quedaria, insumo.unidad)}</b>
                        </dd>
                      </div>
                      {efectoEnCosto && (
                        <>
                          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                            <dt>
                              {efectoEnCosto.etiqueta}
                              <small className="block text-xs text-tinta/65">
                                {efectoEnCosto.reemplazaTecleado ? "reemplaza el monto anotado al abrir por lo real" : `este consumo suma ${soles(efectoEnCosto.costoConsumo)}`}
                              </small>
                            </dt>
                            <dd className="whitespace-nowrap tabular-nums">
                              <s className="mr-1.5 text-tinta/45">{soles(efectoEnCosto.antesTipo)}</s>
                              <b className="font-semibold">{soles(efectoEnCosto.despuesTipo)}</b>
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                            <dt>Costo por prenda</dt>
                            <dd className="whitespace-nowrap tabular-nums">
                              <s className="mr-1.5 text-tinta/45">{soles(efectoEnCosto.cppAntes)}</s>
                              <b className="font-semibold">{soles(efectoEnCosto.cppDespues)}</b>
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  )}

                  <Boton peso="primario" cargando={cargando} disabled={!prevision?.ok} onClick={descontar} className="w-full">
                    {cargando ? "Descontando…" : "Descontar del lote"}
                  </Boton>
                  <p className="text-xs text-tinta/65">Si te equivocas, lo puedes devolver al estante mientras la orden siga en proceso.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
