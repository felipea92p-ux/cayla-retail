"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Info, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
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
  resumenPie,
  textoConsecuenciaFila,
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
import { FrescuraPiso } from "./FrescuraPiso";
import { FrescuraAguja } from "./FrescuraAguja";
import { loQueMueveLaAguja, loQueSeLlevan, sinEstrenar } from "@/lib/frescura-aguja";
import { conteoDeFamilia, pisoPorFamilia, respuestaDelPiso } from "@/lib/frescura-piso";

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

export function FrescuraPanel({ datos, acceso }: { datos: DatosFrescura; acceso: AccesoFrescura }) {
  const params = useSearchParams();
  const router = useRouter();
  const [comoSeLee, setComoSeLee] = useState(false);
  // El pie dice cifras; los nombres se despliegan a un toque (Formidable 2026-10-09, ley 8).
  const [verGuardadas, setVerGuardadas] = useState(false);
  const [verNuncaColgadas, setVerNuncaColgadas] = useState(false);
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
  // La tienda de un vistazo (ADR-0208, act. 2026-10-10 (b)): una barra por familia, con todo lo colgado (no solo lo de la tabla filtrada).
  const piso = useMemo(
    () =>
      sede
        ? pisoPorFamilia(sede.prendas, {
            familiaDe: (cat) => datos.categoriasVisuales[cat]?.familia ?? null,
            familias: datos.familias,
            precioDe: (v) => datos.precios[v] ?? null,
          })
        : [],
    [sede, datos.categoriasVisuales, datos.familias, datos.precios],
  );
  // Contra hace 4 semanas (la meta de Felipe): la misma familia, reconstruida del mismo libro en el servidor.
  const antes =
    sede?.haceUnMes && piso[0]
      ? conteoDeFamilia(sede.haceUnMes, piso[0].codigo, { familiaDe: (cat) => datos.categoriasVisuales[cat]?.familia ?? null, familias: datos.familias })
      : null;
  const respuesta = sede ? respuestaDelPiso(piso[0] ?? null, datos.puerta, antes) : null;
  // Lo que mueve la aguja: las categorías que se quedan y la que se lleva más (con lo anotado en caja como control).
  const pisoCuadrado = datos.puerta?.pisoCuadrado === true;
  const anotadasDe = useMemo(() => {
    const m = new Map(datos.anotadas.map((a) => [a.categoriaId, a]));
    return (cat: string, dias: number) => {
      const a = m.get(cat);
      return a ? (dias <= 14 ? a.d14 : a.d28) : 0;
    };
  }, [datos.anotadas]);
  const senales = useMemo(
    () => (sede ? loQueMueveLaAguja(sede.prendas, sede.ritmoPorCategoria, { pisoCuadrado, anotadas: datos.anotadas.length > 0 ? anotadasDe : undefined }) : []),
    [sede, pisoCuadrado, datos.anotadas, anotadasDe],
  );
  const seLlevan = useMemo(() => {
    if (!sede || pisoCuadrado) return [];
    const nombres = new Map<string, string>([...sede.categorias.map((c) => [c.categoriaId, c.categoriaNombre] as const), ...datos.anotadas.map((a) => [a.categoriaId, a.nombre] as const)]);
    return loQueSeLlevan(sede.ritmoPorCategoria, anotadasDe, datos.anotadas.map((a) => a.categoriaId), (cat) => nombres.get(cat) ?? "Sin categoría");
  }, [sede, pisoCuadrado, datos.anotadas, anotadasDe]);
  // Las prendas sin temporada se dicen UNA vez, dentro de «¿Cómo se lee esto?» (es una tarea de Catálogo, no un aviso de Frescura).
  const sinTemporada = textoSinTemporada(enTabla);
  // Lo aproximado se dice UNA vez arriba cuando es la regla (TRU: 4 ventas en 120 días); si es la excepción, cada fila lo marca.
  const avisoPocas = ctx ? avisoPocasVentas(enTabla, datos.sede.nombre) : null;
  const cifras = sede ? cifrasVista(sede.cifras) : null;
  const pie = sede ? pieVista(sede.prendas) : null;
  const resumenDelPie = pie ? resumenPie(pie) : null;
  // Con algo por decidir, el tablero se dibuja compacto para que la primera prenda por decidir entre en la pantalla sin bajar
  // (Formidable 2026-10-09, cambio 1). No depende de los filtros: tocar una categoría no debe cambiarle la forma.
  const tableroCompacto = (cifras?.porDecidir ?? 0) > 0;
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
  const grupos = agrupar(visibles);
  // Lo por decidir es de UNA categoría: su nombre va en la franja «Esperan tu decisión» y no en una franja propia.
  const franjaUnica = primeroLoDecidible && grupos.length === 1;

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
  // Sin atajo a las otras tiendas: comparar tiendas es CAYLA Global ▸ Frescura, una sola forma de hacerlo (Felipe, Formidable 2026-10-10 (c):
  // «Comparar las N tiendas» mostraba el % Nueva y la edad promedio que el ADR ya había retirado). El registro al colgar vive en «¿Cómo se lee esto?».

  // «¿Cómo se lee esto?» va junto al título del tablero (cabía de milagro en la fila de filtros: a 1440 caía solo a una segunda
  // línea y costaba 38 px de pantalla); sin tablero (nada colgado), vuelve a la fila de filtros.
  const botonComoSeLee = (
    <button
      type="button"
      className="btn-cayla btn-enlace inline-flex min-h-7 items-center text-[13px]"
      aria-expanded={comoSeLee}
      aria-controls="frescura-como-se-lee"
      onClick={() => setComoSeLee((v) => !v)}
    >
      ¿Cómo se lee esto?
      <ChevronDown aria-hidden strokeWidth={1.8} className={`ml-1 h-3.5 w-3.5 transition-transform ${comoSeLee ? "rotate-180" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-5">
      {/* La frase es la pregunta de Felipe y su respuesta (la barra de abajo); lo que espera decisión lo dicen la franja y la píldora. */}
      <EncabezadoPagina sede={datos.sede.nombre} titulo="Frescura del piso" subtitulo={<TextoConNegritas texto={fraseEncabezado(respuesta)} />} />

      {sede && <FrescuraPiso familias={piso} puerta={datos.puerta} acceso={acceso} antes={respuesta?.antes ?? null} />}

      {sede && datos.sede.tienda && (
        <FrescuraAguja
          senales={senales}
          pisoCuadrado={pisoCuadrado}
          seLlevan={seLlevan}
          estrenar={sinEstrenar(sede.prendas)}
          puedeBajar={acceso.existencias}
          onVerCategoria={(cat) => {
            cambiar({ cat });
            const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.getElementById("frescura-prendas")?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
          }}
        />
      )}

      <section id="frescura-prendas" aria-label="Prendas por categoría" className="card-cayla scroll-mt-4 overflow-hidden" data-resultados>
        {!sede ? (
          <EstadoSinLectura datos={datos} onReintentar={() => router.refresh()} />
        ) : (
          <>
            {/* Nivel 1: el tablero por categoría; tocar una fila filtra la lista (con `cat` en la URL, como el combo). */}
            <FrescuraTablero
              filas={tablero}
              elegida={filtros.cat === TODAS_LAS_CATEGORIAS ? null : filtros.cat}
              onElegir={(cat) => cambiar({ cat: cat ?? TODAS_LAS_CATEGORIAS })}
              compacto={tableroCompacto}
              acciones={botonComoSeLee}
            />
            {/* Filtros: en el estado del panel, copiados a la URL. */}
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 sm:px-5">
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
              {/* «Decididas» aparece cuando hay alguna (o si ya está filtrando por ellas): una píldora que filtra cero es ruido (ley 8). */}
              {decisionesOk && ((cifras?.decididas ?? 0) > 0 || filtros.decididas) && (
                <button type="button" className="pildora-cayla" aria-pressed={filtros.decididas} onClick={() => cambiar({ decididas: !filtros.decididas, porDecidir: false, todas: false })}>
                  Decididas <span className="font-medium tabular-nums">{cifras?.decididas ?? 0}</span>
                </button>
              )}
              {hayFiltros(filtros) && (
                <button type="button" className="btn-cayla btn-enlace inline-flex min-h-7 items-center text-[13px]" onClick={() => quitarFiltros(prendaAbierta)}>
                  Quitar filtros
                </button>
              )}
              {tablero.length === 0 && <span className="ml-auto">{botonComoSeLee}</span>}
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

            {primeroLoDecidible ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-sand px-4 py-2.5 sm:px-5">
                {/* Sin el conteo: la píldora «Por decidir N» lo dice 40 px más arriba (Formidable 2026-10-09, ley 8: el mismo número salía 6 veces).
                    Con un solo grupo, su nombre va en esta misma franja y no en una propia (Formidable 2026-10-10 (c): 57 px menos). */}
                {franjaUnica ? (
                  <h2 className="text-sm font-semibold text-tinta">
                    Esperan tu decisión <span className="font-normal text-taupe">· {grupos[0].nombre}</span>
                  </h2>
                ) : (
                  <span className="text-sm font-semibold text-tinta">Esperan tu decisión</span>
                )}
                <button type="button" className="btn-cayla btn-enlace inline-flex min-h-7 items-center text-[13.5px]" onClick={() => cambiar({ todas: true })}>
                  Ver todas las prendas ({enTabla.length})
                </button>
              </div>
            ) : !hayFiltros(filtros) && enTabla.length > 0 && (cifras?.porDecidir ?? 0) === 0 ? (
              // La frase de puente (Formidable 2026-10-09): al anotar la última por decidir, la lista pasaba de 1 a todas sin decir por qué.
              <div className="border-t border-sand px-4 py-3 text-sm text-taupe sm:px-5">
                <span className="font-semibold text-tinta">Nada por decidir.</span> Estas son todas las prendas colgadas en {datos.sede.nombre}.
              </div>
            ) : null}
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
              grupos.map((g) => {
                return (
                  <Fragment key={g.categoriaId}>
                    {!franjaUnica && (
                    <div className="border-t border-sand px-4 pb-3 pt-4 sm:px-5">
                      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
                        <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">
                          {g.nombre}
                          {/* El conteo del grupo solo cuando hay varios: con uno solo repetía la franja (ley 8). */}
                          {grupos.length > 1 && (
                            <span className="ml-1.5 font-sans text-[12.5px] font-medium text-taupe">
                              {g.prendas.length} {g.prendas.length === 1 ? "prenda" : "prendas"}
                            </span>
                          )}
                        </h2>
                      </div>
                    </div>
                    )}
                    <div className="overflow-x-auto [scrollbar-width:thin]">
                      <div className={ANCHO_MINIMO_TABLA}>
                        <div className={`encabezado-tabla-cayla hidden gap-x-4 px-5 py-2 text-[12.5px] text-taupe md:grid ${PLANTILLA_FRESCURA}`} role="presentation">
                          <span>Prenda</span>
                          <span>Estado</span>
                          <span>Qué hacer</span>
                          <span />
                        </div>
                        <div>
                          {g.prendas.map((p) => {
                            const accion = accionDeFila(p, ctx!, p.decision?.vigente ?? false, decisionesOk);
                            // Lo que pasa al tocar el botón que anota, dicho antes (el mismo plazo que se manda al anotar).
                            const consecuencia =
                              accion?.tipo === "anotar"
                                ? textoConsecuenciaFila(accion.accion, plazoDeAccion(accion.accion, ctx!.categorias.get(p.categoriaId), ctx!.cayla?.get(p.categoriaId)))
                                : null;
                            return (
                              <FrescuraFila
                                key={p.clave}
                                fila={filaVista(p, ctx!)}
                                onAbrir={() => abrir(p.clave)}
                                decision={filaDeDecision(p.decision, p.categoriaNombre, datos.sede.nombre)}
                                marcarAproximado={avisoPocas === null}
                                apariencia={datos.apariencias[p.clave] ?? null}
                                categoria={datos.categoriasVisuales[p.categoriaId] ?? null}
                                accion={accion}
                                consecuencia={consecuencia}
                                enviando={anotador.enviando === p.clave}
                                error={anotador.error?.clave === p.clave ? anotador.error : null}
                                onAnotar={(accion, verbo) => anotarDesdeFila(p, accion, verbo)}
                                onDecidir={(modo, opcion) => abrir(p.clave, modo, opcion)}
                                onLimpiarError={limpiarErrorDeFila}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })
            )}

            {/* El pie: «Mostrando N de M» solo con filtros (sin ellos, la franja y las cifras ya lo dicen); el almacén en cifras con los
                nombres a un toque (Formidable 2026-10-09, ley 8: eran 12 nombres en 6 renglones). */}
            {(hayFiltros(filtros) || (efectivos.porDecidir && porDecidirOtras > 0) || resumenDelPie?.guardadas || resumenDelPie?.nuncaColgadas || resumenDelPie?.agotadas) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand px-4 py-3 text-[12.5px] text-taupe sm:px-5">
                {hayFiltros(filtros) && (
                  <span>
                    Mostrando <b className="font-semibold text-tinta">{visibles.length}</b> de {enTabla.length} {enTabla.length === 1 ? "prenda" : "prendas"} ·{" "}
                    {textoUnidades(visibles.reduce((s, p) => s + p.pisoHoy, 0))} en el piso
                  </span>
                )}
                {efectivos.porDecidir && porDecidirOtras > 0 && (
                  <span className="w-full">
                    <TextoConNegritas texto={textoOtrasConPregunta(porDecidirOtras)} />{" "}
                    <button type="button" className="btn-cayla btn-enlace text-[12.5px]" onClick={() => cambiar({ porDecidir: false })}>
                      Verlas todas
                    </button>
                  </span>
                )}
                {pie && resumenDelPie?.guardadas && (
                  <span className="w-full">
                    {resumenDelPie.guardadas}{" "}
                    <button type="button" className="btn-cayla btn-enlace text-[12.5px]" aria-expanded={verGuardadas} onClick={() => setVerGuardadas((v) => !v)}>
                      {verGuardadas ? "Ocultar" : "Ver cuáles"}
                    </button>
                    {verGuardadas && <span className="mt-1 block">{pie.guardadas.join(" · ")}.</span>}
                  </span>
                )}
                {pie && resumenDelPie?.nuncaColgadas && (
                  <span className="w-full">
                    {resumenDelPie.nuncaColgadas}{" "}
                    <button type="button" className="btn-cayla btn-enlace text-[12.5px]" aria-expanded={verNuncaColgadas} onClick={() => setVerNuncaColgadas((v) => !v)}>
                      {verNuncaColgadas ? "Ocultar" : "Ver cuáles"}
                    </button>
                    {verNuncaColgadas && <span className="mt-1 block">{pie.nuncaColgadas.join(" · ")}.</span>}
                  </span>
                )}
                {resumenDelPie?.agotadas && <span className="w-full">{resumenDelPie.agotadas}</span>}
              </div>
            )}
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
