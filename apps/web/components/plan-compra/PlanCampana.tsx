"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, PanelRightOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Ayuda } from "@/components/Ayuda";
import { Cajon } from "@/components/ui/Cajon";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { CifrasPlan } from "@/components/plan-compra/CifrasPlan";
import { ListaCategorias, type VistaPlan } from "@/components/plan-compra/ListaCategorias";
import { AvisoStock } from "@/components/plan-compra/AvisoStock";
import { MarcoPlan } from "@/components/plan-compra/MarcoPlan";
import { SinCampana } from "@/components/plan-compra/SinCampana";
import { usePlanDerivado } from "@/components/plan-compra/usePlanDerivado";
import type { AccionDelAviso } from "@/lib/plan-compra-avisos";
import { ExportarPlan } from "@/components/plan-compra/ExportarPlan";
import { fraseDelConteoAntesDelPlazo } from "@/lib/plan-compra-plazo";
import { TopeModal } from "@/components/plan-compra/TopeModal";
import { PasoAPaso } from "@/components/plan-compra/PasoAPaso";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import {
  diasEntre,
  siguienteSinPlan,
  vistaDeLaUrl,
  type CampanasLeidas,
  type CategoriaPlan,
  type FiltroPlan,
  type OrdenPlan,
} from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";
import { avisoSinPlan, formaDeLaTabla, proximaCampana, queTocaHoy, subtituloDelPlan } from "@/lib/plan-compra-momento";
import type { LecturaMotor } from "@/lib/motor-demanda";
import { BotonDescargar } from "@/components/ui/BotonDescargar";

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
  puedeVerCompras = false,
  planPedidoNoExiste = false,
  propuesta: propuestaCruda = null,
  pedido: pedidoCrudo = null,
  historia: historiaCruda = null,
  descuentos: descuentosCrudos = null,
  plazo: plazoCrudo = null,
  versiones: versionesDelPlanCrudas = null,
  versionesFallo = false,
  pasos2 = null,
  envios = null,
}: {
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  /** Ve Compras ▸ Mis compras (`ordenes_compra`): solo entonces «Ver en Compras» lleva a donde se confirman los pedidos; sin el módulo, llevaría a «Sin acceso». */
  puedeVerCompras?: boolean;
  /** La URL pedía una campaña que no existe (vieja o escrita a mano): se muestra la más reciente y se dice. */
  planPedidoNoExiste?: boolean;
  /** Los hechos para proponer flojo, normal y bueno y el % de lo que sobra (C4–C5), crudos; null = sin propuesta. */
  propuesta?: unknown;
  /** Lo ya pedido en órdenes de compra para esta campaña, crudo; null = no se pudo leer (no se muestra). */
  pedido?: unknown;
  /** La misma campaña del año anterior en el historial (`fn_historial_ventas`), crudo: el multiplicador de las tiendas que el ERP no cubre. */
  historia?: unknown;
  /** El descuento guardado por categoría y el que sugiere la campaña (`fn_plan_compra_descuento`, ADR-0499), crudo; null = el plan cuenta a precio de lista. */
  descuentos?: unknown;
  /** Los días para llegar fijados para esta campaña (`fn_plan_compra_plazo`, ADR-0499), crudo; null = la base no lo manda: se cuenta con el supuesto y no se ofrece cambiarlo. */
  plazo?: unknown;
  /** El precio de la plata del plan, el tope y las versiones (`fn_plan_compra_versiones`, ADR-0523), crudo; null = la base no lo manda: el plan se calcula como siempre. */
  versiones?: unknown;
  /** La lectura de versiones falló (no es que la base no la tenga): el plan se calculó sin el tope aplicado y hay que decirlo. */
  versionesFallo?: boolean;
  /** Qué categorías ya tienen su paso 2 guardado (`fn_plan_compra_pasos_2`, ADR-0526), crudo; null = la base no lo sabe. */
  pasos2?: unknown;
  /** Qué tiene cada categoría en Compras (`fn_plan_compra_envios`, ADR-0530), crudo; null = la base no lo sabe. */
  envios?: unknown;
}) {
  // Lo derivado de lo que la base manda (filas, momento, plazo, avisos) lo comparten las pestañas del Plan: ver `usePlanDerivado`. La cabecera, las
  // pestañas, el centro de avisos y las hojas de la campaña también: ver `MarcoPlan`.
  const derivado = usePlanDerivado({ datos, descuentos: descuentosCrudos, propuesta: propuestaCruda, historia: historiaCruda, pedido: pedidoCrudo, plazo: plazoCrudo, versiones: versionesDelPlanCrudas, pasos2, envios, preparacion, puedeContar, campanas });
  const { filas } = derivado;
  const params = useSearchParams();
  const vista: VistaPlan = vistaDeLaUrl(params.get("vista"));
  // Otra pestaña (Presupuesto) puede mandar aquí a abrir el resumen o una categoría: `?hoja=resumen` o `?hoja=categoria:<id>`. Se lee al montar y se retira de la URL.
  const hojaPedida = params.get("hoja");
  const [abierta, setAbierta] = useState<CategoriaPlan | null>(() => {
    const id = hojaPedida?.startsWith("categoria:") ? hojaPedida.slice("categoria:".length) : null;
    return id ? (filas.find((f) => f.c.id === id)?.c ?? null) : null;
  });
  useEffect(() => {
    if (!hojaPedida) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("hoja");
    window.history.replaceState(window.history.state, "", url);
  }, [hojaPedida]);
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
  const [resumenAbierto, setResumenAbierto] = useState(hojaPedida === "resumen");
  const [pasoSucio, setPasoSucio] = useState(false);
  const salidaPaso = useSalidaSinGuardar(
    vista === "guiado" && pasoSucio,
    "Escribiste parte del plan de esta categoría y todavía no se guardó. Si sales ahora, se pierde lo que escribiste.",
  );
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

  if (derivado.plan === null) return <SinCampana activa="plan" campanas={campanas} falla={falla} />;

  const { plan, momento, totales, plazo, confianza } = derivado;
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
  // Lo que esta pestaña sabe abrir desde un aviso: el resumen y una categoría. «Cambiar los días» lo abre el marco.
  const alAccionarAviso = (a: AccionDelAviso): boolean => {
    if (a.tipo === "ver-resumen") setResumenAbierto(true);
    else if (a.tipo === "abrir-categoria") {
      const c = filas.find((f) => f.c.id === a.categoriaId)?.c;
      if (c) setAbierta(c);
    } else return false;
    return true;
  };
  const sedesDelPlan = [...new Set(filas.flatMap((f) => f.sedes?.map((s) => s.ubicacion) ?? []))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <MarcoPlan
      activa="plan"
      derivado={derivado}
      campanas={campanas}
      planPedidoNoExiste={planPedidoNoExiste}
      versionesFallo={versionesFallo}
      onAccionDelAviso={alAccionarAviso}
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
                Comprar = lo que conviene tener − lo que ya hay hoy − lo que ya viene en órdenes de compra y todavía no llega.
              </span>
              <span className="mt-2 block">Son tus supuestos (o los que propone el sistema): al terminar la campaña, Resultados los compara con lo que pasó.</span>
            </Ayuda>
          </span>
        </>
      }
      alLadoDeLosAvisos={
        // El resumen, en un cajón (Felipe 2026-10-12): la tabla queda justo bajo las pestañas. Solo el ícono, con su nombre al pasar el
        // mouse (y para el lector de pantalla). Los avisos tienen su propio ícono con su número, junto a las pestañas (2026-10-26), y el Resumen va
        // pegado a su derecha (Felipe 2026-10-26: «resumen que esté al lado derecho de notificaciones»); de 40 px como la campana.
        <span className="relative inline-flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Boton peso="fantasma" data-guia="plan.resumen" className="h-10 w-10 justify-center px-0!" onClick={() => setResumenAbierto(true)} aria-expanded={resumenAbierto} aria-label="Resumen">
                <PanelRightOpen aria-hidden className="h-4 w-4" />
              </Boton>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Resumen</TooltipContent>
          </Tooltip>
        </span>
      }
      accionesDespues={
        totales.conPlan > 0 ? (
          // La lista de compra para imprimir o bajar (abre su hoja): la pieza de descargar, solo el ícono con su nombre al pasar el mouse, como
          // el Resumen de al lado (Felipe 2026-10-26; la ronda 10 de ADR-0358 la había puesto con texto).
          <BotonDescargar soloIcono onClick={() => setExportando(true)}>
            Descargar la lista
          </BotonDescargar>
        ) : undefined
      }
      accionPrincipal={
        primera ? (
          <Boton peso="primario" className="whitespace-nowrap" data-guia="plan.empezar" onClick={() => setAbierta(primera.c)}>
            <span className="inline-flex items-center gap-2">
              {totales.conPlan === 0 ? "Empezar por" : "Seguir con"} {primera.c.nombre}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </span>
          </Boton>
        ) : undefined
      }
    >
      {(marco) => (
        <>
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
                      <Boton onClick={() => toca.proxima?.destino.tipo === "calendario" && marco.abrirHojaDeCampana(toca.proxima.destino.ranura)}>
                        Planificar {toca.proxima.nombre}
                      </Boton>
                    ) : (
                      // Ninguna otra campaña en tu plan: se eligen en el Calendario (ADR-0525).
                      <BotonEnlace href="/compras/plan/calendario">Elegir mis campañas</BotonEnlace>
                    )}
                  </span>
                </Aviso>
              );
            })()}

          {/* El cajón de «Resumen» (antes «Resumen y avisos»; Felipe 2026-10-12, opción D del spike docs/maquetas/plan-campana-rediseno-2026-10/): sin velo, la tabla
              sigue viva detrás (tocar una cifra que filtra, filtra la tabla). De arriba abajo: lo que avisa y las cifras de toda CAYLA. Lo que se
              supone para toda la campaña (lo que sobra, lo ya pedido, el reparto) y el simulador viven en Presupuesto. */}
          {resumenAbierto && (
            <Cajon
              onCerrar={() => setResumenAbierto(false)}
              clave="resumen"
              sinFocoInicial
              titulo="Resumen"
              frase={<>{plan.plan.nombre} · toda CAYLA{sedesDelPlan.length > 0 ? ` (${sedesDelPlan.join(", ")})` : ""}. La sede elegida arriba no filtra esta pantalla.</>}
              claseCuerpo="space-y-5"
            >
              <AvisoStock confianza={confianza} puedeContar={puedeContar} frasePlazo={fraseDelConteoAntesDelPlazo(plazo)} />

              <CifrasPlan totales={totales} estado={momento.estado} filas={filas} filtro={filtro} onFiltro={setFiltro} onSeguirLlenando={() => irAVista("guiado")} tope={plan.tope} onTope={() => setEditandoTope(true)} />
            </Cajon>
          )}

          <ListaCategorias
            filas={filas}
            estado={momento.estado}
            forma={forma}
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
            plazo={plazo}
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
                precioDeLaPlata={derivado.precioDeLaPlata}
                onGuardado={recordar}
                onCambios={setPasoSucio}
                pedirSalida={salidaPaso.pedirAccion}
                antesDeRefrescar={salidaPaso.retirarYa}
                onTabla={() => irAVista("tabla")}
              />
            }
          />

          {salidaPaso.aviso}

          {editandoTope && <TopeModal planId={plan.plan.id} planNombre={plan.plan.nombre} topeActual={plan.tope.valor} onClose={() => setEditandoTope(false)} />}

          {exportando && <ExportarPlan planNombre={plan.plan.nombre} filas={filas} confianza={confianza} onClose={() => setExportando(false)} />}

          {abierta && filaAbierta && (
            <PlanCategoriaModal
              planId={plan.plan.id}
              planNombre={plan.plan.nombre}
              planDias={diasEntre(plan.plan.desde, plan.plan.hasta) + 1}
              hoy={plan.hoy}
              limite={plazo.limite}
              fila={filaAbierta}
              vendidoPorTalla={plan.vendidoPorTalla.get(abierta.id)}
              tope={plan.tope.valor}
              inversionDeLasDemas={totales.inversion - (filaAbierta.calculo?.inversion ?? 0)}
              conVersion={plan.conVersion}
              versionConocida={versiones[abierta.id]}
              precioDeLaPlata={derivado.precioDeLaPlata}
              puedeVerCompras={puedeVerCompras}
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
        </>
      )}
    </MarcoPlan>
  );
}
