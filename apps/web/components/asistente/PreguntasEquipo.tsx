"use client";

import { useState, type ReactNode } from "react";
import { MessageCircleQuestion, SearchX } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import {
  CLASES,
  claseDe,
  filtrarPreguntas,
  nombreDeGuia,
  nombreDeModulo,
  ORDEN_CLASES,
  porcentaje,
  queRespondio,
  type DatosEquipo,
  type FiltroEquipo,
  type PreguntaEquipo,
} from "@/lib/asistente/equipo";

// Gestión ▸ Preguntas del equipo (ADR-0529, actividad 9). Arriba, las cifras del mes (las que filtran se rellenan al tocarlas); después,
// dónde las llevó y qué accesos piden; abajo, la lista con sus filtros en una tarjeta, a todo el ancho. Todo se filtra en el navegador:
// el servidor ya leyó el mes (sin loader, ADR-0149).

const POR_PAGINA = 25;
const PLANTILLA = "sm:grid-cols-[6.5rem_11rem_minmax(0,1fr)_14rem_6rem]";
const COLUMNAS: Columna[] = [{ titulo: "Cuándo" }, { titulo: "Quién" }, { titulo: "Pregunta" }, { titulo: "Qué le respondió" }, { titulo: "¿Le sirvió?" }];

const DIA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });
const HORA = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" });
/** «27 oct · 11:36», en la hora de Lima. */
const cuando = (iso: string) => `${DIA.format(new Date(iso)).replace(".", "")} · ${HORA.format(new Date(iso))}`;
const NOMBRE_MES = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });

const FILTROS: { clave: FiltroEquipo; texto: string }[] = [
  { clave: "todas", texto: "Todas" },
  ...ORDEN_CLASES.map((c) => ({ clave: c as FiltroEquipo, texto: CLASES[c].plural })),
  { clave: "no_sirvio", texto: "No le sirvió" },
];

/** Lo que se ve bajo «Qué le respondió»: la pantalla a la que la llevó o el módulo que pide. */
function detalleDe(p: PreguntaEquipo): string | null {
  if (p.tipo === "sin_acceso") return nombreDeModulo(p.modulo);
  if (p.tipo === "guia") return nombreDeGuia(p.guiaId);
  return null;
}

function FilaPregunta({ p, todasLasSedes }: { p: PreguntaEquipo; todasLasSedes: boolean }) {
  const clase = CLASES[claseDe(p.tipo)];
  const detalle = detalleDe(p);
  const quien = p.persona ?? "Una terminal";
  return (
    <div className={fila(PLANTILLA)} role="row">
      <span className={celda("izq", "text-[13px] text-taupe")} role="cell">
        {cuando(p.creadaEn)}
      </span>
      <span className="flex min-w-0 items-center gap-2" role="cell">
        <AvatarPersona personaId={p.personaId} nombre={quien} tamano={24} terminal={!p.persona} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{quien}</span>
          {todasLasSedes && p.sede ? <span className="block truncate text-xs text-taupe">{p.sede}</span> : null}
        </span>
      </span>
      <span className="min-w-0 text-sm" role="cell">
        <span className="block break-words">{p.pregunta}</span>
        {p.comentario ? <span className="mt-0.5 block break-words text-xs text-taupe">Buscaba: «{p.comentario}»</span> : null}
      </span>
      <span className="min-w-0" role="cell">
        <Chip tono={clase.tono} title={queRespondio(p)}>
          {clase.nombre}
        </Chip>
        <span className="mt-1 block truncate text-xs text-taupe">{detalle ? `${queRespondio(p)} · ${detalle}` : queRespondio(p)}</span>
      </span>
      <span role="cell">
        {p.sirvio === null ? (
          <span className="text-xs text-taupe">Sin contestar</span>
        ) : (
          <Chip tono={p.sirvio ? "verde" : "rojo"}>{p.sirvio ? "Sí" : "No"}</Chip>
        )}
      </span>
    </div>
  );
}

