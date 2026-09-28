"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleHelp, Clock, Info, Layers, Search, Sprout, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";
import {
  FILTROS_ESTADO,
  FRASE_ENCABEZADO,
  FRASE_SIN_ELLA,
  QUIZA_MAS,
  TODAS_LAS_CATEGORIAS,
  agrupar,
  cifrasVista,
  consultaDe,
  detalleVista,
  enLaTabla,
  filaVista,
  filtrosDeUrl,
  grupoVista,
  hayFiltros,
  muchasSinTemporada,
  pasaFiltros,
  pieVista,
  textoRegistro,
  type AccesoFrescura,
  type ContextoFrescura,
  type FiltroEstado,
  type Filtros,
} from "@/lib/frescura-pantalla";
import type { FrescuraSede } from "@/lib/frescura-reglas";
import type { DatosFrescura } from "@/lib/frescura";
import { NivelChip } from "./piezas";
import { ANCHO_MINIMO_TABLA, FrescuraFila, PLANTILLA_FRESCURA } from "./FrescuraFila";
import { FrescuraDetalle } from "./FrescuraDetalle";
import { FrescuraTiendas } from "./FrescuraTiendas";

// Frescura del piso (ADR-0208, paso 4): cuánto lleva colgada cada prenda de la sede y qué tan rápido se vende, contra las
// demás de su categoría, y qué hacer con lo que se queda. Maqueta aprobada: `docs/maquetas/frescura-3c-2026-09/` (colores
// A, frases C). Orden de pantalla de Inventario (ADR-0220): cabecera con las cifras → filtros y tabla en UNA tarjeta →
// nota en hueso.
//
// Todo llega ya calculado del servidor (`getFrescuraPantalla` → `frescura-reglas.ts`); aquí solo se decide qué se ve. Los
// filtros y la prenda abierta viven en la URL (`?cat=&estado=&pordecidir=1&q=&prenda=`), escritos con
// `history.replaceState`: Next sincroniza `useSearchParams` sin volver a pedir la página (pedirla otra vez leería las tres
// tiendas de nuevo y abriría el loader por un cambio que no trae datos nuevos). Un enlace con esos parámetros abre
// exactamente lo mismo.

