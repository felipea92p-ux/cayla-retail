import { Footprints } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { diasEntreFechas, horaLima, hoyLima } from "@/lib/fechas-lima";
import { campanaDelPeriodo, hrefTrafico, leerFiltros, leerResumen, periodoDe, quienesTexto, sinNoticias } from "@/lib/trafico-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonLimpiar } from "@/components/ui/FiltrosPuestos";
import { Vacio } from "@/components/ui/Vacio";
import { ControlesTrafico } from "@/components/trafico/ControlesTrafico";
import { DeDondeVienen } from "@/components/trafico/DeDondeVienen";
import { HorasTrafico } from "@/components/trafico/HorasTrafico";
import { PulsoTrafico } from "@/components/trafico/PulsoTrafico";
import { RecorridoTrafico } from "@/components/trafico/RecorridoTrafico";
import { TablasTrafico } from "@/components/trafico/TablasTrafico";
import { VitrinaTrafico } from "@/components/trafico/VitrinaTrafico";

// Tienda web ▸ Tráfico (ADR-0495; maqueta C «La vitrina», Felipe 2026-10-23): cuánta gente entra a la tienda online, qué mira, de dónde
// viene y en qué paso se va, contado por persona anónima (`retail.resumen_trafico_web`, que pide el módulo «trafico»). Es de toda la tienda
// online: la cabecera dice «Todas las tiendas». El período, los filtros y la vista viven en la dirección (`?periodo=30&camino=instagram`).
export default async function TraficoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("trafico");
  const filtros = leerFiltros(await searchParams);
  const hoy = hoyLima();
  const supabase = await createClient();
  // Las campañas son etiquetas de estilo «campaña» con sus fechas (Catálogo ▸ Insignias): la que rige hoy es el tercer período. Si no se
  // pueden leer, no hay tercer período, nada más.
  const { data: campanas } = await supabase
    .from("etiquetas")
    .select("nombre, vigente_desde, vigente_hasta")
    .eq("estilo", "campana")
    .eq("activo", true)
    .eq("estado", "aprobado")
    .not("vigente_desde", "is", null);
  const campana = campanaDelPeriodo((campanas ?? []).map((c) => ({ nombre: c.nombre, desde: c.vigente_desde, hasta: c.vigente_hasta })), hoy);
  const periodo = periodoDe(filtros.periodo, hoy, campana, new Date());
  const { data, error } = await supabase.rpc("resumen_trafico_web", {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
    // Contra qué se compara (Hoy, Ayer, Este mes…); sin esto, la base compara con los días de atrás del mismo largo.
    ...(periodo.antDesde && periodo.antHasta ? { p_ant_desde: periodo.antDesde, p_ant_hasta: periodo.antHasta } : {}),
    ...(periodo.corte ? { p_ant_corte: periodo.corte } : {}),
    ...(filtros.camino ? { p_camino: filtros.camino } : {}),
    ...(filtros.ciudad ? { p_ciudad: filtros.ciudad } : {}),
  });
  const r = error ? null : leerResumen(data);
  const callada = r ? sinNoticias(r.ultimoDato, new Date()) : null;
  const total = r?.pasos[0] ?? 0;
  const conFiltro = !!(filtros.camino || filtros.ciudad);
  const antes = periodo.antes.charAt(0).toUpperCase() + periodo.antes.slice(1);

  return (
    <div className="space-y-5">
      <EncabezadoPagina sede="Todas las tiendas" detalle="Tienda web" titulo="Tráfico" subtitulo="Cuánta gente entra a la tienda online, qué mira y dónde se va." />
      {r === null ? (
        <Aviso tono="error" titulo="No se pudo leer el tráfico de la tienda web">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : !r.ultimoDato ? (
        <Vacio icono={<Footprints />} titulo="Todavía no hay visitas anotadas" guia="trafico.vacio">
          La tienda online empieza a contar a la gente desde que se publica esta medición. Vuelve en un rato.
        </Vacio>
      ) : (
        <>
          <ControlesTrafico filtros={filtros} periodo={periodo} campana={campana} r={r} />
          {callada && (
            <Aviso tono="atencion" titulo={`La tienda online no manda visitas desde ${callada.desde}`}>
              Las cifras de hoy pueden estar incompletas. Si sigue así, revisa que la tienda online esté publicada y abra bien.
            </Aviso>
          )}
          {total === 0 ? (
            <Vacio
              icono={<Footprints />}
              titulo={`Nadie entró ${conFiltro ? `${quienesTexto(filtros.camino, filtros.ciudad)} ` : "a la tienda online "}en estos días`}
              guia="trafico.vacio"
              acciones={conFiltro ? <BotonLimpiar href={hrefTrafico(filtros, { camino: null, ciudad: null })}>Limpiar filtros</BotonLimpiar> : undefined}
            >
              {conFiltro ? "Quita un filtro para ver a más gente." : "Cuando alguien entre, lo verás aquí con su camino, su ciudad y hasta dónde llegó."}
            </Vacio>
          ) : (
            <>
              {/* Hasta dónde llega lo de hoy: la hora de ahora en Hoy; en un período de varios días que termina hoy, el día de hoy (a medias). */}
              <PulsoTrafico
                r={r}
                periodo={periodo}
                hastaX={
                  periodo.clave === "hoy"
                    ? Number((horaLima(new Date().toISOString()) ?? "0:00").split(":")[0])
                    : periodo.hasta === hoy
                      ? diasEntreFechas(periodo.desde, hoy)
                      : null
                }
              />
              {filtros.vista === "tabla" ? (
            <TablasTrafico r={r} filtros={filtros} periodo={periodo.nombre} antes={antes} />
          ) : (
            <>
              <RecorridoTrafico r={r} />
              <div className="trafico-cuerpo">
                <div className="trafico-cuerpo-rejilla">
                  <VitrinaTrafico prendas={r.prendas} vieron={r.pasos[1]} base={r.base} periodo={periodo.nombre} antes={antes} />
                  <aside className="grid min-w-0 content-start gap-4" aria-label="De dónde vienen y a qué hora">
                    <DeDondeVienen r={r} filtros={filtros} />
                    <HorasTrafico r={r} />
                  </aside>
                </div>
              </div>
            </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