export function PreguntasEquipo({
  datos,
  encendido,
  puedeEncender,
  todasLasSedes,
  mes,
  informe,
}: {
  datos: DatosEquipo;
  /** Si el asistente está encendido en la sede que se mira (en CAYLA Global, en alguna). */
  encendido: boolean;
  /** Si la cuenta ve Configuración, donde se enciende. */
  puedeEncender: boolean;
  todasLasSedes: boolean;
  mes: { anio: number; mes: number };
  /** Las mejoras del último informe del lunes (actividad 10), si la cuenta las ve: van después de las cifras. */
  informe?: ReactNode;
}) {
  const [filtro, setFiltro] = useState<FiltroEquipo>("todas");
  const [pagina, setPagina] = useState(1);
  const { cifras, porClase } = datos;
  const nombreMes = NOMBRE_MES.format(new Date(Date.UTC(mes.anio, mes.mes - 1, 1)));

  if (cifras.total === 0) {
    return (
      <>
        {informe}
        <div className="card-cayla">
          <Vacio
            icono={<MessageCircleQuestion />}
            titulo={`Nadie preguntó en ${nombreMes}`}
            accion={!encendido && puedeEncender ? { texto: "Encenderlo en Configuración", href: "/configuracion?tab=tiendas" } : undefined}
            guia="preguntas.vacio"
          >
            {encendido
              ? "Cuando alguien del equipo use «Preguntar» en la cabecera, su pregunta aparece aquí con lo que se le respondió."
              : todasLasSedes
                ? "El asistente todavía no está encendido en ninguna sede. Se enciende sede por sede en Configuración ▸ Tiendas y caja."
                : "El asistente está apagado en esta sede. Se enciende en Configuración ▸ Tiendas y caja."}
          </Vacio>
        </div>
      </>
    );
  }

  const visibles = filtrarPreguntas(datos.preguntas, filtro);
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const enPagina = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const elegir = (f: FiltroEquipo) => {
    setFiltro((antes) => (antes === f && f !== "todas" ? "todas" : f));
    setPagina(1);
  };
  const contestaron = cifras.sirvioSi + cifras.sirvioNo;
  const mayorPantalla = Math.max(1, ...datos.pantallas.map((p) => p.n));
  const mayorAcceso = Math.max(1, ...datos.accesos.map((a) => a.n));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-guia="preguntas.cifras">
        <TarjetaCifra etiqueta="Preguntas" valor={cifras.total}>
          {cifras.personas === 1 ? "De 1 persona" : `De ${cifras.personas} personas`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Resueltas" valor={porClase.resuelta} punto="verde" onClick={() => elegir("resuelta")} activa={filtro === "resuelta"}>
          {porcentaje(porClase.resuelta, cifras.total)} del total
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Sin respuesta" valor={porClase.sin_respuesta} punto="ambar" onClick={() => elegir("sin_respuesta")} activa={filtro === "sin_respuesta"}>
          Lo que falta o no está escrito
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Piden un acceso" valor={porClase.sin_acceso} punto="neutro" onClick={() => elegir("sin_acceso")} activa={filtro === "sin_acceso"}>
          Vive en un módulo que su rol no tiene
        </TarjetaCifra>
        <TarjetaCifra etiqueta="No les sirvió" valor={cifras.sirvioNo} punto="rojo" onClick={() => elegir("no_sirvio")} activa={filtro === "no_sirvio"}>
          {contestaron === 0 ? "Nadie contestó «¿Te sirvió?»" : `De ${contestaron} que contestaron`}
        </TarjetaCifra>
      </div>

      {informe}

      {/* Lo que resume el mes, en una fila sobre la lista: así la lista usa todo el ancho y la pregunta no se parte (ADR-0462). */}
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="card-cayla space-y-3 p-5" data-guia="preguntas.pantallas">
          <TituloSeccion cuenta={datos.pantallas.length || undefined}>Dónde las llevó</TituloSeccion>
          {datos.pantallas.length === 0 ? (
            <p className="text-sm text-taupe">Todavía ninguna pregunta llevó a una pantalla.</p>
          ) : (
            <ul className="space-y-3">
              {datos.pantallas.map((p) => (
                <li key={p.guiaId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{nombreDeGuia(p.guiaId) ?? p.guiaId}</span>
                    <span className="shrink-0 tabular-nums text-taupe">
                      {p.n}
                      {p.no > 0 ? ` · ${p.no} no le sirvió` : ""}
                    </span>
                  </div>
                  <BarraAvance pct={(p.n / mayorPantalla) * 100} alto="fina" tono="tinta" decorativa />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-taupe">Una pantalla que se pregunta mucho puede estar escondida: conviene acercarla en el menú.</p>
        </section>

        <section className="card-cayla space-y-3 p-5" data-guia="preguntas.accesos">
          <TituloSeccion cuenta={datos.accesos.length || undefined}>Accesos que piden</TituloSeccion>
          {datos.accesos.length === 0 ? (
            <p className="text-sm text-taupe">Nadie buscó algo que su rol no tenga.</p>
          ) : (
            <ul className="space-y-3">
              {datos.accesos.map((a) => (
                <li key={a.modulo}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{nombreDeModulo(a.modulo)}</span>
                    <span className="shrink-0 tabular-nums text-taupe">{a.n}</span>
                  </div>
                  <BarraAvance pct={(a.n / mayorAcceso) * 100} alto="fina" tono="tinta" decorativa />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-taupe">Se dan en Colaboradores ▸ Roles y accesos.</p>
        </section>
      </div>

      <Tabla guia="preguntas.lista">
        <div className="flex flex-wrap gap-2 px-5 py-3" data-guia="preguntas.filtros" role="group" aria-label="Filtrar las preguntas">
          {FILTROS.map((f) => {
            const n = f.clave === "todas" ? cifras.total : f.clave === "no_sirvio" ? cifras.sirvioNo : porClase[f.clave];
            if (f.clave !== "todas" && n === 0) return null;
            return (
              <button key={f.clave} type="button" onClick={() => elegir(f.clave)} aria-pressed={filtro === f.clave} className="pildora-cayla">
                {f.texto}
                <span className="pildora-cayla__n">· {n}</span>
              </button>
            );
          })}
        </div>
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {enPagina.length === 0 ? (
          <Vacio
            tamano="chico"
            icono={<SearchX />}
            titulo="Ninguna en las últimas 300"
            filtros={[{ texto: FILTROS.find((x) => x.clave === filtro)?.texto ?? "", onQuitar: () => elegir("todas") }]}
          >
            Las cifras de arriba cuentan todo el mes; la lista muestra las 300 más recientes.
          </Vacio>
        ) : (
          enPagina.map((p) => <FilaPregunta key={p.id} p={p} todasLasSedes={todasLasSedes} />)
        )}
        {totalPaginas > 1 ? (
          <div className="flex justify-end px-5 py-2.5">
            <PaginacionLocal pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} />
          </div>
        ) : null}
      </Tabla>
    </>
  );
}
