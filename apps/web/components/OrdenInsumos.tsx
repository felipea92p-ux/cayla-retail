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
import { cantidadTexto, previsualizarConsumo, UNIDADES_INSUMO } from "@/lib/insumos-reglas";
import { costoUnitario } from "@/lib/produccion-reglas";
import type { ConsumoDeOrden, InsumoVista } from "@/lib/insumos";
import type { OrdenProduccion } from "@/lib/produccion";

// Insumos de una orden (ADR-0133, F3): qué tela y qué avíos se descontaron de qué lote, y el formulario para descontar más.
// Descontar reemplaza el «costo de tela / avíos» que se tecleó al abrir la orden por lo que de verdad salió del estante
// (`registrar_consumo_insumo` recalcula el campo del tipo consumido). La vista previa dice ANTES de confirmar de qué lote
// sale y cuánto cuesta, con la misma regla de la base: el lote más antiguo con saldo, sin partir el consumo entre lotes.
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

  return (
    <section aria-label="Insumos descontados">
      <h3 className="label-cayla mb-3 text-[11px] text-tinta/65">Insumos descontados</h3>

      {consumos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ambar/45 bg-ambar/[0.06] px-3.5 py-3 text-[13px] text-ambar-profundo">
          <b className="font-semibold">Todavía no se descontó tela ni avíos.</b>{" "}
          {esLider ? "El costo que ves es el que se anotó al abrir la orden; al descontar el primer insumo de cada tipo se reemplaza por lo real." : "Registra lo que salió del estante."}
        </p>
      ) : (
        <ul>
          {consumos.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-tinta/10 py-2.5 text-[13px]">
              <div className="min-w-0">
                <p className="truncate text-tinta">{c.insumo}</p>
                <p className="text-xs text-tinta/65">
                  {c.lote ? `lote ${c.lote} · ` : ""}
                  {diaMes(c.creadoEn.slice(0, 10))}
                </p>
              </div>
              <p className="text-right tabular-nums text-tinta">
                {cantidadTexto(c.cantidad, c.unidad)}
                {esLider && c.costo !== null && <small className="block text-xs text-tinta/65">{soles(c.costo)}</small>}
              </p>
            </li>
          ))}
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
                  <p className="text-xs text-tinta/65">Por ahora un consumo no se puede deshacer: revisa la cantidad antes de confirmar.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
