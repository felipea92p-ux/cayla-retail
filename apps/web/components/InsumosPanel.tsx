"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { IngresarInsumoModal, NuevoInsumoModal } from "@/components/InsumoModales";
import {
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  cantidadTexto,
  loteMasAntiguoConSaldo,
  textoDeMovimiento,
  tramoDeSaldo,
  type EstadoInsumo,
} from "@/lib/insumos-reglas";
import type { InsumoVista, InsumosDelTaller } from "@/lib/insumos";

// Insumos del Taller (ADR-0133, F3): tela y avíos. Lo que hay por lote, cuánto dura y qué falta. El saldo es la suma del
// ledger, nunca un número que alguien edite; por eso el libro de movimientos solo se agrega, no se corrige. Quien no es
// líder ve cantidades, no dinero (los costos ni siquiera llegan a esta pantalla: se recortan en el servidor).

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const TONO_ESTADO: Record<EstadoInsumo["tono"], TonoChip> = { sin_saldo: "rojo", bajo: "ambar", bien: "verde", sin_minimo: "neutro" };
const COLOR_RIEL: Record<EstadoInsumo["tono"], string> = { sin_saldo: "bg-rojo", bajo: "bg-ambar", bien: "bg-verde", sin_minimo: "bg-tinta/40" };

