"use client";

import { useState } from "react";
import { BarraAvance, type TonoBarraAvance } from "@/components/ui/BarraAvance";
import { ChevronRight, Layers, ArrowLeftRight } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import { diaLima, diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { IngresarInsumoModal } from "@/components/InsumoModales";
import { FichaDeLaTelaModal } from "@/components/insumos-taller/FichaDeLaTelaModal";
import { NuevaTelaModal } from "@/components/insumos-taller/NuevaTelaModal";
import { NuevoInsumoModal } from "@/components/insumos-taller/NuevoInsumoModal";
import type { ColorAlta } from "@/lib/alta-producto";
import { fichaDeLaTela, textoDeLaFicha, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import {
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  agruparPorTela,
  cantidadTexto,
  loteMasAntiguoConSaldo,
  textoDeCompra,
  textoDeMovimiento,
  tramoDeSaldo,
  type EstadoInsumo,
  type MaterialVista,
} from "@/lib/insumos-reglas";
import type { InsumoVista, InsumosDelTaller } from "@/lib/insumos";
import { Vacio } from "@/components/ui/Vacio";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Insumos del Taller (ADR-0133, F3): tela y avíos. Lo que hay por lote, cuánto dura y qué falta. El saldo es la suma del
// ledger, nunca un número que alguien edite; por eso el libro de movimientos solo se agrega, no se corrige. Los costos de
// cada lote los ve quien ve Producción parado en el Taller (Felipe, 2026-10-15, ADR-0400 actividad 6: `veCostos`); el CAPITAL
// total en insumos es una cifra del líder y ya no es de portada: se pide con un toque. Crear el catálogo, ingresar lotes y
// completar la ficha de una tela (tejido y color, de donde «Nueva orden» saca su sugerencia) siguen siendo del líder.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El tejido de una tela con su nombre (el del vocabulario de Catálogo); `null` si no se dijo. */
const vocabularioTejido = (v: VocabularioDeTelas, m: MaterialVista): string | null => (m.tejidoId ? (v.tejidos.find((t) => t.id === m.tejidoId)?.nombre ?? null) : null);

const TONO_ESTADO: Record<EstadoInsumo["tono"], TonoChip> = { sin_saldo: "rojo", bajo: "ambar", bien: "verde", sin_minimo: "neutro" };
// La barra de avance del sistema (ronda 13): en tinta; el rojo y el ámbar los pone el estado del insumo (sin saldo, bajo el mínimo).
const TONO_RIEL: Record<EstadoInsumo["tono"], TonoBarraAvance> = { sin_saldo: "rojo", bajo: "ambar", bien: "tinta", sin_minimo: "tinta" };

export function InsumosPanel({
  sede,
  datos,
  tallerId,
  esLider,
  veCostos,
  vocabulario,
  leyoVocabulario,
  colores,
  leyoColores,
}: {
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
  datos: InsumosDelTaller;
  tallerId: string;
  esLider: boolean;
  /** Quien ve Producción en el Taller ve el costo de cada lote (no el capital). */
  veCostos: boolean;
  vocabulario: VocabularioDeTelas;
  /** `false`: no se pudieron leer los tejidos y los colores; la ficha lo dice. */
  leyoVocabulario: boolean;
  /** La carta de colores de Catálogo, para «Nueva tela» (ADR-0554). */
  colores: ColorAlta[];
  leyoColores: boolean;
}) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [nuevo, setNuevo] = useState(false);
  // «Nueva tela»: abierta para crear una (`agregarA: null`) o para sumarle colores a una que ya existe.
  const [nuevaTela, setNuevaTela] = useState<{ agregarA: MaterialVista | null } | null>(null);
  const [ingresando, setIngresando] = useState<{ insumoId: string | null } | null>(null);
  const [fichando, setFichando] = useState<InsumoVista | null>(null);
  const [verCapital, setVerCapital] = useState(false);

  const { insumos, libro, capital } = datos;
  const bajos = insumos.filter((i) => i.estado.tono === "bajo" || i.estado.tono === "sin_saldo").length;
  const primeraTelaId = agruparPorTela(insumos.filter((i) => i.tipo === "tela"), datos.materiales).find((g) => g.material)?.material?.id ?? null;
  let indice = 0;

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede={sede}
        titulo="Insumos"
        subtitulo="Tela y avíos del Taller: lo que hay por lote, cuánto dura y qué pedir."
        acciones={
          datos.hayTelas || esLider ? (
            <>
              {/* Quien ve Producción en el Taller crea telas y colores (ADR-0554, decisión 3); el avío y el ingreso de un lote con su costo siguen siendo del líder. */}
              {datos.hayTelas && (
                <Boton peso={esLider ? "fantasma" : "primario"} data-guia="prod-insumos.nueva-tela" onClick={() => setNuevaTela({ agregarA: null })}>
                  + Nueva tela
                </Boton>
              )}
              {esLider && (
                <Boton peso="fantasma" data-guia="prod-insumos.nuevo" onClick={() => setNuevo(true)}>
                  {datos.hayTelas ? "+ Nuevo avío" : "+ Nuevo insumo"}
                </Boton>
              )}
              {esLider && (
                <Boton peso="primario" data-guia="prod-insumos.ingresar" onClick={() => setIngresando({ insumoId: null })} disabled={insumos.length === 0}>
                  Ingresar insumo
                </Boton>
              )}
            </>
          ) : undefined
        }
      />

      {/* ==================== cifras ==================== */}
      <div data-guia="prod-insumos.cifras" className="grid gap-3 sm:grid-cols-2">
        <TarjetaCifra
          punto={bajos > 0 ? "ambar" : "verde"}
          etiqueta="Bajo el mínimo"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={bajos} alMontar />}
          detalleTono={bajos > 0 ? "text-ambar-profundo" : "text-verde-profundo"}
        >
          {bajos > 0 ? "hay que pedir o esperar lo que viene" : "todo sobre el mínimo"}
        </TarjetaCifra>
        <TarjetaCifra punto="verde" etiqueta="Insumos" className="anim-entra" style={{ ["--i" as string]: 1 }} valor={<CifraQueCuenta valor={insumos.length} alMontar />}>
          {plural(insumos.filter((i) => i.tipo === "tela").length, "tela", "telas")} · {plural(insumos.filter((i) => i.tipo === "avio").length, "avío", "avíos")}
        </TarjetaCifra>
      </div>
      {/* El capital en insumos es dinero que el líder mira cuando lo necesita, no la primera cifra de la pantalla del Taller: se pide con un toque. */}
      {esLider && capital !== null && (
        <div data-guia="prod-insumos.capital" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tinta/75">
          {verCapital ? (
            <>
              <span>
                Capital en insumos: <b className="font-display text-lg tabular-nums text-tinta">{soles(capital)}</b> · a costo de cada lote
              </span>
              <button type="button" className="btn-enlace text-xs" onClick={() => setVerCapital(false)}>
                Ocultar
              </button>
            </>
          ) : (
            <button type="button" className="btn-enlace" onClick={() => setVerCapital(true)}>
              Ver el capital en insumos
            </button>
          )}
        </div>
      )}

      {insumos.length === 0 ? (
        <div className="card-cayla">
          <Vacio
            guia="prod-insumos.lista"
            icono={<Layers />}
            titulo="Todavía no hay insumos"
            acciones={
              datos.hayTelas || esLider ? (
                <Boton peso="primario" onClick={() => (datos.hayTelas ? setNuevaTela({ agregarA: null }) : setNuevo(true))}>
                  {datos.hayTelas ? "Crear la primera tela" : "Agregar el primero"}
                </Boton>
              ) : null
            }
          >
            Aquí se lleva la tela y los avíos del Taller: lo que entra por lote, lo que sale al cortar y lo que queda.{" "}
            {datos.hayTelas ? "Empieza con tu primera tela y todos sus colores, en una sola hoja." : esLider ? "Empieza agregando un insumo al catálogo; después ingresa su primer lote." : "El líder tiene que cargar el catálogo primero."}
          </Vacio>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div data-guia="prod-insumos.lista" className="space-y-6">
            {TIPOS_INSUMO.map((t) => {
              const lista = insumos.filter((i) => i.tipo === t.valor);
              if (lista.length === 0) return null;
              return (
                <section key={t.valor} className="space-y-2.5">
                  <TituloSeccion dato={t.ayuda}>{t.plural}</TituloSeccion>
                  {agruparPorTela(lista, datos.materiales).map((g) => (
                    <div key={g.material?.id ?? g.insumos[0].id} className="space-y-2.5">
                      {/* Cada tela con sus colores debajo: lo de la tela (código, tejido, cómo se compra) se dice una vez. */}
                      {g.material && (
                        <div data-guia={g.material.id === primeraTelaId ? "prod-insumos.tela" : undefined} className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-1.5">
                          <TituloGrupo cuenta={g.insumos.length} nota={[g.material.codigo, vocabularioTejido(vocabulario, g.material), g.material.composicion, textoDeCompra(g.material)].filter(Boolean).join(" · ")}>
                            {g.material.nombre}
                          </TituloGrupo>
                          {t.valor === "tela" && (
                            <button type="button" className="btn-enlace text-xs" data-guia={g.material.id === primeraTelaId ? "prod-insumos.agregar-colores" : undefined} onClick={() => setNuevaTela({ agregarA: g.material })}>
                              + Agregar colores
                            </button>
                          )}
                        </div>
                      )}
                      {g.insumos.map((i) => (
                        <FilaInsumo
                          key={i.id}
                          insumo={i}
                          indice={indice++}
                          esLider={esLider}
                          veCostos={veCostos}
                          vocabulario={vocabulario}
                          abierto={!!abiertos[i.id]}
                          onAlternar={() => setAbiertos((a) => ({ ...a, [i.id]: !a[i.id] }))}
                          onIngresar={() => setIngresando({ insumoId: i.id })}
                          onFicha={() => setFichando(i)}
                        />
                      ))}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>

          {/* ==================== libro de movimientos ==================== */}
          <aside data-guia="prod-insumos.libro" className="card-cayla anim-entra p-4" style={{ ["--i" as string]: 3 }} aria-label="Libro de movimientos">
            <TituloSeccion>Libro de movimientos</TituloSeccion>
            <p className="mb-2 text-xs text-tinta/65">Solo se agrega: nada se edita ni se borra.</p>
            {libro.length === 0 ? (
              <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<ArrowLeftRight />}>Todavía no se movió nada.</Vacio>
            ) : (
              <ul className="divide-y divide-tinta/10">
                {libro.map((m) => {
                  const entra = m.tipo === "compra" || m.tipo === "devolucion" || (m.tipo === "ajuste" && m.cantidad > 0);
                  return (
                    <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 text-[13px]">
                      <div className="min-w-0">
                        <p className="text-tinta">{textoDeMovimiento(m)}</p>
                        <p className="truncate text-xs text-tinta/65">
                          {[m.insumo, m.orden, m.lote].filter(Boolean).join(" · ")} · {diaMes(diaLima(m.creadoEn))}
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

      {nuevo && <NuevoInsumoModal existentes={insumos.map((i) => ({ codigo: i.codigo, nombre: i.nombre }))} vocabulario={vocabulario} leyoVocabulario={leyoVocabulario} soloAvios={datos.hayTelas} onClose={() => setNuevo(false)} />}
      {nuevaTela && (
        <NuevaTelaModal
          key={nuevaTela.agregarA?.id ?? "nueva"}
          tallerId={tallerId}
          materiales={datos.materiales}
          vocabulario={vocabulario}
          leyoVocabulario={leyoVocabulario}
          colores={colores}
          leyoColores={leyoColores}
          puedeSaldo={esLider}
          agregarA={nuevaTela.agregarA}
          coloresDeLaTela={insumos.filter((i) => i.materialId && i.materialId === nuevaTela.agregarA?.id && i.colorCodigo).map((i) => i.colorCodigo as string)}
          alElegirExistente={(m) => setNuevaTela({ agregarA: m })}
          onClose={() => setNuevaTela(null)}
        />
      )}
      {fichando && <FichaDeLaTelaModal insumo={fichando} vocabulario={vocabulario} leyo={leyoVocabulario} onClose={() => setFichando(null)} />}
      {ingresando && <IngresarInsumoModal insumos={insumos} insumoInicialId={ingresando.insumoId} tallerId={tallerId} onClose={() => setIngresando(null)} />}
    </div>
  );
}

function FilaInsumo({
  insumo: i,
  indice,
  esLider,
  veCostos,
  vocabulario,
  abierto,
  onAlternar,
  onIngresar,
  onFicha,
}: {
  insumo: InsumoVista;
  indice: number;
  esLider: boolean;
  veCostos: boolean;
  vocabulario: VocabularioDeTelas;
  abierto: boolean;
  onAlternar: () => void;
  onIngresar: () => void;
  onFicha: () => void;
}) {
  const { llenado, marcaMinimo } = tramoDeSaldo(i.saldo, i.minimo);
  const primero = loteMasAntiguoConSaldo(i.lotes);
  const lotes = [...i.lotes].sort((a, b) => a.ingreso.localeCompare(b.ingreso) || a.creadoEn.localeCompare(b.creadoEn));
  const ficha = fichaDeLaTela(i, vocabulario);
  const detalle = [
    `${i.lotes.length} ${i.lotes.length === 1 ? "lote" : "lotes"}`,
    i.semanas !== null ? `alcanza ~${i.semanas.toLocaleString("es-PE", { maximumFractionDigits: 1 })} sem.` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article data-guia="prod-insumos.fila" className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 4 + indice }}>
      <button
        type="button"
        data-guia={indice === 0 ? "prod-insumos.fila-cabecera" : undefined}
        onClick={onAlternar}
        aria-expanded={abierto}
        className="grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_auto_auto] items-center gap-x-5 gap-y-3 px-4 py-3.5 text-left outline-none focus-visible:bg-tinta/[0.03] max-sm:grid-cols-[1fr_auto]"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] text-tinta">{i.nombre}</p>
          <p className="truncate text-xs text-tinta/65">
            <span className="font-mono">{i.codigo}</span> · {detalle}
          </p>
          {/* La ficha: de qué tejido y de qué color es. Sin ella «Nueva orden» no puede proponer la tela del color de la prenda. */}
          <p data-guia={indice === 0 ? "prod-insumos.ficha" : undefined} className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-tinta/75">
            {ficha.color && <span aria-hidden data-color-dato className="size-2.5 shrink-0 rounded-full border border-tinta/20" style={ficha.color.hex ? { backgroundColor: ficha.color.hex } : undefined} />}
            <span className={`truncate ${ficha.tejido === null && ficha.color === null ? "text-tinta/70" : ""}`}>{textoDeLaFicha(ficha, i.tipo)}</span>
          </p>
        </div>
        <div className="max-sm:order-3 max-sm:col-span-2">
          <BarraAvance pct={llenado * 100} tono={TONO_RIEL[i.estado.tono]} marca={marcaMinimo !== null ? marcaMinimo * 100 : null} decorativa indice={indice} title={marcaMinimo !== null ? `Mínimo ${cantidadTexto(i.minimo ?? 0, i.unidad)}` : undefined} />
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
              <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Layers />}>Todavía no hay lotes de este insumo.</Vacio>
            ) : (
              <ul>
                {lotes.map((l) => (
                  <li key={l.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-tinta/[0.06] py-2.5 text-[12.5px] last:border-0">
                    <span className="truncate font-mono font-medium text-tinta">{l.codigo ?? "s/c"}</span>
                    <div className="min-w-0">
                      <BarraAvance pct={(l.saldo / l.cantidadIngresada) * 100} alto="fina" tono="tinta" decorativa />
                      <p className="mt-1 truncate text-tinta/65">
                        {l.origen === "saldo_inicial" ? "saldo inicial" : "compra"} · {diaMes(l.ingreso)}
                        {l.documento ? ` · ${l.documento}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap tabular-nums text-tinta">
                      {cantidadTexto(l.saldo, i.unidad)} <span className="text-tinta/65">/ {cantidadTexto(l.cantidadIngresada, i.unidad)}</span>
                    </span>
                    <span className="flex min-w-[5.5rem] items-center justify-end gap-2 whitespace-nowrap tabular-nums text-tinta/75">
                      {veCostos && l.costoUnitario !== null && soles(l.costoUnitario)}
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
              <div className="flex flex-wrap gap-2 pt-2">
                <Boton peso="discreto" className="!px-3 !py-2" onClick={onIngresar}>
                  + Ingresar lote
                </Boton>
                {/* El tejido y el color de un color de tela son los de su tela (ADR-0554): no se completan aquí. */}
                {!i.materialId && (
                  <Boton peso="discreto" className="!px-3 !py-2" data-guia={indice === 0 ? "prod-insumos.editar-ficha" : undefined} onClick={onFicha}>
                    {ficha.completa ? "Editar la ficha" : i.tipo === "tela" ? "Completar tejido y color" : "Completar el color"}
                  </Boton>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
