import Link from "next/link";
import { exigirModulo } from "@/lib/persona-actual";
import { armarHistoria } from "@/lib/espacio-piso";
import { hoyLima } from "@/lib/fechas-lima";
import { getFotosDelEspacio, getGruposDelMix, getPropuestaDelMix } from "@/lib/plan-piso-servidor";
import { resumir } from "@/lib/plan-piso-grupos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { GruposDelMix } from "@/components/plan-piso/GruposDelMix";
import { HistoriaDelEspacio } from "@/components/plan-piso/HistoriaDelEspacio";
import { PlanDelPisoPestanas } from "@/components/plan-piso/PlanDelPisoPestanas";
import { PropuestaDelMix } from "@/components/plan-piso/PropuestaDelMix";

// Plan del piso (ADR-0329 + ADR-0328, actividad 12), primera entrega, solo lectura: cuánto lugar le toca a cada grupo de prendas en
// el riel de la sede (la PROPUESTA) y a qué grupo pertenece cada categoría (los GRUPOS). La sede es la del selector global
// (`persona.ubicacionId`): la pantalla no tiene selector propio, como Frescura y Análisis.
// Esta página solo trae los datos (`getGruposDelMix` y `getPropuestaDelMix`, que nunca lanzan) y dice si quien mira es líder (la base lo
// decide de verdad); todo lo demás —el cálculo, las filas, los cambios preparados— vive en `lib/mix-piso.ts`, `lib/plan-piso-grupos.ts`
// y en los paneles. Si falla la lectura de los grupos no hay nada que mostrar; si falla solo la de la propuesta, los grupos se siguen
// pudiendo revisar (se degrada una pestaña, no la pantalla).
export default async function PlanDelPisoPage() {
  // La repite aquí además del layout: un layout no vuelve a correr al navegar entre sus hijas (lo mismo que exigirLider).
  const persona = await exigirModulo("plan_piso");
  const lectura = await getGruposDelMix();
  // La propuesta y las fotos son lecturas independientes: se piden juntas, y si una falla solo se apaga su pestaña.
  const [propuesta, fotos] = lectura.ok
    ? await Promise.all([
        getPropuestaDelMix({ ubicacionId: persona.ubicacionId, nombreSede: persona.ubicacionEtiqueta, grupos: lectura.grupos, categorias: lectura.categorias }),
        getFotosDelEspacio(persona.ubicacionId),
      ])
    : [null, null];
  const resumen = lectura.ok ? resumir(lectura.categorias) : null;
  const porRevisar = resumen ? resumen.porRevisar + resumen.sinGrupo : 0;

  return (
    <div className="space-y-6 pb-24">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Plan del piso"
        subtitulo="Cuánto lugar tiene cada grupo de prendas en el riel, y a qué grupo pertenece cada categoría."
      />
      {lectura.ok && propuesta && fotos ? (
        <PlanDelPisoPestanas
          porRevisar={porRevisar}
          propuesta={
            propuesta.ok ? (
              <PropuestaDelMix propuesta={propuesta.propuesta} capacidadProvisional={propuesta.capacidadProvisional} categoriasPorRevisar={resumen?.porRevisar ?? 0} categoriasSinGrupo={resumen?.sinGrupo ?? 0} esLider={persona.rol === "lider"} />
            ) : (
              // Se degrada así: la pestaña dice que no pudo leer y no se muestra una propuesta sobre un piso que no se leyó.
              <div className="card-cayla p-5" role="alert">
                <p className="text-sm font-semibold text-tinta">No se pudo armar la propuesta.</p>
                <p className="mt-1 text-[13px] text-tinta/70">
                  {propuesta.motivo} No se perdió nada, y los grupos se pueden revisar igual en su pestaña. Vuelve a intentarlo en un momento.
                </p>
                <Link href="/inventario/plan-del-piso" className="btn-cayla btn-secundario mt-4 inline-flex">
                  Reintentar
                </Link>
              </div>
            )
          }
          grupos={<GruposDelMix grupos={lectura.grupos} categorias={lectura.categorias} esLider={persona.rol === "lider"} />}
          historia={
            fotos.ok ? (
              <HistoriaDelEspacio historia={armarHistoria(fotos.fotos, lectura.categorias, lectura.grupos, hoyLima())} grupos={lectura.grupos} />
            ) : (
              // Se degrada así: la pestaña dice que no pudo leer y las demás siguen en pie; las fotos ya tomadas no se pierden.
              <div className="card-cayla p-5" role="alert">
                <p className="text-sm font-semibold text-tinta">No se pudo leer la historia del espacio.</p>
                <p className="mt-1 text-[13px] text-tinta/70">{fotos.motivo} Las fotos ya tomadas siguen guardadas. Vuelve a intentarlo en un momento.</p>
                <Link href="/inventario/plan-del-piso" className="btn-cayla btn-secundario mt-4 inline-flex">
                  Reintentar
                </Link>
              </div>
            )
          }
        />
      ) : (
        // Se degrada así: la pantalla dice que no pudo leer y no se pierde nada (no hay nada a medias que guardar).
        <div className="card-cayla p-5" role="alert">
          <p className="text-sm font-semibold text-tinta">No se pudieron leer los grupos del plan del piso.</p>
          <p className="mt-1 text-[13px] text-tinta/70">
            {lectura.ok ? "" : lectura.motivo} No se perdió nada. Vuelve a intentarlo en un momento; si sigue igual, avisa a quien administra el sistema.
          </p>
          <Link href="/inventario/plan-del-piso" className="btn-cayla btn-secundario mt-4 inline-flex">
            Reintentar
          </Link>
        </div>
      )}
    </div>
  );
}
