"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { CifrasPlan } from "@/components/plan-compra/CifrasPlan";
import { ListaCategorias, type VistaPlan } from "@/components/plan-compra/ListaCategorias";
import { AvisoStock } from "@/components/plan-compra/AvisoStock";
import { ExportarPlan } from "@/components/plan-compra/ExportarPlan";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import { SelectorCampana } from "@/components/plan-compra/SelectorCampana";
import { TopeModal } from "@/components/plan-compra/TopeModal";
import { PasoAPaso } from "@/components/plan-compra/PasoAPaso";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import {
  armarFilas,
  confianzaDelStock,
  fechaLargaES,
  leerPlan,
  momentoDeLaCampana,
  siguienteSinPlan,
  totalesDelPlan,
  vistaDeLaUrl,
  type CampanasLeidas,
  type CategoriaPlan,
  type FiltroPlan,
  type OrdenPlan,
} from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";
import type { LecturaMotor } from "@/lib/motor-demanda";

// Compras ▸ Plan de campaña (ADR-0349). Una fila por categoría: su barra de rango (los tres escenarios contra lo que ya hay y lo que hay
// que comprar), cuánto cuesta; al abrirla, su ventana para armar o corregir el plan. Durante y después de la campaña, lo que se vendió de
// verdad al lado. Toda la cuenta vive en lib/plan-compra-reglas.ts (con su prueba); aquí solo se arma la pantalla con sus piezas y se
// guarda qué filtros están puestos (las cifras y la lista los comparten).
//
// Formidable y chaos (2026-10-10, docs/formidable/compras-plan.md): UNA acción principal arriba («Empezar por …»); la vista «Paso a paso»
// vive en la URL (`?vista=paso`), así «Atrás» vuelve a la tabla en vez de salir de la pantalla; y salir del paso a paso con algo escrito
// pregunta antes de perderlo (la misma pieza que la hoja: `useSalidaSinGuardar`).

/** Marca, en el historial, la entrada que la pantalla agregó al pasar al paso a paso: volver a la tabla la retira en vez de apilar otra. */
const MARCA_VISTA = "__planVistaPaso";

export function PlanCampana({
  datos,
  falla,
  familias,
  preparacion,
  campanas,
  puedeContar,
  esLider,
  planPedidoNoExiste = false,
}: {
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  esLider: boolean;
  /** La URL pedía una campaña que no existe (vieja o escrita a mano): se muestra la más reciente y se dice. */
  planPedidoNoExiste?: boolean;
}) {
  const plan = useMemo(() => leerPlan(datos), [datos]);
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
  const [nuevaCampana, setNuevaCampana] = useState(false);
  const [pasoSucio, setPasoSucio] = useState(false);
  const salidaPaso = useSalidaSinGuardar(
    vista === "guiado" && pasoSucio,
    "Escribiste parte del plan de esta categoría y todavía no se guardó. Si sales ahora, se pierde lo que escribiste.",
  );
  const filas = useMemo(() => (plan ? armarFilas(plan) : []), [plan]);

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

  if (!plan) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo="Cuánto comprar de cada categoría para una campaña." />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio
              icono={<CalendarDays />}
              titulo="Todavía no hay ninguna campaña para planificar"
              acciones={
                esLider && campanas ? (
                  <Boton peso="primario" onClick={() => setNuevaCampana(true)}>
                    Nueva campaña
                  </Boton>
                ) : undefined
              }
            >
              {esLider ? "Crea una a partir de una campaña de Catálogo ▸ Etiquetas y aquí armas cuánto comprar de cada categoría." : "Cuando un líder cree una campaña, aquí se arma cuánto comprar de cada categoría."}
            </Vacio>
          </div>
        )}
        {nuevaCampana && campanas && <NuevaCampanaModal etiquetas={campanas.etiquetas} nombresEnUso={campanas.planes.map((c) => c.nombre)} onClose={() => setNuevaCampana(false)} />}
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
  const rango = `del ${fechaLargaES(plan.plan.desde)} al ${fechaLargaES(plan.plan.hasta)}`;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={
          momento.estado === "antes"
            ? `Cuánto comprar de cada categoría para ${plan.plan.nombre}, ${rango}.`
            : `${plan.plan.nombre}, ${rango}: lo que planificaste y, al lado, lo que se vendió de verdad.`
        }
        acciones={
          <>
            {campanas && <SelectorCampana campanas={campanas} actualId={plan.plan.id} puedeCrear={esLider} onNueva={() => setNuevaCampana(true)} />}
            {totales.conPlan > 0 && (
              <Boton peso="fantasma" onClick={() => setExportando(true)}>
                Exportar
              </Boton>
            )}
            {primera && (
              <Boton peso="primario" className="whitespace-nowrap" onClick={() => setAbierta(primera.c)}>
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

      {planPedidoNoExiste && (
        <Aviso tono="atencion" titulo="No encontramos esa campaña">
          El enlace pedía una campaña que no existe (puede ser viejo). Te mostramos {plan.plan.nombre}
          {campanas && campanas.planes.length > 1 ? "; elige otra en el selector de arriba." : "."}
        </Aviso>
      )}

      <AvisoStock confianza={confianza} puedeContar={puedeContar} />

      <CifrasPlan totales={totales} estado={momento.estado} filas={filas} filtro={filtro} onFiltro={setFiltro} onSeguirLlenando={() => irAVista("guiado")} tope={plan.tope} onTope={esLider ? () => setEditandoTope(true) : undefined} />

      <ListaCategorias
        filas={filas}
        estado={momento.estado}
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

      <p className="nota-cayla">
        Cómo se calcula: con tus tres escenarios, el sistema compra según cuánto cuesta quedarse corto (lo que dejas de ganar) frente a
        sobrar (lo que pierdes al vender lo que queda más barato). Si lo que sobra se vende casi al mismo precio, conviene cubrir un
        diciembre bueno; si se pierde, conviene quedarse más cerca del flojo. No hay historia de ventas de diciembre en el ERP: estos
        números son tus supuestos, y en enero se comparan con lo que pasó.
      </p>

      {salidaPaso.aviso}

      {nuevaCampana && campanas && <NuevaCampanaModal etiquetas={campanas.etiquetas} nombresEnUso={campanas.planes.map((c) => c.nombre)} onClose={() => setNuevaCampana(false)} />}

      {editandoTope && <TopeModal planId={plan.plan.id} planNombre={plan.plan.nombre} topeActual={plan.tope.valor} onClose={() => setEditandoTope(false)} />}

      {exportando && <ExportarPlan planNombre={plan.plan.nombre} filas={filas} confianza={confianza} onClose={() => setExportando(false)} />}

      {abierta && filaAbierta && (
        <PlanCategoriaModal
          planId={plan.plan.id}
          planNombre={plan.plan.nombre}
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