function escribirUrl(f: Filtros, prenda: string | null) {
  const qs = consultaDe(f, prenda);
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

const LISTA_PIE = 8;
const enLista = (xs: readonly string[]) => (xs.length <= LISTA_PIE ? xs.join(", ") : `${xs.slice(0, LISTA_PIE).join(", ")} y ${xs.length - LISTA_PIE} más`);

export function FrescuraPanel({ datos, acceso }: { datos: DatosFrescura; acceso: AccesoFrescura }) {
  const params = useSearchParams();
  const router = useRouter();
  const [verTiendas, setVerTiendas] = useState(false);
  const botonTiendas = useRef<HTMLButtonElement | null>(null);
  const filtros = filtrosDeUrl((k) => params.get(k));
  const prendaAbierta = params.get("prenda");

  const lectura = datos.lectura.datos;
  const sede: FrescuraSede | null = lectura && lectura.separaPiso ? lectura : null;

  const ctx: ContextoFrescura | null = useMemo(() => {
    if (!sede) return null;
    const caylaDatos = datos.cayla?.datos ?? null;
    return {
      sede: datos.sede.nombre,
      desde: sede.desde,
      ahora: sede.ahora,
      categorias: new Map(sede.categorias.map((c) => [c.categoriaId, c])),
      cayla: datos.cayla === null ? null : new Map((caylaDatos ?? []).map((c) => [c.categoriaId, c])),
      caylaFallo: datos.cayla?.fallo ?? null,
      temporadas: datos.temporadas,
      acceso,
    };
  }, [sede, datos, acceso]);

  const enTabla = useMemo(() => (sede ? sede.prendas.filter(enLaTabla) : []), [sede]);
  const visibles = enTabla.filter((p) => pasaFiltros(p, filtros));
  const muchasSin = muchasSinTemporada(enTabla);
  const cifras = sede ? cifrasVista(sede.cifras) : null;
  const pie = sede ? pieVista(sede.prendas) : null;
  const abierta = ctx && prendaAbierta ? (enTabla.find((p) => p.clave === prendaAbierta) ?? null) : null;

  const cambiar = (cambio: Partial<Filtros>) => escribirUrl({ ...filtros, ...cambio }, prendaAbierta);
  // Al cerrar la hoja, el foco vuelve a la fila que la abrió (también si se abrió desde un enlace con `?prenda=`).
  const volverA = useRef<HTMLElement | null>(null);
  const filaDe = (clave: string) => document.querySelector<HTMLElement>(`[data-prenda="${CSS.escape(clave)}"]`);
  const abrir = (clave: string | null) => {
    if (clave) volverA.current = filaDe(clave);
    escribirUrl(filtros, clave);
  };
  useEffect(() => {
    if (prendaAbierta && !volverA.current) volverA.current = filaDe(prendaAbierta);
  }, [prendaAbierta]);

  const registro = datos.registro?.datos ? textoRegistro(datos.registro.datos, datos.sede.id) : null;
  const porDecidirOtras = enTabla.filter((p) => !p.estado.quieta && p.estado.sugerencias.length > 0).length;

  // Las opciones de los combos (ADR-0209: sin <select>; Estado tiene 11 y trae buscador solo).
  const opcionesCategoria: Opcion<string>[] = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of enTabla) vistas.set(p.categoriaId, p.categoriaNombre);
    return [{ valor: TODAS_LAS_CATEGORIAS, texto: "Todas las categorías" }, ...[...vistas].map(([valor, texto]) => ({ valor, texto }))];
  }, [enTabla]);
  const opcionesEstado: Opcion<FiltroEstado>[] = FILTROS_ESTADO.map((f) => ({ valor: f.valor, texto: f.texto, ...("grupo" in f ? { grupo: f.grupo } : {}) }));

  // ---- La cabecera ----
  const pieCabecera = datos.esLider ? (
    // Angosto a propósito: a la derecha van las cuatro cifras; una línea larga las empujaba debajo del título.
    <p className="max-w-[30rem] text-[13px] leading-relaxed text-taupe">
      {datos.registro?.fallo ? (
        <>El registro al colgar no se pudo cargar.</>
      ) : registro ? (
        <>
          {registro.texto} {registro.nivel && registro.nivel !== "solido" && <NivelChip nivel={registro.nivel} />}
        </>
      ) : (
        <>Todavía no hay registro al colgar de esta sede.</>
      )}{" "}
      · Ventas a pedido: <b className="font-semibold text-tinta">sin datos todavía</b>
      {datos.tiendas && datos.tiendas.length > 1 && (
        <>
          {" "}
          ·{" "}
          <button ref={botonTiendas} type="button" onClick={() => setVerTiendas(true)} className="btn-cayla btn-enlace text-[13px]">
            Ver las {datos.tiendas.length} tiendas
          </button>
        </>
      )}
    </p>
  ) : undefined;

  const resumen = cifras && (
    <ResumenSede
      sede={datos.sede.nombre}
      cifras={[
        {
          valor: cifras.edad,
          nota: cifras.edadQuizaMas ? QUIZA_MAS : undefined,
          etiqueta: "días en el piso, en promedio",
          icono: Clock,
          titulo: `Promedio de lo colgado, sin clásicos ni las que no cuadran${cifras.edadQuizaMas ? ". Alguna prenda llegó sin fecha: el promedio también puede ser más" : ""}`,
        },
        {
          valor: cifras.pctNuevas,
          unidad: "%",
          etiqueta: "de lo medido es Nueva",
          icono: Sprout,
          titulo: `${cifras.nuevas} de ${cifras.conTramo} unidades que se pueden comparar con su categoría`,
        },
        {
          valor: cifras.porDecidir,
          etiqueta: "por decidir",
          icono: CircleHelp,
          alerta: true,
          alTocar: () => cambiar({ porDecidir: !filtros.porDecidir }),
          presionada: filtros.porDecidir,
          titulo: "Filtrar las que están por decidir",
        },
        { valor: cifras.unidades, etiqueta: "unidades en el piso", icono: Layers },
      ]}
    />
  );

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={datos.sede.nombre} titulo="Frescura del piso" subtitulo={FRASE_ENCABEZADO} pie={pieCabecera}>
        {resumen}
      </EncabezadoPagina>

      <section aria-label="Prendas por categoría" className="card-cayla overflow-hidden" data-resultados>
        {!sede ? (
          <EstadoSinLectura datos={datos} onReintentar={() => router.refresh()} />
        ) : (
          <>
            {/* Filtros: en la URL. */}
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-4 sm:px-5">
              <div className="caja-cayla relative flex h-10 min-w-0 flex-[1_1_220px] items-center sm:max-w-[340px]">
                <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
                <input
                  type="text"
                  value={filtros.q}
                  onChange={(e) => cambiar({ q: e.target.value })}
                  placeholder="Prenda, color o código"
                  aria-label="Buscar prenda, color o código"
                  autoComplete="off"
                  className="h-full w-full min-w-0 bg-transparent pl-9 pr-8 text-sm text-tinta outline-none placeholder:text-taupe"
                  onKeyDown={(e) => {
                    // Escape borra lo escrito; si no había nada, lo deja pasar (ADR-0136, useEscapeLibre).
                    if (e.key === "Escape" && filtros.q) {
                      e.stopPropagation();
                      cambiar({ q: "" });
                    }
                  }}
                />
                {filtros.q && (
                  <button type="button" aria-label="Borrar la búsqueda" onClick={() => cambiar({ q: "" })} className="absolute right-2 rounded p-1 text-taupe hover:text-tinta">
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Desplegable
                valor={filtros.cat}
                onValor={(cat) => cambiar({ cat })}
                opciones={opcionesCategoria}
                forma="caja"
                etiquetaAccesible="Categoría"
                className="w-full min-[480px]:w-52"
              />
              <Desplegable
                valor={filtros.estado}
                onValor={(estado) => cambiar({ estado })}
                opciones={opcionesEstado}
                forma="caja"
                etiquetaAccesible="Estado"
                className="w-full min-[480px]:w-56"
              />
              <button type="button" className="pildora-cayla" aria-pressed={filtros.porDecidir} onClick={() => cambiar({ porDecidir: !filtros.porDecidir })}>
                Por decidir <span className="font-medium tabular-nums">{cifras?.porDecidir ?? 0}</span>
              </button>
              {hayFiltros(filtros) && (
                <button type="button" className="btn-cayla btn-enlace text-[13px]" onClick={() => escribirUrl({ cat: TODAS_LAS_CATEGORIAS, estado: "todos", porDecidir: false, q: "" }, prendaAbierta)}>
                  Quitar filtros
                </button>
              )}
            </div>
            <p className="flex items-start gap-2 px-4 pb-3.5 text-[13px] text-taupe sm:px-5">
              <Info aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b className="font-semibold text-tinta">{FRASE_SIN_ELLA}</b> Los días cuentan solo el tiempo con alguna talla libre colgada.
              </span>
            </p>
            {muchasSin && (
              <p className="flex items-start gap-2 px-4 pb-3.5 text-[13px] text-taupe sm:px-5">
                <Info aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b className="font-semibold text-tinta">
                    {enTabla.filter((p) => p.estado.sinTemporada).length} de {enTabla.length} prendas no tienen temporada:
                  </b>{" "}
                  se miden igual, pero nunca van a avisar que pasó su estación.{" "}
                  {acceso.atributos && (
                    <Link href="/productos/atributos?tipo=temporadas&vista=completar" className="btn-cayla btn-enlace text-[13px]">
                      Complétalas en Catálogo
                    </Link>
                  )}
                </span>
              </p>
            )}

            {enTabla.length === 0 ? (
              <p className="border-t border-sand px-5 py-7 text-sm text-tinta/75">Todavía no hay prendas colgadas en {datos.sede.nombre}.</p>
            ) : visibles.length === 0 ? (
              <p className="border-t border-sand px-5 py-7 text-sm text-tinta/75">
                Ninguna prenda con estos filtros.{" "}
                <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => escribirUrl({ cat: TODAS_LAS_CATEGORIAS, estado: "todos", porDecidir: false, q: "" }, null)}>
                  Quitar filtros
                </button>
              </p>
            ) : (
              agrupar(visibles).map((g) => {
                const cab = grupoVista(g.categoriaId, g.nombre, ctx!);
                return (
                  <Fragment key={g.categoriaId}>
                    <div className="border-t border-sand px-4 pb-3 pt-4 sm:px-5">
                      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
                        <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">
                          {cab.nombre}
                          <span className="ml-1.5 font-sans text-[12.5px] font-medium text-taupe">
                            {g.prendas.length} {g.prendas.length === 1 ? "prenda" : "prendas"}
                          </span>
                        </h2>
                        <p className="min-w-0 flex-[1_1_100%] text-[13px] sm:flex-[1_1_420px] sm:text-[13.5px]">
                          {cab.comparacion} {cab.nivel && cab.nivel !== "solido" && <NivelChip nivel={cab.nivel} />}
                        </p>
                        {cab.escala.length > 0 && (
                          <p className="flex w-full flex-wrap gap-x-1 text-[11.5px] text-taupe">
                            {[
                              ...cab.escala.map((e) => (
                                <span key={e.nombre}>
                                  <b className="font-semibold text-tinta">{e.nombre}</b> {e.rango}
                                </span>
                              )),
                              ...(cab.base ? [<span key="base">{cab.base}</span>] : []),
                            ].map((trozo, i) => (
                              <Fragment key={i}>
                                {i > 0 && <span aria-hidden>·</span>}
                                {trozo}
                              </Fragment>
                            ))}
                          </p>
                        )}
                        {cab.cayla !== null && (
                          <p className="w-full text-[12.5px] text-taupe">
                            <b className="font-semibold text-tinta">Referencia de CAYLA:</b> {cab.cayla}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto [scrollbar-width:thin]">
                      <div className={ANCHO_MINIMO_TABLA}>
                        <div className={`encabezado-tabla-cayla hidden gap-x-3 px-5 py-2 text-[12.5px] text-taupe md:grid ${PLANTILLA_FRESCURA}`} role="presentation">
                          <span>Prenda</span>
                          <span>
                            Tallas<small className="block text-[10.5px] leading-tight">piso · almacén</small>
                          </span>
                          <span className="text-right">En el piso</span>
                          <span>Estado</span>
                          <span>
                            Rapidez<small className="block text-[10.5px] leading-tight">contra su categoría</small>
                          </span>
                          <span className="text-right">
                            Vendió<small className="block text-[10.5px] leading-tight">30 d en piso</small>
                          </span>
                          <span>Qué hacer</span>
                        </div>
                        <div>
                          {g.prendas.map((p) => (
                            <FrescuraFila key={p.clave} fila={filaVista(p, ctx!)} muchasSinTemporada={muchasSin} onAbrir={() => abrir(p.clave)} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand px-4 py-3 text-[12.5px] text-taupe sm:px-5">
              <span>
                Mostrando <b className="font-semibold text-tinta">{visibles.length}</b> de {enTabla.length} prendas ·{" "}
                {visibles.reduce((s, p) => s + p.pisoHoy, 0)} unidades en el piso
              </span>
              <span className="flex flex-wrap gap-x-3.5 gap-y-1">
                <span>
                  <span aria-hidden className="mr-1.5 inline-block h-3 w-0.5 rounded-sm bg-tinta/35 align-[-1px]" />
                  Por decidir
                </span>
                <span>
                  Tallas: piso · almacén · <b className="font-semibold text-tinta">ap.</b> apartadas
                </span>
              </span>
              {filtros.porDecidir && porDecidirOtras > 0 && (
                <span className="w-full">
                  <b className="font-semibold text-tinta">Otras {porDecidirOtras}</b> tienen una pregunta en «Qué hacer» sin estar por decidir.{" "}
                  <button type="button" className="btn-cayla btn-enlace text-[12.5px]" onClick={() => cambiar({ porDecidir: false })}>
                    Verlas todas
                  </button>
                </span>
              )}
              {pie && pie.guardadas.length > 0 && (
                <span className="w-full">Guardadas en el almacén después de colgarse (su reloj está en pausa): {enLista(pie.guardadas)}.</span>
              )}
              {pie && pie.nuncaColgadas.length > 0 && (
                <span className="w-full">Solo en el almacén, nunca colgadas: {enLista(pie.nuncaColgadas)}. No se miden hasta que se cuelguen.</span>
              )}
              {pie && pie.agotadas > 0 && (
                <span className="w-full">
                  {pie.agotadas} {pie.agotadas === 1 ? "prenda se agotó" : "prendas se agotaron"} en lo que mira esta pantalla: ya no están en la tienda.
                </span>
              )}
            </div>
          </>
        )}
      </section>

      <div className="nota-cayla space-y-1.5">
        <p>
          <b>Cómo se lee.</b> {FRASE_SIN_ELLA} La comparación es con lo vendido en esta tienda
          {datos.esLider ? "; la de CAYLA (todas las tiendas juntas) es solo de apoyo" : ""}. «Pocos datos» y «Aceptable» dicen cuánto creerle; sin
          etiqueta, es sólida. «Trasladar» solo aparece con una comparación sólida y algo en el almacén.
        </p>
        {cifras && (
          <p>
            <b>Las cifras de arriba.</b> Los días son el promedio de lo colgado, sin clásicos ni las que no cuadran. «% Nuevas» se cuenta sobre lo que se
            puede comparar ({cifras.nuevas} de {cifras.conTramo} unidades), no sobre todo el piso.
          </p>
        )}
        <p>
          <b>«Por decidir»</b> son las que llevan tiempo sin venderse o ya pasó su temporada; otras pueden tener una pregunta más chica en «Qué
          hacer». Todavía no hay dónde anotar lo que ya decidiste: la prenda sigue aquí mientras siga colgada.
        </p>
        <p>
          <b>Lo apartado para una clienta no está colgado:</b> no envejece ni recibe sugerencias, y cuenta como vendido. Lo que llegó sin fecha (carga
          inicial, un ajuste) nunca es «Nueva»: no se sabe cuándo llegó. Aquí no se rebaja: la rebaja se decide aparte.
        </p>
        <p>
          {datos.esLider
            ? "El registro al colgar, las otras tiendas y la referencia de CAYLA los ve solo el líder."
            : `El registro al colgar y la comparación con las otras tiendas los ve el líder: aquí se mide solo ${datos.sede.nombre}.`}
        </p>
      </div>

      {abierta && ctx && <FrescuraDetalle detalle={detalleVista(abierta, ctx)} sede={datos.sede.nombre} volverA={volverA} onClose={() => abrir(null)} />}
      {verTiendas && datos.tiendas && datos.registro && (
        <FrescuraTiendas tiendas={datos.tiendas} registro={datos.registro} actual={datos.sede.id} volverA={botonTiendas} onClose={() => setVerTiendas(false)} />
      )}
    </div>
  );
}

/** Sin lectura: el Taller (o una sede sin piso y almacén separados) o una lectura que falló. Cada caso dice qué pasa. */
function EstadoSinLectura({ datos, onReintentar }: { datos: DatosFrescura; onReintentar: () => void }) {
  if (datos.lectura.fallo)
    return (
      <div className="px-5 py-7 text-sm text-tinta/75" role="status">
        <p>{datos.lectura.fallo}</p>
        <button type="button" className="btn-cayla btn-secundario btn-chico mt-3" onClick={onReintentar}>
          Volver a intentar
        </button>
      </div>
    );
  return (
    <p className="px-5 py-7 text-sm text-tinta/75">
      {datos.sede.nombre} no tiene un piso de venta separado de su almacén: Frescura mide lo que está colgado en las tiendas.
      {datos.esLider ? " Elige una tienda en el selector de sede de arriba." : ""}
    </p>
  );
}