export function InsumosPanel({ datos, tallerId, esLider }: { datos: InsumosDelTaller; tallerId: string; esLider: boolean }) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [nuevo, setNuevo] = useState(false);
  const [ingresando, setIngresando] = useState<{ insumoId: string | null } | null>(null);

  const { insumos, libro, capital } = datos;
  const bajos = insumos.filter((i) => i.estado.tono === "bajo" || i.estado.tono === "sin_saldo").length;
  let indice = 0;

  return (
    <div className="space-y-6">
      {/* Cabecera del spike: el título a la izquierda y las acciones arriba a la derecha. */}
      <div className="anim-entra flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Insumos</h1>
          <p className="mt-1 max-w-xl text-sm text-tinta/65">
            Tela y avíos del Taller: lo que hay por lote, cuánto dura y qué pedir. El saldo siempre es la suma de sus movimientos.
          </p>
        </div>
        {esLider && (
          <div className="flex flex-wrap gap-2">
            <Boton peso="fantasma" onClick={() => setNuevo(true)}>
              + Nuevo insumo
            </Boton>
            <Boton peso="primario" onClick={() => setIngresando({ insumoId: null })} disabled={insumos.length === 0}>
              Ingresar insumo
            </Boton>
          </div>
        )}
      </div>

      {/* ==================== cifras ==================== */}
      <div className={`grid gap-3 sm:grid-cols-2 ${esLider ? "xl:grid-cols-3" : ""}`}>
        <TarjetaCifra
          compacta
          punto={bajos > 0 ? "ambar" : "verde"}
          etiqueta="Bajo el mínimo"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={bajos} alMontar />}
          detalleTono={bajos > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        >
          {bajos > 0 ? "hay que pedir o esperar lo que viene" : "todo sobre el mínimo"}
        </TarjetaCifra>
        {esLider && (
          <TarjetaCifra
            compacta
            punto="verde"
            etiqueta="Capital en insumos"
            className="anim-entra"
            style={{ ["--i" as string]: 1 }}
            vacia={capital === null || insumos.length === 0}
            valor={capital === null || insumos.length === 0 ? "—" : <CifraQueCuenta valor={capital} formato="soles" alMontar />}
          >
            a costo de cada lote
          </TarjetaCifra>
        )}
        <TarjetaCifra compacta punto="verde" etiqueta="Insumos" className="anim-entra" style={{ ["--i" as string]: 2 }} valor={<CifraQueCuenta valor={insumos.length} alMontar />}>
          {plural(insumos.filter((i) => i.tipo === "tela").length, "tela", "telas")} · {plural(insumos.filter((i) => i.tipo === "avio").length, "avío", "avíos")}
        </TarjetaCifra>
      </div>

      {insumos.length === 0 ? (
        <div className="card-cayla space-y-2 p-5 text-sm text-tinta/75">
          <p>
            Aquí se lleva la tela y los avíos del Taller: lo que entra por lote, lo que sale al cortar y lo que queda. Sin esto, el costo de tela y avíos de una
            orden es un número que alguien escribe.
          </p>
          {esLider ? <p>Empieza agregando un insumo al catálogo; después ingresa su primer lote.</p> : <p>El líder tiene que cargar el catálogo primero.</p>}
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="space-y-6">
            {TIPOS_INSUMO.map((t) => {
              const lista = insumos.filter((i) => i.tipo === t.valor);
              if (lista.length === 0) return null;
              return (
                <section key={t.valor} className="space-y-2.5">
                  <h2 className="font-display flex flex-wrap items-baseline gap-x-3 text-xl text-tinta">
                    {t.plural}
                    <small className="font-sans text-xs text-tinta/65">{t.ayuda}</small>
                  </h2>
                  {lista.map((i) => (
                    <FilaInsumo
                      key={i.id}
                      insumo={i}
                      indice={indice++}
                      esLider={esLider}
                      abierto={!!abiertos[i.id]}
                      onAlternar={() => setAbiertos((a) => ({ ...a, [i.id]: !a[i.id] }))}
                      onIngresar={() => setIngresando({ insumoId: i.id })}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          {/* ==================== libro de movimientos ==================== */}
          <aside className="card-cayla anim-entra p-4" style={{ ["--i" as string]: 3 }} aria-label="Libro de movimientos">
            <h2 className="font-display text-lg text-tinta">Libro de movimientos</h2>
            <p className="mb-2 text-xs text-tinta/65">Solo se agrega: nada se edita ni se borra.</p>
            {libro.length === 0 ? (
              <p className="py-3 text-sm text-tinta/65">Todavía no se movió nada.</p>
            ) : (
              <ul className="divide-y divide-tinta/10">
                {libro.map((m) => {
                  const entra = m.tipo === "compra" || m.tipo === "devolucion" || (m.tipo === "ajuste" && m.cantidad > 0);
                  return (
                    <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 text-[13px]">
                      <div className="min-w-0">
                        <p className="text-tinta">{textoDeMovimiento(m)}</p>
                        <p className="truncate text-xs text-tinta/65">
                          {[m.insumo, m.orden, m.lote].filter(Boolean).join(" · ")} · {diaMes(m.creadoEn.slice(0, 10))}
                        </p>
                      </div>
                      <span className={`self-start font-medium tabular-nums ${entra ? "text-verde-profundo" : "text-tinta"}`}>
                        {entra ? "+" : "−"}
                        {cantidadTexto(Math.abs(m.cantidad), m.unidad)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}

      {nuevo && <NuevoInsumoModal onClose={() => setNuevo(false)} />}
      {ingresando && <IngresarInsumoModal insumos={insumos} insumoInicialId={ingresando.insumoId} tallerId={tallerId} onClose={() => setIngresando(null)} />}
    </div>
  );
}

function FilaInsumo({
  insumo: i,
  indice,
  esLider,
  abierto,
  onAlternar,
  onIngresar,
}: {
  insumo: InsumoVista;
  indice: number;
  esLider: boolean;
  abierto: boolean;
  onAlternar: () => void;
  onIngresar: () => void;
}) {
  const { llenado, marcaMinimo } = tramoDeSaldo(i.saldo, i.minimo);
  const primero = loteMasAntiguoConSaldo(i.lotes);
  const lotes = [...i.lotes].sort((a, b) => a.ingreso.localeCompare(b.ingreso) || a.creadoEn.localeCompare(b.creadoEn));
  const detalle = [
    `${i.lotes.length} ${i.lotes.length === 1 ? "lote" : "lotes"}`,
    i.semanas !== null ? `alcanza ~${i.semanas.toLocaleString("es-PE", { maximumFractionDigits: 1 })} sem.` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 4 + indice }}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_auto_auto] items-center gap-x-5 gap-y-3 px-4 py-3.5 text-left outline-none focus-visible:bg-tinta/[0.03] max-sm:grid-cols-[1fr_auto]"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] text-tinta">{i.nombre}</p>
          <p className="truncate text-xs text-tinta/65">
            <span className="font-mono">{i.codigo}</span> · {detalle}
          </p>
        </div>
        <div className="max-sm:order-3 max-sm:col-span-2">
          <div className="relative h-2 rounded-full bg-sand" aria-hidden>
            <span className={`anim-crece-x absolute inset-y-0 left-0 block rounded-full ${COLOR_RIEL[i.estado.tono]}`} style={{ width: `${llenado * 100}%`, ["--i" as string]: indice }} />
            {marcaMinimo !== null && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-tinta" style={{ left: `${marcaMinimo * 100}%` }} title={`Mínimo ${cantidadTexto(i.minimo ?? 0, i.unidad)}`} />}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-tinta/65">
            <span>{i.minimo === null ? "sin mínimo definido" : `mínimo ${cantidadTexto(i.minimo, i.unidad)}`}</span>
            <Chip tono={TONO_ESTADO[i.estado.tono]}>{i.estado.etiqueta}</Chip>
          </div>
        </div>
        <p className="font-display whitespace-nowrap text-right text-2xl tabular-nums text-tinta">
          <CifraQueCuenta valor={i.saldo} formato="entero" />
          <small className="font-sans ml-1 text-xs text-tinta/65">{UNIDADES_INSUMO[i.unidad].corta}</small>
        </p>
        <ChevronRight aria-hidden className={`h-4 w-4 text-tinta/45 transition-transform duration-300 ease-cayla max-sm:hidden ${abierto ? "rotate-90" : ""}`} />
      </button>

      {/* Se abre por `grid-template-rows` (ADR-0128): sin medir alturas, sin salto. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-cayla ${abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-sand px-4 pb-3 pt-1.5">
            {lotes.length === 0 ? (
              <p className="py-3 text-sm text-tinta/65">Todavía no hay lotes de este insumo.</p>
            ) : (
              <ul>
                {lotes.map((l) => (
                  <li key={l.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-tinta/[0.06] py-2.5 text-[12.5px] last:border-0">
                    <span className="truncate font-mono font-medium text-tinta">{l.codigo ?? "s/c"}</span>
                    <div className="min-w-0">
                      <div className="h-1 overflow-hidden rounded-full bg-sand" aria-hidden>
                        <span className="anim-crece-x block h-full rounded-full bg-tinta" style={{ width: `${Math.max(0, Math.min(1, l.saldo / l.cantidadIngresada)) * 100}%` }} />
                      </div>
                      <p className="mt-1 truncate text-tinta/65">
                        {l.origen === "saldo_inicial" ? "saldo inicial" : "compra"} · {diaMes(l.ingreso)}
                        {l.documento ? ` · ${l.documento}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap tabular-nums text-tinta">
                      {cantidadTexto(l.saldo, i.unidad)} <span className="text-tinta/65">/ {cantidadTexto(l.cantidadIngresada, i.unidad)}</span>
                    </span>
                    <span className="flex min-w-[5.5rem] items-center justify-end gap-2 whitespace-nowrap tabular-nums text-tinta/75">
                      {esLider && l.costoUnitario !== null && soles(l.costoUnitario)}
                      {primero?.id === l.id && (
                        <span title="Se descuenta primero: el más antiguo con saldo">
                          <Chip tono="neutro">1º</Chip>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {esLider && (
              <div className="pt-2">
                <Boton peso="discreto" className="!px-3 !py-2" onClick={onIngresar}>
                  + Ingresar lote
                </Boton>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
