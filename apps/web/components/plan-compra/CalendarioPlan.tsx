"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, List } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { HojaDeCampanaCalendario } from "@/components/plan-compra/HojaDeCampanaCalendario";
import { LineaDelAnio } from "@/components/plan-compra/LineaDelAnio";
import { ListaDelCalendario } from "@/components/plan-compra/ListaDelCalendario";
import { MarcoMinimo } from "@/components/plan-compra/MarcoMinimo";
import { MarcoPlan } from "@/components/plan-compra/MarcoPlan";
import { NuevaCampanaModal } from "@/components/plan-compra/NuevaCampanaModal";
import { usePlanDerivado } from "@/components/plan-compra/usePlanDerivado";
import { hoyLima } from "@/lib/fechas-lima";
import type { EvidenciaDeCampana } from "@/lib/plan-compra-calendario-evidencia";
import {
  agruparCalendario,
  anioDelCalendario,
  aniosDelCalendario,
  campanasDelCalendario,
  claveDeLaQueMasPesa,
  resumenDelCalendario,
  type CampanaDelCalendario,
} from "@/lib/plan-compra-calendario-vista";
import type { LecturaMotor } from "@/lib/motor-demanda";
import { claveDeRanura, ranurasSinPlan, type CampanasLeidas, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// Compras ▸ Plan de campaña ▸ Calendario (Felipe 2026-10-26, spike ① de «la visión», tarea #7 de la auditoría): con cuáles campañas te quedas el año, cuáles se repiten y cuáles
// descansan. La lista (por defecto) o «La línea del año», un año a la vez, con lo que dijo la historia de cada campaña. Lo que se decide aquí es de TU plan de compra: no toca la
// insignia, la tienda web ni la meta de caja. Lo que decide cada cosa vive en `lib/plan-compra-calendario*.ts` (con su prueba); esta pantalla solo lo dibuja y lo guarda por las
// funciones de la base. Funciona aunque todavía no haya ningún plan (es justo donde se decide cuáles campañas hay), con `MarcoMinimo`.
//
// CAÍDA EXTERNA. Si la base no responde (o todavía no tiene el calendario), lo dice con sus palabras y el selector del Plan sigue ofreciendo todas las campañas; si lo que falla es solo la
// historia, el calendario se arma igual y la columna dice que no pudo leerse (nunca un número a medias).

const SUBTITULO = "Elige con cuáles campañas te quedas el año, cuáles se repiten y cuáles descansan.";

type Vista = "lista" | "linea";

function ContenidoDelCalendario({
  campanas,
  falla,
  calendarioFallo,
  evidencias,
  tienda,
  historiaFallo,
  anioPedido,
  vistaPedida,
  hojaPedida,
}: {
  campanas: CampanasLeidas | null;
  falla: string | null;
  calendarioFallo: boolean;
  evidencias: Readonly<Record<string, EvidenciaDeCampana | null>>;
  tienda: { id: string; nombre: string } | null;
  historiaFallo: boolean;
  anioPedido: string | undefined;
  vistaPedida: string | undefined;
  /** «nueva» o la clave de una campaña: abre su hoja al llegar (lo pide el selector del Plan). */
  hojaPedida: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const calendario = campanas?.calendario ?? null;
  const hoy = calendario?.hoy ?? hoyLima();
  const [anio, setAnio] = useState(() => anioDelCalendario(anioPedido, hoy));
  const [vista, setVista] = useState<Vista>(vistaPedida === "linea" ? "linea" : "lista");
  const lista = useMemo(() => (campanas && calendario ? campanasDelCalendario(campanas, anio, hoy) : []), [campanas, calendario, anio, hoy]);
  const grupos = useMemo(() => agruparCalendario(lista, anio, evidencias), [lista, anio, evidencias]);
  const resumen = resumenDelCalendario(grupos, anio);
  const ancla = claveDeLaQueMasPesa(grupos, evidencias);

  // La hoja abierta: una campaña (o `null` = una nueva).
  const [hoja, setHoja] = useState<{ campana: CampanaDelCalendario | null } | null>(null);
  // El selector del Plan puede mandar abrir una al llegar (`?hoja=nueva` o `?hoja=<clave>`), también cuando ya se está en el Calendario: la URL cambia y la hoja se abre.
  // Se ajusta al ver que el pedido cambió (no en un efecto): así no hay un cuadro con la hoja cerrada y las demás cosas que miran (el año, las campañas) no la abren sin querer.
  const [pedidaVista, setPedidaVista] = useState<string | undefined>(undefined);
  if (hojaPedida !== pedidaVista) {
    setPedidaVista(hojaPedida);
    if (hojaPedida && campanas && calendario) {
      if (hojaPedida === "nueva") setHoja({ campana: null });
      else {
        const c = campanasDelCalendario(campanas, anioDelCalendario(anioPedido, hoy), hoy).find((x) => x.clave === hojaPedida);
        if (c) setHoja({ campana: c });
      }
    }
  }
  // La hoja de armar el plan de una campaña (`ranura`).
  const [armando, setArmando] = useState<RanuraCalendario | null>(null);

  /** Cierra la hoja y, si llegó pedida por la URL (`?hoja=`), la quita de ahí: recargar no la vuelve a abrir. */
  function cerrarHoja() {
    setHoja(null);
    if (!parametros.get("hoja")) return;
    const p = new URLSearchParams(parametros.toString());
    p.delete("hoja");
    router.replace(`${pathname}${p.size > 0 ? `?${p.toString()}` : ""}`, { scroll: false });
  }

  function armar(c: CampanaDelCalendario) {
    const ranura = campanas ? ranurasSinPlan(campanas, hoy).find((r) => claveDeRanura(r) === `${c.etiquetaId ?? `propia:${c.decisionId}`}|${anio}`) : undefined;
    // Puede que esa campaña ya tenga un plan ARCHIVADO de ese año (la base no deja otro igual): no hay ranura y se le dice dónde está.
    if (!ranura) return void avisar.error(`${c.nombre} ya tiene su plan de ${anio} (archivado o armado hace un momento): ábrelo desde el selector, en «Campañas archivadas».`);
    setArmando(ranura);
  }

  if (!campanas) {
    return <Aviso tono="error">No se pudieron leer las campañas. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.</Aviso>;
  }
  if (!calendario) {
    return (
      <Aviso tono={calendarioFallo ? "error" : "info"} titulo={calendarioFallo ? "No se pudo leer tu calendario" : "El calendario todavía no está listo"}>
        {calendarioFallo
          ? "Recarga la página; si sigue, avísale a tu líder. Mientras tanto, el selector del Plan ofrece todas las campañas, como siempre."
          : "Esta versión de la base de datos todavía no lo guarda. Mientras tanto, el selector del Plan ofrece todas las campañas, como siempre."}
      </Aviso>
    );
  }

  return (
    <div className="space-y-6">
      {falla && (
        <Aviso tono="atencion" titulo="No se pudo leer el plan de campaña">
          La cabecera y los avisos no salen ahora; el calendario sí funciona. Recarga la página si quieres verlos.
        </Aviso>
      )}
      {historiaFallo && (
        <Aviso tono="atencion" titulo="No se pudo leer tu historia">
          El calendario funciona igual; la columna «Qué dice tu historia» vuelve cuando recargues la página.
        </Aviso>
      )}

      <div data-guia="calendario.resumen">
        <TituloSeccion
          dato={resumen.detalle}
          accion={
            <Boton peso="primario" data-guia="calendario.nueva" aria-haspopup="dialog" onClick={() => setHoja({ campana: null })}>
              + Campaña nueva
            </Boton>
          }
        >
          {resumen.titulo}
        </TituloSeccion>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Año" data-guia="calendario.anios" className="flex flex-wrap items-center gap-2">
          {aniosDelCalendario(hoy).map((a) => (
            <button key={a} type="button" className="pildora-cayla" aria-pressed={a === anio} onClick={() => setAnio(a)}>
              {a}
            </button>
          ))}
        </nav>
        <div data-guia="calendario.vista">
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Cómo se ve"
            valor={vista}
            onCambio={(v) => setVista(v === "linea" ? "linea" : "lista")}
            opciones={[
              { clave: "lista", etiqueta: "Lista", icono: <List aria-hidden className="h-4 w-4" />, guia: "calendario.vista-lista" },
              { clave: "linea", etiqueta: "Línea del año", icono: <CalendarRange aria-hidden className="h-4 w-4" />, guia: "calendario.vista-linea" },
            ]}
          />
        </div>
      </div>

      {vista === "lista" ? (
        <ListaDelCalendario grupos={grupos} anio={anio} hoy={hoy} evidencias={evidencias} tienda={tienda} alEditar={(c) => setHoja({ campana: c })} alArmar={armar} />
      ) : (
        <LineaDelAnio campanas={[...grupos.enMiPlan, ...grupos.pausadas, ...grupos.noLasCompro]} anio={anio} hoy={hoy} claveDeLaQueMasPesa={ancla} alEditar={(c) => setHoja({ campana: c })} />
      )}

      {hoja && (
        <HojaDeCampanaCalendario
          key={hoja.campana?.clave ?? "nueva"}
          campana={hoja.campana}
          anio={anio}
          hoy={hoy}
          evidencia={hoja.campana ? (evidencias[hoja.campana.clave] ?? null) : null}
          tienda={tienda}
          historiaFallo={historiaFallo}
          otrosNombres={calendario.decisiones.filter((d) => d.etiquetaId === null && d.id !== hoja.campana?.decisionId).map((d) => d.nombre ?? "")}
          nombresDeInsignias={campanas.etiquetas.map((e) => e.nombre)}
          onClose={cerrarHoja}
        />
      )}
      {armando && (
        <NuevaCampanaModal
          key={claveDeRanura(armando)}
          etiquetas={campanas.etiquetas}
          nombresEnUso={campanas.planes.map((c) => c.nombre)}
          propias={calendario.decisiones}
          ranura={armando}
          onClose={() => setArmando(null)}
        />
      )}
    </div>
  );
}

export function CalendarioPlan({
  datos,
  falla,
  preparacion,
  campanas,
  puedeContar,
  planPedidoNoExiste = false,
  propuesta = null,
  pedido = null,
  historia = null,
  descuentos = null,
  plazo = null,
  versiones = null,
  versionesFallo = false,
  calendarioFallo = false,
  evidencias,
  tienda,
  historiaFallo,
  anio,
  vista,
  hoja,
}: {
  datos: unknown;
  falla: string | null;
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  planPedidoNoExiste?: boolean;
  propuesta?: unknown;
  pedido?: unknown;
  historia?: unknown;
  descuentos?: unknown;
  plazo?: unknown;
  versiones?: unknown;
  versionesFallo?: boolean;
  /** La lectura del calendario FALLÓ (no es que la base todavía no lo tenga). */
  calendarioFallo?: boolean;
  /** Lo que dijo la historia de cada campaña (clave → evidencia); vacío si no se pudo leer. */
  evidencias: Readonly<Record<string, EvidenciaDeCampana | null>>;
  tienda: { id: string; nombre: string } | null;
  historiaFallo: boolean;
  /** Del `?anio=` de la URL. */
  anio?: string;
  vista?: string;
  hoja?: string;
}) {
  const derivado = usePlanDerivado({ datos, descuentos, propuesta, historia, pedido, plazo, versiones, preparacion, puedeContar, campanas });
  const contenido = (
    <ContenidoDelCalendario
      campanas={campanas}
      falla={derivado.plan === null ? falla : null}
      calendarioFallo={calendarioFallo}
      evidencias={evidencias}
      tienda={tienda}
      historiaFallo={historiaFallo}
      anioPedido={anio}
      vistaPedida={vista}
      hojaPedida={hoja}
    />
  );
  // Sin ninguna campaña todavía, el Calendario es justo donde se decide cuáles hay: se ve igual, sin cabecera de campaña ni avisos.
  if (derivado.plan === null) {
    return (
      <MarcoMinimo activa="calendario" subtitulo={SUBTITULO}>
        {contenido}
      </MarcoMinimo>
    );
  }
  return (
    <MarcoPlan activa="calendario" derivado={derivado} campanas={campanas} planPedidoNoExiste={planPedidoNoExiste} versionesFallo={versionesFallo} subtitulo={SUBTITULO}>
      {() => contenido}
    </MarcoPlan>
  );
}
