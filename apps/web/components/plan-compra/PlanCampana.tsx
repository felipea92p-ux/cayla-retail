"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, Download, PanelRightOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Ayuda } from "@/components/Ayuda";
import * as Dialog from "@radix-ui/react-dialog";
import { CajonFicha } from "@/components/colaboradores/CajonFicha";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { CifrasPlan } from "@/components/plan-compra/CifrasPlan";
import { ListaCategorias, type VistaPlan } from "@/components/plan-compra/ListaCategorias";
import { AvisoStock, AvisoStockEnLinea } from "@/components/plan-compra/AvisoStock";
import { ExportarPlan } from "@/components/plan-compra/ExportarPlan";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import { hoyLima } from "@/lib/fechas-lima";
import { EditarCampanaModal } from "@/components/plan-compra/EditarCampanaModal";
import { CampanasArchivadasModal } from "@/components/plan-compra/CampanasArchivadasModal";
import { SelectorCampana } from "@/components/plan-compra/SelectorCampana";
import { PestanasPlan } from "@/components/plan-compra/PestanasPlan";
import { conHistorial, fraseDelRecupero, leerPropuesta, proponer } from "@/lib/plan-compra-propuesta";
import { leerHistorial } from "@/lib/plan-compra-historial";
import { leerPedido, numeroDeOrden } from "@/lib/plan-compra-pedido";
import Link from "next/link";
import { RecuperoModal } from "@/components/plan-compra/RecuperoModal";
import { SimuladorPlan } from "@/components/plan-compra/SimuladorPlan";
import { RepartoModal } from "@/components/plan-compra/RepartoModal";
import { fraseDeLosMinimos, tiendasParaRepartir } from "@/lib/plan-compra-reparto";
import { TopeModal } from "@/components/plan-compra/TopeModal";
import { PasoAPaso } from "@/components/plan-compra/PasoAPaso";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import {
  armarFilas,
  avisosDelResumen,
  enteroES,
  solesES,
  campanasArchivadas,
  diasEntre,
  confianzaDelStock,
  leerPlan,
  momentoDeLaCampana,
  siguienteSinPlan,
  totalesDelPlan,
  vistaDeLaUrl,
  type CampanasLeidas,
  type CategoriaPlan,
  type FiltroPlan,
  type OrdenPlan,
  ranurasSinPlan,
  type RanuraCalendario,
} from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";
import { avisoSinPlan, formaDeLaTabla, proximaCampana, queTocaHoy, subtituloDelPlan } from "@/lib/plan-compra-momento";
import type { LecturaMotor } from "@/lib/motor-demanda";

// Compras ▸ Plan de campaña (ADR-0349). Una fila por categoría: su barra de rango (los tres escenarios contra lo que ya hay y lo que hay
// que comprar), cuánto cuesta; al abrirla, su ventana para armar o corregir el plan. Durante y después de la campaña, lo que se vendió de
// verdad al lado. Toda la cuenta vive en lib/plan-compra-reglas.ts (con su prueba); aquí solo se arma la pantalla con sus piezas y se
// guarda qué filtros están puestos (las cifras y la lista los comparten).
//
// Formidable y chaos (2026-10-10, docs/formidable/compras-plan.md): UNA acción principal arriba («Empezar por …»); la vista «Paso a paso»
// vive en la URL (`?vista=paso`), así «Atrás» vuelve a la tabla en vez de salir de la pantalla; y salir del paso a paso con algo escrito
// pregunta antes de perderlo (la misma pieza que la hoja: `useSalidaSinGuardar`).
//
// Quién gestiona (ADR-0387, Felipe 2026-10-12): quien llega aquí ya tiene el módulo (la página lo exige), y con él crea, edita, quita y
// restaura campañas y fija el tope, sea líder o no; la base lo vuelve a comprobar. Por eso no hay botones escondidos por rol.

/** Marca, en el historial, la entrada que la pantalla agregó al pasar al paso a paso: volver a la tabla la retira en vez de apilar otra. */
const MARCA_VISTA = "__planVistaPaso";

