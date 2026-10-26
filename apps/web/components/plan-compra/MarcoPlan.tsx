"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { CampanasArchivadasModal } from "@/components/plan-compra/CampanasArchivadasModal";
import { CentroDeAvisos } from "@/components/plan-compra/CentroDeAvisos";
import { EditarCampanaModal } from "@/components/plan-compra/EditarCampanaModal";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import { PestanasPlan, type PestanaDelPlan } from "@/components/plan-compra/PestanasPlan";
import { PlazoModal } from "@/components/plan-compra/PlazoModal";
import { SelectorCampana } from "@/components/plan-compra/SelectorCampana";
import type { PlanConPlan } from "@/components/plan-compra/usePlanDerivado";
import { useAvisosVistos } from "@/components/plan-compra/useAvisosVistos";
import { marcarVisto, vistosVigentes, type AccionDelAviso, type AvisoDelPlan } from "@/lib/plan-compra-avisos";
import { campanasArchivadas, type CampanasLeidas, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// El marco de las pestañas del Plan de campaña (Plan, Presupuesto, Calendario…): la cabecera con su campaña, las pestañas, el centro de avisos y las
// hojas que son de la CAMPAÑA y no de una pestaña (crearla, editarla, ver las archivadas, los días para llegar). Antes vivía dentro de `PlanCampana`;
// sale de ahí para que cada pestaña ponga solo lo suyo y todas muestren la misma campaña y los mismos avisos (Brooks: una sola mente; Beck: primero se
// vuelve fácil el cambio, después se hace el cambio).
//
// CONTRATO
//   PROMETE: la cabecera, las pestañas y el centro de avisos son los mismos en todas las pestañas; elegir otra campaña deja a la persona en la pestaña
//            en que estaba; «Cambiar los días» abre su hoja desde cualquier pestaña; y una acción de un aviso que esta pestaña no sabe abrir (el resumen,
//            una categoría) lleva al Plan, que la abre al llegar (`?hoja=`), en vez de quedarse muda.
//   NO HACE: no calcula nada (eso es `usePlanDerivado`) ni sabe qué hay en el cuerpo de cada pestaña.

/** Lo que el marco deja hacer a una pestaña sin que lo reimplemente: abrir las hojas de la campaña. */
export type DelMarco = {
  /** La hoja de una campaña: una del calendario para armar su plan (`ranura`) o una nueva (`null`). */
  abrirHojaDeCampana: (ranura: RanuraCalendario | null) => void;
  abrirArchivadas: () => void;
  /** «Cambiar los días» para llegar. No hace nada si la base todavía no guarda el plazo. */
  abrirPlazo: () => void;
};

/** A qué ruta lleva cada pestaña del marco: elegir otra campaña en el selector vuelve a la misma pestaña. */
const RUTA_DE_LA_PESTANA: Record<Extract<PestanaDelPlan, "plan" | "presupuesto">, string> = {
  plan: "/compras/plan",
  presupuesto: "/compras/plan/presupuesto",
};

export function MarcoPlan({
  activa,
  derivado,
  campanas,
  esLider,
  planPedidoNoExiste,
  versionesFallo = false,
  subtitulo,
  alLadoDeLosAvisos,
  accionesDespues,
  accionPrincipal,
  onAccionDelAviso,
  children,
}: {
  activa: Extract<PestanaDelPlan, "plan" | "presupuesto">;
  derivado: PlanConPlan;
  campanas: CampanasLeidas | null;
  /** Solo para «Campaña nueva»: escribe en Catálogo ▸ Insignias y sigue siendo de un líder. */
  esLider: boolean;
  /** La URL pedía una campaña que no existe (vieja o escrita a mano): se muestra la más reciente y se dice. */
  planPedidoNoExiste: boolean;
  /** La lectura del tope del plan falló (la base lenta o caída): las cifras de compra se calcularon sin él y la persona tiene que saberlo, no verlas cambiar en silencio. */
  versionesFallo?: boolean;
  /** La frase bajo el título: la de cada pestaña. */
  subtitulo: ReactNode;
  /** El botón de ESTA pestaña que va pegado a la derecha de la campana de los avisos, en la fila de las pestañas (el Resumen del Plan; Felipe 2026-10-26). */
  alLadoDeLosAvisos?: ReactNode;
  /** Botones de la cabecera de ESTA pestaña, después del selector de campaña (descargar la lista). */
  accionesDespues?: ReactNode;
  /** La acción principal de la pestaña, al final de la cabecera («Empezar por …»). */
  accionPrincipal?: ReactNode;
  /** Una acción de un aviso que abre algo de esta pestaña: devuelve true si la atendió. Si no, el marco lleva al Plan. */
  onAccionDelAviso?: (a: AccionDelAviso) => boolean;
  children: (marco: DelMarco) => ReactNode;
}) {
  const router = useRouter();
  const { plan, momento, plazoFijado, avisos } = derivado;
  // Los avisos que esta persona marcó como «ya lo vi» en esta campaña (recordados en el navegador; ver `useAvisosVistos`).
  const [vistos, ponerVistos] = useAvisosVistos(plan.plan.id);
  // La hoja de una campaña: una del calendario para armar su plan (`ranura`) o una nueva (`ranura: null`). Act. 2026-10-12 f.
  const [hojaCampana, setHojaCampana] = useState<{ ranura: RanuraCalendario | null } | null>(null);
  const [editandoCampana, setEditandoCampana] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [editandoPlazo, setEditandoPlazo] = useState(false);
  const campanaActual = campanas?.planes.find((c) => c.id === plan.plan.id) ?? null;

  const marco: DelMarco = {
    abrirHojaDeCampana: (ranura) => setHojaCampana({ ranura }),
    abrirArchivadas: () => setVerArchivadas(true),
    abrirPlazo: () => {
      if (plazoFijado) setEditandoPlazo(true);
    },
  };

  const alAccionarAviso = (a: AccionDelAviso) => {
    if (a.tipo === "cambiar-dias") return marco.abrirPlazo();
    if (onAccionDelAviso?.(a)) return;
    // Esta pestaña no sabe abrirlo: el Plan sí, y lo abre al llegar.
    const hoja = a.tipo === "ver-resumen" ? "resumen" : a.tipo === "abrir-categoria" ? `categoria:${a.categoriaId}` : null;
    if (hoja) router.push(`${RUTA_DE_LA_PESTANA.plan}?plan=${plan.plan.id}&hoja=${encodeURIComponent(hoja)}`);
  };
  // Las acciones que son enlaces: «Ir a Conteo» y «Ver Presupuesto» (que en el propio Presupuesto sobra: ya estás ahí).
  const hrefDe = (a: AccionDelAviso): string | null =>
    a.tipo === "ir-conteo" ? "/inventario/conteo" : a.tipo === "ir-presupuesto" ? `${RUTA_DE_LA_PESTANA.presupuesto}?plan=${plan.plan.id}` : null;
  const avisosDeLaPestana = useMemo(
    () => (activa === "presupuesto" ? avisos.map((a) => ({ ...a, acciones: a.acciones.filter((x) => x.tipo !== "ir-presupuesto") })) : avisos),
    [activa, avisos],
  );
  const marcarAvisoVisto = (a: AvisoDelPlan) => ponerVistos(vistosVigentes(marcarVisto(vistos, a), avisos));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={subtitulo}
        acciones={
          <>
            <TooltipProvider delayDuration={150}>
              {/* Campaña y Exportar en UNA fila también en el celular (Felipe 2026-10-12): ahí la campaña ocupa lo que sobra y su
                  nombre se corta con «…»; antes cada uno caía en su propia fila y la tabla quedaba a media pantalla. */}
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
                {campanas && (
                  <SelectorCampana
                    estirarEnCelular
                    ruta={RUTA_DE_LA_PESTANA[activa]}
                    campanas={campanas}
                    actualId={plan.plan.id}
                    hoy={plan.hoy}
                    puedeCrear
                    puedeCrearNueva={esLider}
                    onNueva={() => marco.abrirHojaDeCampana(null)}
                    onArmar={(ranura) => marco.abrirHojaDeCampana(ranura)}
                    onEditar={() => setEditandoCampana(true)}
                    onArchivadas={() => marco.abrirArchivadas()}
                  />
                )}
                {accionesDespues}
              </div>
            </TooltipProvider>
            {accionPrincipal}
          </>
        }
        pie={
          <Chip tono={momento.estado === "durante" ? "verde" : "pizarra"}>
            <b className="font-semibold">{momento.fuerte}</b> · {momento.resto}
          </Chip>
        }
      />

      {/* Las pestañas y, a su derecha, el centro de avisos: un ícono con su número; lo urgente asoma una línea (spike ②, Felipe 2026-10-26). Pegado a la
          derecha de la campana va el botón de la pestaña (el Resumen del Plan): los dos son «lo que se mira aparte de la tabla» y quedan juntos. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <PestanasPlan activa={activa} planId={plan.plan.id} />
        <div className="ml-auto flex items-center gap-3">
          <CentroDeAvisos avisos={avisosDeLaPestana} vistos={vistos} onVisto={marcarAvisoVisto} onAccion={alAccionarAviso} hrefDe={hrefDe} />
          {alLadoDeLosAvisos && <TooltipProvider delayDuration={150}>{alLadoDeLosAvisos}</TooltipProvider>}
        </div>
      </div>

      {plan.plan.archivado && (
        <Aviso
          tono="atencion"
          guia="plan.archivada"
          titulo="Esta campaña está archivada"
          accion={
            campanas ? (
              <Boton peso="fantasma" onClick={() => marco.abrirArchivadas()}>
                Restaurar…
              </Boton>
            ) : undefined
          }
        >
          No sale en el selector. La ves tal como quedó; para volver a usarla, restáurala.
        </Aviso>
      )}

      {planPedidoNoExiste && (
        <Aviso tono="atencion" titulo="No encontramos esa campaña">
          El enlace pedía una campaña que no existe (puede ser viejo). Te mostramos {plan.plan.nombre}
          {campanas && campanas.planes.length > 1 ? "; elige otra en el selector de arriba." : "."}
        </Aviso>
      )}

      {versionesFallo && (
        <Aviso tono="atencion" titulo="No se pudo leer si tu plan usa un tope">
          Las cifras de compra pueden no ser las del plan con tope que guardaste. Recarga la página; si sigue, avísale a tu líder.
        </Aviso>
      )}

      {children(marco)}

      {hojaCampana && campanas && (
        <NuevaCampanaModal
          key={hojaCampana.ranura ? `${hojaCampana.ranura.etiquetaId}|${hojaCampana.ranura.anio}` : "nueva"}
          etiquetas={campanas.etiquetas}
          nombresEnUso={campanas.planes.map((c) => c.nombre)}
          ranura={hojaCampana.ranura}
          onClose={() => setHojaCampana(null)}
        />
      )}

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

      {editandoPlazo && plazoFijado && (
        <PlazoModal
          planId={plan.plan.id}
          planNombre={plan.plan.nombre}
          desde={plan.plan.desde}
          hasta={plan.plan.hasta}
          hoy={plan.hoy}
          diasActuales={plazoFijado.dias}
          onClose={() => setEditandoPlazo(false)}
        />
      )}
    </div>
  );
}
