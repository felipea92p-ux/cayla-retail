"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Info, Layers, Search, Shirt, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";
import {
  FILTROS_ESTADO,
  SIN_FILTROS,
  TODAS_LAS_CATEGORIAS,
  accionDeFila,
  agrupar,
  avisoPocasVentas,
  cifrasVista,
  consultaDe,
  fraseEncabezado,
  detalleVista,
  enLaTabla,
  filaVista,
  filtrosDeUrl,
  grupoVista,
  hayFiltros,
  pasaFiltros,
  pieVista,
  tableroVista,
  textoOtrasConPregunta,
  textoRegistro,
  textoRespaldoCayla,
  textoSinTemporada,
  textoUnidades,
  vistaDeEntrada,
  type AccesoFrescura,
  type ContextoFrescura,
  type FiltroEstado,
  type GrupoVista,
  type Filtros,
} from "@/lib/frescura-pantalla";
import type { FrescuraSede } from "@/lib/frescura-reglas";
import type { DatosFrescura } from "@/lib/frescura";
import { plazoDeAccion, type AccionDecision } from "@/lib/frescura-decisiones-reglas";
import { bloqueDeDecision, filaDeDecision, notaDelMes } from "@/lib/frescura-decisiones-pantalla";
import { useAnotarDecision } from "./useAnotarDecision";
import { TextoConNegritas } from "./piezas";
import { FrescuraComoSeLee } from "./FrescuraComoSeLee";
import { ANCHO_MINIMO_TABLA, FrescuraFila, PLANTILLA_FRESCURA } from "./FrescuraFila";
import { FrescuraDetalle, type ContextoDecision } from "./FrescuraDetalle";
import { FrescuraTablero } from "./FrescuraTablero";
import { FrescuraTiendas } from "./FrescuraTiendas";