export function PlanCampana({
  datos,
  falla,
  familias,
  preparacion,
  campanas,
  puedeContar,
  veAnalisis = false,
  esLider,
  planPedidoNoExiste = false,
  propuesta: propuestaCruda = null,
  pedido: pedidoCrudo = null,
  historia: historiaCruda = null,
}: {
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  /** Ve Análisis: el simulador ofrece el acceso a «Qué pedir», prenda por prenda. */
  veAnalisis?: boolean;
  /** Solo para «Fijar un mínimo» por tienda: su función de la base todavía pide ser líder. El resto del plan es de quien tiene el
   *  módulo (ADR-0387). */
  esLider: boolean;
  /** La URL pedía una campaña que no existe (vieja o escrita a mano): se muestra la más reciente y se dice. */
  planPedidoNoExiste?: boolean;
  /** Los hechos para proponer flojo, normal y bueno y el % de lo que sobra (C4–C5), crudos; null = sin propuesta. */
  propuesta?: unknown;
  /** Lo ya pedido en órdenes de compra para esta campaña, crudo; null = no se pudo leer (no se muestra). */
  pedido?: unknown;
  /** La misma campaña del año anterior en el historial (`fn_historial_ventas`), crudo: el multiplicador de las tiendas que el ERP no cubre. */
  historia?: unknown;
}) {
  const plan = useMemo(() => leerPlan(datos), [datos]);
  const hechos = useMemo(() => {
    const leida = leerPropuesta(propuestaCruda);
    return leida ? conHistorial(leida, leerHistorial(historiaCruda)) : null;
  }, [propuestaCruda, historiaCruda]);
  const pedido = useMemo(() => leerPedido(pedidoCrudo), [pedidoCrudo]);
  const params = useSearchParams();
  const vista: VistaPlan = vistaDeLaUrl(params.get("vista"));
  const [abierta, setAbierta] = useState<CategoriaPlan | null>(null);
  // Las que se guardaron con «Guardar y seguir» en esta tanda: la lectura del servidor tarda un instante en traerlas y la hoja no debe
  // volver a ofrecerlas como «la siguiente».
  const [hechas, setHechas] = useState<string[]>([]);
  // Lo que devolvió cada guardado de esta visita: la versión nueva de la línea (B4) y qué filas encender una vez.
  const [versiones, setVersiones] = useState<Record<string, number>>({});
  const [recientes, setRecientes] = useState<ReadonlySet<string>>(() => new Set());
  const [filtro, setFiltro] = useState<FiltroPlan>("todas");
  const [familia, setFamilia] = useState("todas");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenPlan>("ventas");
  const [sinMovAbiertas, setSinMovAbiertas] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [editandoTope, setEditandoTope] = useState(false);
  const [editandoRecupero, setEditandoRecupero] = useState(false);
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [editandoReparto, setEditandoReparto] = useState(false);
  // La hoja de una campaña: una del calendario para armar su plan (`ranura`) o una nueva (`ranura: null`). Act. 2026-10-12 f.
  const [hojaCampana, setHojaCampana] = useState<{ ranura: RanuraCalendario | null } | null>(null);
  const [editandoCampana, setEditandoCampana] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [pasoSucio, setPasoSucio] = useState(false);
  const salidaPaso = useSalidaSinGuardar(
    vista === "guiado" && pasoSucio,
    "Escribiste parte del plan de esta categoría y todavía no se guardó. Si sales ahora, se pierde lo que escribiste.",
  );
  // Cada fila lleva lo que propone el sistema (C4) y el % de lo que sobra de la campaña (C5), si la base los manda para ESTA campaña.
  const filas = useMemo(() => {
    if (!plan) return [];
    // Lo ya pedido en órdenes va en cada fila haya o no propuesta (ADR-0372 act. (e)).
    const base = armarFilas(plan).map((f) => ({ ...f, pedido: pedido?.porCategoria.get(f.c.id) }));
    if (!hechos || hechos.planId !== plan.plan.id) return base;
    return base.map((f) => ({
      ...f,
      propuesta: proponer(hechos, f.c.id),
      recuperoDefecto: hechos.recupero.pct,
      // El reparto entre tiendas (Felipe 2026-10-12): todas las tiendas activas, con su venta de 90 días, su stock y su mínimo.
      reparto:
        hechos.tiendasActivas.length > 0
          ? tiendasParaRepartir(hechos, f.c.id, (nombre) => f.sedes?.find((s) => s.ubicacion === nombre)?.unidades ?? 0)
          : undefined,
    }));
  }, [plan, hechos, pedido]);

  const recordar = (categoriaId: string, version: number | null) => {
    if (version !== null) setVersiones((v) => ({ ...v, [categoriaId]: Math.max(v[categoriaId] ?? 0, version) }));
    setRecientes((r) => new Set(r).add(categoriaId));
  };

  // Tabla ↔ Paso a paso. Al paso a paso se entra AGREGANDO una entrada al historial (con la marca); a la tabla se vuelve retirándola, para
  // que «Atrás» y el botón hagan lo mismo. Con algo escrito sin guardar, primero se pregunta.
  const irAVista = (v: VistaPlan) => {
    if (v === vista) return;
    const url = new URL(window.location.href);
    if (v === "guiado") {
      url.searchParams.set("vista", "paso");
      window.history.pushState({ [MARCA_VISTA]: true }, "", url);
      return;
    }
    salidaPaso.pedirAccion(() => {
      void salidaPaso.retirarYa().then(() => {
        setPasoSucio(false);
        if ((window.history.state as Record<string, unknown> | null)?.[MARCA_VISTA]) window.history.back();
        else {
          url.searchParams.delete("vista");
          window.history.replaceState(null, "", url);
        }
      });
    });
  };

  const hayArchivadas = !!campanas && campanasArchivadas(campanas).length > 0;
  const hoja = hojaCampana && campanas && (
    <NuevaCampanaModal
      key={hojaCampana.ranura ? `${hojaCampana.ranura.etiquetaId}|${hojaCampana.ranura.anio}` : "nueva"}
      etiquetas={campanas.etiquetas}
      nombresEnUso={campanas.planes.map((c) => c.nombre)}
      ranura={hojaCampana.ranura}
      onClose={() => setHojaCampana(null)}
    />
  );
  if (!plan) {
    const proxima = campanas ? (ranurasSinPlan(campanas, hoyLima()).at(0) ?? null) : null;
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo="Cuánto comprar de cada categoría para una campaña." />
        <PestanasPlan activa="plan" />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio
              icono={<CalendarDays />}
              titulo={hayArchivadas ? "No hay campañas activas" : "Todavía no hay ninguna campaña para planificar"}
              acciones={
                campanas ? (
                  <>
                    {/* Lo primero que ofrece es la próxima campaña del calendario, ya con sus fechas (quien tiene el módulo, ADR-0387);
                        «Campaña nueva», para lo que no está, sigue siendo de un líder: escribe en Etiquetas. */}
                    {proxima ? (
                      <>
                        <Boton peso="primario" onClick={() => setHojaCampana({ ranura: proxima })}>
                          Armar el plan de {proxima.nombre}
                        </Boton>
                        {esLider && <Boton onClick={() => setHojaCampana({ ranura: null })}>Campaña nueva</Boton>}
                      </>
                    ) : (
                      esLider && (
                        <Boton peso="primario" onClick={() => setHojaCampana({ ranura: null })}>
                          Campaña nueva
                        </Boton>
                      )
                    )}
                    {hayArchivadas && <Boton onClick={() => setVerArchivadas(true)}>Ver campañas archivadas</Boton>}
                  </>
                ) : undefined
              }
            >
              {hayArchivadas
                ? "Las que quitaste siguen en «Campañas archivadas»: restaura una o crea otra a partir de Catálogo ▸ Etiquetas."
                : "Crea una a partir de una campaña de Catálogo ▸ Etiquetas y aquí armas cuánto comprar de cada categoría."}
            </Vacio>
          </div>
        )}
        {hoja}
        {verArchivadas && campanas && <CampanasArchivadasModal archivadas={campanasArchivadas(campanas)} onClose={() => setVerArchivadas(false)} />}
      </div>
    );
  }

  const momento = momentoDeLaCampana(plan.hoy, plan.plan.desde, plan.plan.hasta);
  const totales = totalesDelPlan(filas);
  const confianza = confianzaDelStock(preparacion);
  const filaAbierta = abierta ? (filas.find((f) => f.c.id === abierta.id) ?? null) : null;
  const siguiente = abierta ? (siguienteSinPlan(filas, [...hechas, abierta.id])?.c ?? null) : null;
  // La acción principal de la pantalla: la categoría que más vende y todavía no tiene plan. Una sola, arriba (antes: hasta 10 «Armar plan» negros).
  const primera = vista === "tabla" && momento.estado === "antes" ? siguienteSinPlan(filas, hechas) : null;
  const cerrarHoja = () => {
    setAbierta(null);
    setHechas([]);
  };
  // Qué pregunta responde la pantalla HOY (prompt maestro 2026-10-13): antes, cuánto comprar; empezada o terminada sin plan, cómo va y la
  // próxima; con plan, lo planificado contra lo vendido. Y qué columnas tienen algo que decir.
  const forma = formaDeLaTabla(momento.estado, totales.conPlan);
  const toca = queTocaHoy(momento.estado, totales.conPlan, campanas ? proximaCampana(campanas, plan.hoy, plan.plan.id) : null);
  const campanaActual = campanas?.planes.find((c) => c.id === plan.plan.id) ?? null;
  const avisos = avisosDelResumen(confianza);
  const sedesDelPlan = [...new Set(filas.flatMap((f) => f.sedes?.map((s) => s.ubicacion) ?? []))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={
          <>
            {subtituloDelPlan(momento.estado, totales.conPlan, plan.plan.nombre)}{" "}
            {/* «Cómo se calcula», antes una nota al pie, va en el «!» junto a la frase, como en Resultados e Historial (Felipe 2026-10-12). */}
            <span data-guia="plan.como" className="inline-block align-middle">
              <Ayuda titulo="Cómo se calcula">
                <span className="block">
                  Con tus tres escenarios (flojo, normal y bueno), el sistema compra según cuánto cuesta quedarse corto (lo que dejas de ganar) frente
                  a sobrar (lo que pierdes al vender lo que queda más barato).
                </span>
                <span className="mt-2 block">
                  Si lo que sobra se vende casi al mismo precio, conviene cubrir el escenario bueno; si se pierde, conviene quedarse más cerca del flojo.
                  Comprar = lo que conviene tener − lo que ya hay hoy.
                </span>
                <span className="mt-2 block">Son tus supuestos (o los que propone el sistema): al terminar la campaña, Resultados los compara con lo que pasó.</span>
              </Ayuda>
            </span>
          </>
        }
        acciones={
          <>
            {/* El resumen y los avisos, en un cajón (Felipe 2026-10-12): la tabla queda justo bajo las pestañas. Solo el ícono, con su nombre
                al pasar el mouse (y para el lector de pantalla); el número dice cuántas tiendas tienen el stock sin cuadrar, para que el aviso
                no se olvide aunque no se vea. */}
            <TooltipProvider delayDuration={150}>
              {/* Resumen, campaña y Exportar en UNA fila también en el celular (Felipe 2026-10-12): ahí la campaña ocupa lo que sobra y su
                  nombre se corta con «…»; antes cada uno caía en su propia fila y la tabla quedaba a media pantalla. */}
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
              {/* El número va FUERA del botón, encima de su esquina (Felipe 2026-10-12): el botón recorta lo que se le sale (su onda). */}
              <span className="relative inline-flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Boton
                      peso="fantasma"
                      data-guia="plan.resumen"
                      className="w-10 justify-center px-0!"
                      onClick={() => setResumenAbierto(true)}
                      aria-expanded={resumenAbierto}
                      aria-label={avisos > 0 ? `Resumen y avisos: ${avisos} ${avisos === 1 ? "aviso" : "avisos"}` : "Resumen y avisos"}
                    >
                      <PanelRightOpen aria-hidden className="h-[18px] w-[18px]" />
                    </Boton>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Resumen y avisos</TooltipContent>
                </Tooltip>
                {avisos > 0 && (
                  <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-rojo px-1 text-[11px] font-semibold leading-none text-crema ring-2 ring-crema">
                    {avisos}
                  </span>
                )}
              </span>
            {campanas && (
              <SelectorCampana
                estirarEnCelular
                campanas={campanas}
                actualId={plan.plan.id}
                hoy={plan.hoy}
                puedeCrear
                puedeCrearNueva={esLider}
                onNueva={() => setHojaCampana({ ranura: null })}
                onArmar={(ranura) => setHojaCampana({ ranura })}
                onEditar={() => setEditandoCampana(true)}
                onArchivadas={() => setVerArchivadas(true)}
              />
            )}
              {totales.conPlan > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Boton peso="fantasma" className="w-10 justify-center px-0!" onClick={() => setExportando(true)} aria-label="Exportar">
                      <Download aria-hidden className="h-[18px] w-[18px]" />
                    </Boton>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Exportar</TooltipContent>
                </Tooltip>
              )}
              </div>
            </TooltipProvider>
            {primera && (
              <Boton peso="primario" className="whitespace-nowrap" data-guia="plan.empezar" onClick={() => setAbierta(primera.c)}>
                <span className="inline-flex items-center gap-2">
                  {totales.conPlan === 0 ? "Empezar por" : "Seguir con"} {primera.c.nombre}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Boton>
            )}
          </>
        }
        pie={
          <Chip tono={momento.estado === "durante" ? "verde" : "pizarra"}>
            <b className="font-semibold">{momento.fuerte}</b> · {momento.resto}
          </Chip>
        }
      />

      <PestanasPlan activa="plan" planId={plan.plan.id} />

      {plan.plan.archivado && (
        <Aviso
          tono="atencion"
          guia="plan.archivada"
          titulo="Esta campaña está archivada"
          accion={
            campanas ? (
              <Boton peso="fantasma" onClick={() => setVerArchivadas(true)}>
                Restaurar…
              </Boton>
            ) : undefined
          }
        >
          No sale en el selector. La ves tal como quedó; para volver a usarla, restáurala.
        </Aviso>
      )}

      {toca.tipo === "sin-plan" &&
        (() => {
          const aviso = avisoSinPlan(toca);
          return (
            <Aviso tono="info" guia="plan.sin-plan" titulo={aviso.titulo}>
              {aviso.texto}
              {/* Los caminos van bajo la frase, no en `accion`: ese lugar es para UN enlace, y aquí hay dos botones (y a 375 px aplastaban
                  el texto a una palabra por línea). */}
              <span className="mt-3 flex flex-wrap gap-2">
                <BotonEnlace peso="primario" href={`/compras/plan/resultados?plan=${plan.plan.id}`}>
                  {aviso.verResultados}
                </BotonEnlace>
                {toca.proxima?.destino.tipo === "plan" ? (
                  <BotonEnlace href={`/compras/plan?plan=${toca.proxima.destino.id}`}>Planificar {toca.proxima.nombre}</BotonEnlace>
                ) : toca.proxima?.destino.tipo === "calendario" ? (
                  // Una del calendario sin plan se arma desde su hoja, como en el selector (ADR-0372 act. f): cualquiera con el módulo (ADR-0387).
                  <Boton onClick={() => toca.proxima?.destino.tipo === "calendario" && setHojaCampana({ ranura: toca.proxima.destino.ranura })}>
                    Planificar {toca.proxima.nombre}
                  </Boton>
                ) : (
                  // «Campaña nueva», para lo que no está en el calendario, sigue siendo de un líder (escribe en Etiquetas).
                  esLider && campanas && <Boton onClick={() => setHojaCampana({ ranura: null })}>Campaña nueva</Boton>
                )}
              </span>
            </Aviso>
          );
        })()}

      {planPedidoNoExiste && (
        <Aviso tono="atencion" titulo="No encontramos esa campaña">
          El enlace pedía una campaña que no existe (puede ser viejo). Te mostramos {plan.plan.nombre}
          {campanas && campanas.planes.length > 1 ? "; elige otra en el selector de arriba." : "."}
        </Aviso>
      )}

      {/* El cajón de «Resumen y avisos» (Felipe 2026-10-12, opción D del spike docs/maquetas/plan-campana-rediseno-2026-10/): sin velo, la tabla
          sigue viva detrás (tocar una cifra que filtra, filtra la tabla). De arriba abajo: lo que avisa, las cifras de toda CAYLA, lo que
          sobra, el reparto entre tiendas y, antes de la campaña, el simulador. */}
      {resumenAbierto && (
        <CajonFicha clave="resumen" conVelo onCerrar={() => setResumenAbierto(false)}>
          <div className="pr-8">
            <Dialog.Title className="font-display text-2xl leading-tight text-tinta">Resumen y avisos</Dialog.Title>
            <Dialog.Description className="mt-1 text-[13.5px] text-taupe">
              {plan.plan.nombre} · toda CAYLA{sedesDelPlan.length > 0 ? ` (${sedesDelPlan.join(", ")})` : ""}. La sede elegida arriba no filtra esta pantalla.
            </Dialog.Description>
          </div>

          <AvisoStock confianza={confianza} puedeContar={puedeContar} />

          <CifrasPlan totales={totales} estado={momento.estado} filas={filas} filtro={filtro} onFiltro={setFiltro} onSeguirLlenando={() => irAVista("guiado")} tope={plan.tope} onTope={() => setEditandoTope(true)} />

          {pedido && (
            // Lo ya pedido en órdenes de compra que llegan dentro de las fechas de la campaña (Felipe 2026-10-12). Se muestra, no se resta de
            // «Comprar»: las órdenes todavía no saben cuándo llegó la mercadería, y restarlo contaría dos veces lo que ya está en el stock.
            <section data-guia="plan.pedido" className="space-y-2 rounded-xl bg-hueso px-4 py-3 text-[13px] text-tinta/80">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">Ya pedido en órdenes de compra</p>
              {pedido.ordenes.length === 0 ? (
                <p>Ninguna orden llega entre el {plan.plan.desde.slice(8)}/{plan.plan.desde.slice(5, 7)} y el {plan.plan.hasta.slice(8)}/{plan.plan.hasta.slice(5, 7)}.</p>
              ) : (
                <>
                  <p>
                    <b className="font-display text-xl text-tinta">{solesES(pedido.total)}</b> · {enteroES.format(pedido.unidades)} prendas en {pedido.ordenes.length}{" "}
                    {pedido.ordenes.length === 1 ? "orden" : "órdenes"}
                    {totales.inversion > 0 ? ` (el plan pide ${solesES(totales.inversion)})` : ""}
                  </p>
                  <ul className="divide-y divide-sand/80">
                    {pedido.ordenes.map((o) => (
                      <li key={o.id} className="flex items-baseline justify-between gap-3 py-1.5">
                        <Link href={`/compras/ordenes/ver/${o.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                          <b className="font-semibold text-tinta">{numeroDeOrden(o.numero)}</b> · {o.proveedor} · {o.destino}
                        </Link>
                        <span className="whitespace-nowrap tabular-nums">{enteroES.format(o.unidades)} · {solesES(o.total)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-xs text-tinta/65">Cuentan las órdenes que llegan dentro de las fechas de la campaña. No se restan de «Comprar» hasta que la orden sepa que ya llegó.</p>
            </section>
          )}

          {hechos && hechos.planId === plan.plan.id && (
            // C5: de dónde sale el % de lo que sobra con que arranca cada categoría nueva, y el botón para fijarlo (quien tiene el módulo, ADR-0387).
            <div data-guia="plan.recupero" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-hueso px-4 py-3 text-[13px] text-tinta/80">
              <span className="min-w-0 basis-full">{fraseDelRecupero(hechos.recupero)}</span>
              <Boton peso="discreto" onClick={() => setEditandoRecupero(true)}>
                {hechos.recupero.pct === null || hechos.recupero.heredado ? "Fijar el % de CAYLA" : "Cambiar el %"}
              </Boton>
            </div>
          )}

          {hechos && hechos.planId === plan.plan.id && hechos.tiendasActivas.length > 1 && (
            // El reparto entre tiendas (Felipe 2026-10-12): según lo que vende cada una; el mínimo de la que vende poco (Lima) lo fija, por ahora,
            // solo un líder: `guardar_plan_compra_minimo` todavía lo exige en la base (pasarlo al módulo, ADR-0387, espera el OK de Felipe).
            <div data-guia="plan.reparto" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-hueso px-4 py-3 text-[13px] text-tinta/80">
              <span className="min-w-0 basis-full">
                Lo que conviene tener se reparte entre las tiendas según lo que vende cada una
                {fraseDeLosMinimos(hechos.tiendasActivas, hechos.minimos) ? `; con mínimo: ${fraseDeLosMinimos(hechos.tiendasActivas, hechos.minimos)}` : ""}. El
                detalle, en la hoja de cada categoría.
              </span>
              {esLider && (
                <Boton peso="discreto" onClick={() => setEditandoReparto(true)}>
                  {hechos.minimos.size > 0 ? "Cambiar los mínimos" : "Fijar un mínimo"}
                </Boton>
              )}
            </div>
          )}

          {/* Antes de la campaña, el simulador (Felipe 2026-10-12): mover supuestos y ver la compra contra el tope, sin guardar. */}
          {momento.estado === "antes" && (
            <SimuladorPlan filas={filas} tope={plan.tope.valor} recuperoDefecto={hechos?.recupero.pct ?? null} veAnalisis={veAnalisis} />
          )}
        </CajonFicha>
      )}

      <ListaCategorias
        filas={filas}
        estado={momento.estado}
        forma={forma}
        avisoStock={<AvisoStockEnLinea confianza={confianza} onVer={() => setResumenAbierto(true)} />}
        familias={familias}
        filtro={filtro}
        onFiltro={setFiltro}
        familia={familia}
        onFamilia={setFamilia}
        q={q}
        onQ={setQ}
        orden={orden}
        onOrden={setOrden}
        sinMovAbiertas={sinMovAbiertas}
        onSinMov={setSinMovAbiertas}
        onAbrir={(f) => setAbierta(f.c)}
        recientes={recientes}
        vista={vista}
        onVista={irAVista}
        pasoAPaso={
          <PasoAPaso
            planId={plan.plan.id}
            campana={{ nombre: plan.plan.nombre, dias: diasEntre(plan.plan.desde, plan.plan.hasta) + 1 }}
            filas={filas}
            vendidoPorTalla={plan.vendidoPorTalla}
            totales={totales}
            tope={plan.tope.valor}
            familias={familias}
            conVersion={plan.conVersion}
            versiones={versiones}
            onGuardado={recordar}
            onCambios={setPasoSucio}
            pedirSalida={salidaPaso.pedirAccion}
            antesDeRefrescar={salidaPaso.retirarYa}
            onTabla={() => irAVista("tabla")}
          />
        }
      />

      {salidaPaso.aviso}
        {hoja}

      {editandoCampana && campanaActual && campanas && (
        <EditarCampanaModal
          campana={campanaActual}
          etiqueta={campanas.etiquetas.find((e) => e.id === campanaActual.etiquetaId)}
          otrosNombres={campanas.planes.filter((c) => c.id !== campanaActual.id).map((c) => c.nombre)}
          esLaActual
          onClose={() => setEditandoCampana(false)}
        />
      )}

      {verArchivadas && campanas && <CampanasArchivadasModal archivadas={campanasArchivadas(campanas)} onClose={() => setVerArchivadas(false)} />}

      {editandoTope && <TopeModal planId={plan.plan.id} planNombre={plan.plan.nombre} topeActual={plan.tope.valor} onClose={() => setEditandoTope(false)} />}
      {editandoReparto && hechos && (
        <RepartoModal planId={plan.plan.id} planNombre={plan.plan.nombre} tiendas={hechos.tiendasActivas} minimos={hechos.minimos} onClose={() => setEditandoReparto(false)} />
      )}
      {editandoRecupero && hechos && (
        <RecuperoModal planId={plan.plan.id} planNombre={plan.plan.nombre} actual={hechos.recupero.pct} heredado={hechos.recupero.heredado} onClose={() => setEditandoRecupero(false)} />
      )}

      {exportando && <ExportarPlan planNombre={plan.plan.nombre} filas={filas} confianza={confianza} onClose={() => setExportando(false)} />}

      {abierta && filaAbierta && (
        <PlanCategoriaModal
          planId={plan.plan.id}
          planNombre={plan.plan.nombre}
          planDias={diasEntre(plan.plan.desde, plan.plan.hasta) + 1}
          fila={filaAbierta}
          vendidoPorTalla={plan.vendidoPorTalla.get(abierta.id)}
          tope={plan.tope.valor}
          inversionDeLasDemas={totales.inversion - (filaAbierta.calculo?.inversion ?? 0)}
          conVersion={plan.conVersion}
          versionConocida={versiones[abierta.id]}
          siguiente={siguiente}
          enSerie={hechas.length > 0}
          onGuardado={(seguir, version) => {
            recordar(abierta.id, version);
            if (seguir && siguiente) {
              setHechas((h) => [...h, abierta.id]);
              setAbierta(siguiente);
            }
          }}
          onClose={cerrarHoja}
        />
      )}
    </div>
  );
}