// Frescura del piso (ADR-0208, paso 4): cuánto lleva colgada cada prenda de la sede y qué tan rápido se vende, contra las
// demás de su categoría, y qué hacer con lo que se queda. Maqueta aprobada: `docs/maquetas/frescura-3c-2026-09/` (colores
// A, frases C). Orden de pantalla de Inventario (ADR-0220): cabecera con las cifras → filtros y tabla en UNA tarjeta →
// nota en hueso.
//
// Todo llega ya calculado del servidor (`getFrescuraPantalla` → `frescura-reglas.ts`); aquí solo se decide qué se ve. Los
// filtros y la prenda abierta viven en el ESTADO del panel y se copian a la URL (`?cat=&estado=&pordecidir=1&q=&prenda=`)
// con `history.replaceState`, como MovimientosLista: la URL se lee UNA vez, al abrir, y después solo se escribe. Así un
// enlace abre exactamente lo mismo, cambiar un filtro no vuelve a pedir la página (leería las tres tiendas de nuevo y
// abriría el loader) y el buscador no depende de que Next le devuelva lo escrito: cuando lo leía de la URL, el espacio de
// «blusa wayra» se perdía al recortarse y el cursor saltaba al final (corrección del paso 4).

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
  const [comoSeLee, setComoSeLee] = useState(false);
  const botonTiendas = useRef<HTMLButtonElement | null>(null);
  const [pedidos, setPedidos] = useState<Filtros>(() => filtrosDeUrl((k) => params.get(k)));
  const [prendaAbierta, setPrendaAbierta] = useState<string | null>(() => params.get("prenda"));
  // Con qué se abre la hoja: el detalle, o directo «Ya decidí» con una opción marcada (el botón de la fila que no pudo anotar a
  // un toque porque falta elegir quién anota, o que pide elegir entre varias opciones).
  const [hojaPedida, setHojaPedida] = useState<{ modo: "detalle" | "decidir"; opcion: AccionDecision | null }>({ modo: "detalle", opcion: null });
  // EL camino para anotar lo decidido (la hoja usa el suyo, igual): el botón «La cambié de lugar» de la fila anota a un toque.
  const anotador = useAnotarDecision({ id: datos.sede.id, nombre: datos.sede.nombre });

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
  // El tablero por categoría (nivel 1): se arma con TODAS las prendas de la tabla, no con las filtradas, para que no cambie al tocarlo.
  const tablero = useMemo(() => (ctx ? tableroVista(enTabla, ctx) : []), [enTabla, ctx]);
  // Las prendas sin temporada se dicen UNA vez, dentro de «¿Cómo se lee esto?» (es una tarea de Catálogo, no un aviso de Frescura).
  const sinTemporada = textoSinTemporada(enTabla);
  // Lo aproximado se dice UNA vez arriba cuando es la regla (TRU: 4 ventas en 120 días); si es la excepción, cada fila lo marca.
  const avisoPocas = ctx ? avisoPocasVentas(enTabla, datos.sede.nombre) : null;
  const cifras = sede ? cifrasVista(sede.cifras) : null;
  const pie = sede ? pieVista(sede.prendas) : null;
  const abierta = ctx && prendaAbierta ? (enTabla.find((p) => p.clave === prendaAbierta) ?? null) : null;

  // Las opciones de los combos (ADR-0209: sin <select>; Estado tiene 11 y trae buscador solo).
  const opcionesCategoria: Opcion<string>[] = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of enTabla) vistas.set(p.categoriaId, p.categoriaNombre);
    return [{ valor: TODAS_LAS_CATEGORIAS, texto: "Todas las categorías" }, ...[...vistas].map(([valor, texto]) => ({ valor, texto }))];
  }, [enTabla]);
  const opcionesEstado: Opcion<FiltroEstado>[] = FILTROS_ESTADO.map((f) => ({ valor: f.valor, texto: f.texto, ...("grupo" in f ? { grupo: f.grupo } : {}) }));

  // Una categoría que no está en la tabla (un enlace viejo, o la otra sede del selector con `?cat=` puesto) es «todas»:
  // si no, el combo decía «Elegir» —que en todo el sistema es «falta elegir»— y la tabla salía vacía sin explicar por qué.
  // El próximo cambio de filtro la borra de la URL.
  const filtros: Filtros = opcionesCategoria.some((o) => o.valor === pedidos.cat) ? pedidos : { ...pedidos, cat: TODAS_LAS_CATEGORIAS };
  // Lo por decidir va PRIMERO si la persona no pidió otra cosa (Formidable, ley 2): «Ver todas» lo suelta, a un toque.
  const { primeroLoDecidible, efectivos } = vistaDeEntrada(filtros, cifras?.porDecidir ?? 0);
  const visibles = enTabla.filter((p) => pasaFiltros(p, efectivos));

  const cambiar = (cambio: Partial<Filtros>) => {
    const f = { ...filtros, ...cambio };
    setPedidos(f);
    escribirUrl(f, prendaAbierta);
  };
  const quitarFiltros = (prenda: string | null) => {
    setPedidos(SIN_FILTROS);
    setPrendaAbierta(prenda);
    escribirUrl(SIN_FILTROS, prenda);
  };
  // Al cerrar la hoja, el foco vuelve a la fila que la abrió (también si se abrió desde un enlace con `?prenda=`).
  const volverA = useRef<HTMLElement | null>(null);
  const filaDe = (clave: string) => document.querySelector<HTMLElement>(`[data-prenda="${CSS.escape(clave)}"]`);
  const abrir = (clave: string | null, modo: "detalle" | "decidir" = "detalle", opcion: AccionDecision | null = null) => {
    if (clave) volverA.current = filaDe(clave);
    setHojaPedida({ modo, opcion });
    setPrendaAbierta(clave);
    escribirUrl(filtros, clave);
  };
  // El botón de la fila que anota (`accionDeFila`, tipo `anotar`): a un toque si ya se sabe quién anota; si no, la hoja con la
  // opción ya marcada, que pide lo que falta. Sin la libreta leída no se anota ni se abre «Ya decidí» (la base compararía con una
  // última línea que no se sabe): `accionDeFila` ya no ofrece el botón, y por si acaso, aquí se abre el detalle.
  const anotarDesdeFila = (p: (typeof enTabla)[number], accion: AccionDecision, verbo: string) => {
    if (!ctx || !decisionesOk) {
      abrir(p.clave, "detalle");
      return;
    }
    if (!anotador.responsable.listo) {
      abrir(p.clave, "decidir", accion);
      return;
    }
    void anotador.anotar({
      prenda: p,
      anteriorId: p.decision?.actual.id ?? null,
      accion,
      plazoDias: plazoDeAccion(accion, ctx.categorias.get(p.categoriaId), ctx.cayla?.get(p.categoriaId)),
      transferenciaId: null,
      nota: null,
      verbo,
    });
  };
  // El error de anotar desde la fila se pinta junto a SU botón (`FrescuraFila`); «Ver» (otra persona anotó antes) refresca la lectura.
  const limpiarErrorDeFila = () => {
    const conVer = anotador.error?.conVer ?? false;
    anotador.limpiarError();
    if (conVer) router.refresh();
  };
  useEffect(() => {
    if (prendaAbierta && !volverA.current) volverA.current = filaDe(prendaAbierta);
  }, [prendaAbierta]);

  const registro = datos.registro?.datos ? textoRegistro(datos.registro.datos, datos.sede.id) : null;
  const gruposDeLectura: GrupoVista[] = ctx ? agrupar(enTabla).map((g) => grupoVista(g.categoriaId, g.nombre, ctx)) : [];
  // Las que no están «por decidir» pero traen una pregunta más chica en «Qué hacer»; las que ya tienen una decisión vigente no
  // preguntan nada: ya se contestó.
  const porDecidirOtras = enTabla.filter((p) => !p.porDecidir && !(p.decision?.vigente ?? false) && p.estado.sugerencias.length > 0).length;
  // Lo decidido (paso 4b): si no se pudo leer, «Por decidir» es «quieta» y la sede lo dice; sin eso no se sabe cuál es la última
  // línea de cada libreta, así que «Ya decidí» se esconde.
  const decisionesOk = sede?.decisiones.estado === "ok";
  const notasDelMes = sede && sede.decisiones.estado === "ok" ? notaDelMes(sede.decisiones.resumen, datos.sede.nombre) : [];
  const contextoDecision: ContextoDecision | null =
    abierta && sede && ctx
      ? {
          prenda: abierta,
          sede: { id: datos.sede.id, nombre: datos.sede.nombre },
          esLider: datos.esLider,
          ahora: sede.ahora,
          categoria: ctx.categorias.get(abierta.categoriaId),
          cayla: ctx.cayla?.get(abierta.categoriaId),
          recientes: sede.decisiones.estado === "ok" ? sede.decisiones.trasladosRecientes : [],
          acceso,
          lecturaOk: decisionesOk,
          bloque: bloqueDeDecision(abierta.decision, abierta.categoriaNombre, datos.sede.nombre, sede.ahora),
          anteriorId: abierta.decision?.actual.id ?? null,
          vigenteId: abierta.decision?.vigente ? abierta.decision.actual.id : null,
        }
      : null;

  // ---- La cabecera ----
  // Solo el atajo a las otras tiendas (líder). El registro al colgar y «Ventas a pedido» (que aún no tiene dato) ya no ocupan la cabecera:
  // el registro vive en «¿Cómo se lee esto?».
  const pieCabecera =
    datos.esLider && datos.tiendas && datos.tiendas.length > 1 ? (
      <p className="max-w-[30rem] text-[13px] leading-relaxed text-taupe">
        <button ref={botonTiendas} type="button" onClick={() => setVerTiendas(true)} className="btn-cayla btn-enlace inline-flex min-h-7 items-center text-[13px]">
          Ver las {datos.tiendas.length} tiendas
        </button>
      </p>
    ) : undefined;

  // Dos datos neutros. «Por decidir» NO es una cifra aparte: lo dice la frase de arriba y lo filtra la píldora de abajo (una sola vez).
  const resumen = cifras && (
    <ResumenSede
      sede={datos.sede.nombre}
      cifras={[
        { valor: enTabla.length, etiqueta: enTabla.length === 1 ? "prenda colgada" : "prendas colgadas", icono: Shirt },
        { valor: cifras.unidades, etiqueta: `${cifras.unidades === 1 ? "unidad" : "unidades"} en el piso`, icono: Layers },
      ]}
    />
  );

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={datos.sede.nombre} titulo="Frescura del piso" subtitulo={<TextoConNegritas texto={fraseEncabezado(cifras ? cifras.porDecidir : null, avisoPocas !== null)} />} pie={pieCabecera}>
        {resumen}
      </EncabezadoPagina>

      <section aria-label="Prendas por categoría" className="card-cayla overflow-hidden" data-resultados>
        {!sede ? (
          <EstadoSinLectura datos={datos} onReintentar={() => router.refresh()} />
        ) : (
          <>
            {/* Nivel 1: el tablero por categoría; tocar una fila filtra la lista (con `cat` en la URL, como el combo). */}
            <FrescuraTablero filas={tablero} elegida={filtros.cat === TODAS_LAS_CATEGORIAS ? null : filtros.cat} onElegir={(cat) => cambiar({ cat: cat ?? TODAS_LAS_CATEGORIAS })} />
            {/* Filtros: en el estado del panel, copiados a la URL. */}
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-4 sm:px-5">
              <div className="caja-cayla relative flex h-10 min-w-0 flex-[1_1_220px] items-center sm:max-w-[340px]">
                <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
                <input
                  type="text"
                  value={filtros.q}
                  maxLength={80}
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
              {/* Apagar «Por decidir» es pedir ver todas (`todas`): si no, la vista de entrada lo volvería a poner. */}
              <button
                type="button"
                className="pildora-cayla"
                aria-pressed={efectivos.porDecidir}
                onClick={() => cambiar(efectivos.porDecidir ? { porDecidir: false, todas: true } : { porDecidir: true, decididas: false, todas: false })}
              >
                Por decidir <span className="font-medium tabular-nums">{cifras?.porDecidir ?? 0}</span>
              </button>
              {decisionesOk && (
                <button type="button" className="pildora-cayla" aria-pressed={filtros.decididas} onClick={() => cambiar({ decididas: !filtros.decididas, porDecidir: false, todas: false })}>
                  Decididas <span className="font-medium tabular-nums">{cifras?.decididas ?? 0}</span>
                </button>
              )}
              {hayFiltros(filtros) && (
                <button type="button" className="btn-cayla btn-enlace text-[13px]" onClick={() => quitarFiltros(prendaAbierta)}>
                  Quitar filtros
                </button>
              )}
              <button
                type="button"
                className="btn-cayla btn-enlace ml-auto inline-flex min-h-7 items-center text-[13px]"
                aria-expanded={comoSeLee}
                aria-controls="frescura-como-se-lee"
                onClick={() => setComoSeLee((v) => !v)}
              >
                ¿Cómo se lee esto?
                <ChevronDown aria-hidden strokeWidth={1.8} className={`ml-1 h-3.5 w-3.5 transition-transform ${comoSeLee ? "rotate-180" : ""}`} />
              </button>
            </div>
            {comoSeLee && (
              <FrescuraComoSeLee
                id="frescura-como-se-lee"
                grupos={gruposDeLectura}
                esLider={datos.esLider}
                registro={registro}
                registroFallo={Boolean(datos.registro?.fallo)}
                notasDelMes={notasDelMes}
                respaldo={textoRespaldoCayla(datos.respaldoCayla)}
                sinTemporada={sinTemporada === null ? null : { texto: sinTemporada, href: acceso.atributos ? "/productos/atributos?tipo=temporadas&vista=completar" : null }}
              />
            )}
            {avisoPocas && (
              <p role="status" className="flex items-start gap-2 px-4 pb-3.5 text-[13px] text-taupe sm:px-5">
                <Info aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <TextoConNegritas texto={avisoPocas} />
                </span>
              </p>
            )}
            {sede.decisiones.estado === "sin_lectura" && sede.decisiones.aviso && (
              <p role="status" className="mx-4 mb-3.5 flex items-start gap-2 rounded-xl bg-hueso/85 px-3 py-2.5 text-[13px] leading-normal sm:mx-5">
                <Info aria-hidden strokeWidth={1.6} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{sede.decisiones.aviso}</span>
              </p>
            )}

            {primeroLoDecidible && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-sand px-4 py-3 sm:px-5">
                <span className="text-sm font-semibold text-tinta">
                  Esperan tu decisión <span className="font-medium tabular-nums text-taupe">· {visibles.length}</span>
                </span>
                <button type="button" className="btn-cayla btn-enlace inline-flex min-h-7 items-center text-[13.5px]" onClick={() => cambiar({ todas: true })}>
                  Ver todas las prendas ({enTabla.length})
                </button>
              </div>
            )}
            {enTabla.length === 0 ? (
              <p className="border-t border-sand px-5 py-7 text-sm text-tinta/75">
                <b className="font-semibold text-tinta">Todavía no hay prendas colgadas en {datos.sede.nombre}.</b> Cuando bajes mercadería al piso desde Existencias, la verás aquí con su estado.
              </p>
            ) : visibles.length === 0 ? (
              <p className="border-t border-sand px-5 py-7 text-sm text-tinta/75">
                {filtros.porDecidir && !hayFiltros({ ...filtros, porDecidir: false }) ? (
                  <>
                    <b className="font-semibold text-tinta">{avisoPocas === null ? "Nada por decidir: todo en orden." : "Nada por decidir por ahora."}</b> Las prendas que lleven mucho tiempo sin venderse aparecerán aquí.{" "}
                    <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => cambiar({ porDecidir: false, todas: true })}>
                      Ver todas las prendas
                    </button>
                  </>
                ) : filtros.decididas && !hayFiltros({ ...filtros, decididas: false }) ? (
                  <>
                    <b className="font-semibold text-tinta">Todavía no anotaste ninguna decisión.</b> Cuando decidas qué hacer con una prenda, la verás aquí con cómo le va.{" "}
                    <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => quitarFiltros(null)}>
                      Quitar filtros
                    </button>
                  </>
                ) : (
                  <>
                    Ninguna prenda con estos filtros.{" "}
                    <button type="button" className="btn-cayla btn-enlace text-sm" onClick={() => quitarFiltros(null)}>
                      Quitar filtros
                    </button>
                  </>
                )}
              </p>
            ) : (
              agrupar(visibles).map((g) => {
                                return (
                  <Fragment key={g.categoriaId}>
                    <div className="border-t border-sand px-4 pb-3 pt-4 sm:px-5">
                      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
                        <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">
                          {g.nombre}
                          <span className="ml-1.5 font-sans text-[12.5px] font-medium text-taupe">
                            {g.prendas.length} {g.prendas.length === 1 ? "prenda" : "prendas"}
                          </span>
                        </h2>
                      </div>
                    </div>
                    <div className="overflow-x-auto [scrollbar-width:thin]">
                      <div className={ANCHO_MINIMO_TABLA}>
                        <div className={`encabezado-tabla-cayla hidden gap-x-4 px-5 py-2 text-[12.5px] text-taupe md:grid ${PLANTILLA_FRESCURA}`} role="presentation">
                          <span>Prenda</span>
                          <span>Estado</span>
                          <span>Qué hacer</span>
                          <span />
                        </div>
                        <div>
                          {g.prendas.map((p) => (
                            <FrescuraFila
                              key={p.clave}
                              fila={filaVista(p, ctx!)}
                              onAbrir={() => abrir(p.clave)}
                              decision={filaDeDecision(p.decision, p.categoriaNombre, datos.sede.nombre)}
                              marcarAproximado={avisoPocas === null}
                              apariencia={datos.apariencias[p.clave] ?? null}
                              categoria={datos.categoriasVisuales[p.categoriaId] ?? null}
                              accion={accionDeFila(p, ctx!, p.decision?.vigente ?? false, decisionesOk)}
                              enviando={anotador.enviando === p.clave}
                              error={anotador.error?.clave === p.clave ? anotador.error : null}
                              onAnotar={(accion, verbo) => anotarDesdeFila(p, accion, verbo)}
                              onDecidir={(modo, opcion) => abrir(p.clave, modo, opcion)}
                              onLimpiarError={limpiarErrorDeFila}
                            />
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
                Mostrando <b className="font-semibold text-tinta">{visibles.length}</b> de {enTabla.length} {enTabla.length === 1 ? "prenda" : "prendas"} ·{" "}
                {textoUnidades(visibles.reduce((s, p) => s + p.pisoHoy, 0))} en el piso
              </span>
              {efectivos.porDecidir && porDecidirOtras > 0 && (
                <span className="w-full">
                  <TextoConNegritas texto={textoOtrasConPregunta(porDecidirOtras)} />{" "}
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

      {abierta && ctx && contextoDecision && (
        <FrescuraDetalle
          key={abierta.clave}
          detalle={detalleVista(abierta, ctx)}
          sede={datos.sede.nombre}
          volverA={volverA}
          onClose={() => abrir(null)}
          decision={contextoDecision}
          modoInicial={hojaPedida.modo}
          opcionInicial={hojaPedida.opcion}
        />
      )}
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
