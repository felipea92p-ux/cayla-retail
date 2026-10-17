"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, Monitor, Moon, Smartphone, Sun, X } from "lucide-react";
import {
  COLOR_PROPIO_DE_PARTIDA,
  ESTILOS,
  PALETAS,
  aplicarEstilo,
  colorQueSeLee,
  estiloDelDiseno,
  paletaPropia,
  revisarDiseno,
  seLee,
  type Aviso as AvisoDeRevision,
  type ColoresPropios,
  type DisenoDeCampana,
  type Tema,
} from "@cayla-retail/portada";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { EtiquetaAhora, MarcaCampo, VozDelEstado } from "@/components/alta-producto/guia";
import { MarcoWeb } from "@/components/tienda-web/MarcoWeb";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";
import {
  PASOS_DEL_DISENO,
  contextoDeRevision,
  disenoParaEditar,
  estadoDePasos,
  estadoDelBorrador,
  resumenColores,
  resumenEstilo,
  type ClavePaso,
  type EstadoDiseno,
} from "@/lib/campana-diseno";
import { Lienzo } from "./Lienzo";
import { PortadaDeCampana, type CampanaDePortada, type PiezaDePortada } from "./PortadaDeCampana";
import { PublicarDiseno } from "./PublicarDiseno";
import { VolverAlAnterior } from "./VolverAlAnterior";

/** Cuánto se espera después del último toque para guardar el borrador (varios toques seguidos, un solo guardado). */
const ESPERA_GUARDADO_MS = 450;

type Guardado = "al-dia" | "guardando" | "error" | "choque";

/**
 * Tienda web ▸ Campañas ▸ una campaña ▸ «Diseño en la web» (ADR-0436, actividad 4; maqueta, pantalla 2). A la izquierda los pasos (un
 * estilo de partida y sus colores; los demás llegan en la actividad 7), a la derecha la portada como la verá el cliente, en computadora o
 * celular y en claro u oscuro, y abajo la revisión y «Publicar». Cada toque se guarda solo como BORRADOR (`guardar_diseno_borrador`,
 * suelto del combo «Responsable»): la web sigue mostrando lo publicado hasta que alguien publica.
 */
export function DisenoCampana({
  campana,
  estado,
  piezas,
  paletasDePrendas,
  despues,
  ahora,
}: {
  campana: CampanaDePortada & { id: string };
  estado: EstadoDiseno;
  piezas: readonly PiezaDePortada[];
  paletasDePrendas: readonly ColoresPropios[];
  /** Qué sale en la portada cuando esta campaña termina («Halloween», «Lo nuevo»). */
  despues: string;
  ahora: number;
}) {
  const router = useRouter();
  const inicial = disenoParaEditar(estado);
  const [diseno, setDiseno] = useState<DisenoDeCampana>(inicial.diseno);
  const [guardado, setGuardado] = useState<Guardado>("al-dia");
  const [vista, setVista] = useState<"pc" | "cel">("pc");
  const [temaWeb, setTemaWeb] = useState<Tema>("claro");
  const [abierto, setAbierto] = useState<ClavePaso | null>("estilo");
  const [visitados, setVisitados] = useState<ReadonlySet<ClavePaso>>(() => new Set<ClavePaso>(["estilo"]));
  const [publicando, setPublicando] = useState(false);
  const [volviendo, setVolviendo] = useState(false);

  // El guardado del borrador: uno a la vez, con la versión sobre la que se trabajó (si otra persona lo cambió, no se pisa).
  const version = useRef(inicial.version);
  const pendiente = useRef<DisenoDeCampana | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCurso = useRef<Promise<boolean> | null>(null);

  async function guardarPendiente(): Promise<boolean> {
    while (enCurso.current) await enCurso.current;
    const d = pendiente.current;
    if (!d) return true;
    pendiente.current = null;
    const tarea = (async () => {
      try {
        // `x-espera: no`: guardar el borrador no bloquea la pantalla con el loader (se guarda a cada toque, por detrás).
        const { data, error } = await firmar(
          createClient()
            .rpc("guardar_diseno_borrador" as never, { p_etiqueta_id: campana.id, p_diseno: d, p_version: version.current } as never)
            .setHeader("x-espera", "no"),
          firmaOmitida("campana_diseno_borrador"),
        );
        if (error) {
          setGuardado(error.hint === "diseno_cambiado" ? "choque" : "error");
          return false;
        }
        version.current = data as unknown as number;
        if (!pendiente.current) setGuardado("al-dia");
        return true;
      } catch {
        setGuardado("error");
        return false;
      }
    })();
    enCurso.current = tarea;
    const ok = await tarea;
    enCurso.current = null;
    return ok;
  }

  /** Guarda ya lo que falte (antes de publicar): la versión que quedó, o `null` si no se pudo. */
  async function guardarYa(): Promise<number | null> {
    if (reloj.current) clearTimeout(reloj.current);
    const ok = await guardarPendiente();
    return ok ? version.current : null;
  }

  function cambiar(nuevo: DisenoDeCampana) {
    if (guardado === "choque") return;
    setDiseno(nuevo);
    pendiente.current = nuevo;
    setGuardado("guardando");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void guardarPendiente(), ESPERA_GUARDADO_MS);
  }

  // Al salir de la pantalla con un cambio sin guardar, se guarda igual (el último toque no se pierde).
  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
      if (pendiente.current) void guardarPendiente();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar
    [],
  );

  function abrir(clave: ClavePaso) {
    setAbierto((a) => (a === clave ? null : clave));
    setVisitados((v) => new Set([...v, clave]));
  }

  const { estados, sigue } = estadoDePasos(PASOS_DEL_DISENO, visitados, abierto);
  const revision = revisarDiseno(diseno, contextoDeRevision(piezas));
  const comoEsta = estadoDelBorrador(estado, diseno);
  const resumen: Record<ClavePaso, string> = { estilo: resumenEstilo(diseno), colores: resumenColores(diseno) };
  const puedePublicar = !revision.bloquea && comoEsta === "borrador" && guardado !== "choque" && guardado !== "error";

  return (
    <div className="tw-editor">
      <div className="tw-pasos">
        {PASOS_DEL_DISENO.map((p, i) => {
          const abiertoAqui = abierto === p.clave;
          return (
            <section key={p.clave} className="tw-paso" data-abierto={abiertoAqui ? "" : undefined}>
              <button type="button" className="tw-paso-cab" aria-expanded={abiertoAqui} onClick={() => abrir(p.clave)}>
                <MarcaCampo estado={estados[p.clave]} />
                <span className="min-w-0">
                  <VozDelEstado estado={estados[p.clave]} />
                  <b>
                    {i + 1}. {p.titulo}
                  </b>
                  <small>{resumen[p.clave]}</small>
                </span>
                {sigue === p.clave && <EtiquetaAhora />}
                <ChevronDown aria-hidden className="tw-paso-flecha" />
              </button>
              {abiertoAqui && (
                <div className="tw-paso-cuerpo">
                  {p.clave === "estilo" ? (
                    <PasoEstilo diseno={diseno} campana={campana} piezas={piezas} ahora={ahora} onCambiar={cambiar} />
                  ) : (
                    <PasoColores diseno={diseno} paletasDePrendas={paletasDePrendas} onCambiar={cambiar} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="tw-editor-vista space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Dónde se mira"
            valor={vista}
            onCambio={(v) => setVista(v as "pc" | "cel")}
            opciones={[
              { clave: "pc", etiqueta: "Computadora", icono: <Monitor aria-hidden className="h-4 w-4" /> },
              { clave: "cel", etiqueta: "Celular", icono: <Smartphone aria-hidden className="h-4 w-4" /> },
            ]}
          />
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Tema de la tienda"
            valor={temaWeb}
            onCambio={(v) => setTemaWeb(v as Tema)}
            opciones={[
              { clave: "claro", etiqueta: "Claro", icono: <Sun aria-hidden className="h-4 w-4" /> },
              { clave: "oscuro", etiqueta: "Oscuro", icono: <Moon aria-hidden className="h-4 w-4" /> },
            ]}
          />
        </div>

        <div>
          {vista === "pc" ? (
            <MarcoWeb etiqueta={`La portada de ${campana.nombre} como la verá el cliente en la computadora`}>
              <Lienzo ancho={1280}>
                <PortadaDeCampana campana={campana} diseno={diseno} tema={temaWeb} piezas={piezas} ahora={ahora} />
              </Lienzo>
            </MarcoWeb>
          ) : (
            <div className="tw-celular" aria-label={`La portada de ${campana.nombre} como la verá el cliente en el celular`} role="figure">
              <Lienzo ancho={375}>
                <PortadaDeCampana campana={campana} diseno={diseno} tema={temaWeb} piezas={piezas} ahora={ahora} celular />
              </Lienzo>
            </div>
          )}
        </div>

        <Revision avisos={revision.avisos} />

        {guardado === "choque" && (
          <Aviso
            tono="atencion"
            titulo="Alguien más cambió o publicó este diseño"
            accion={
              <Boton peso="fantasma" onClick={() => router.refresh()}>
                Ver el último
              </Boton>
            }
          >
            Para no pisar su trabajo, tus cambios de ahora no se guardaron.
          </Aviso>
        )}
        {guardado === "error" && (
          <Aviso tono="error" titulo="No se pudo guardar el borrador">
            Revisa la conexión; el próximo cambio lo vuelve a intentar.
          </Aviso>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-4">
          <p className="mr-auto min-w-0 text-[13px] text-tinta/70">
            {guardado === "guardando"
              ? "Guardando el borrador…"
              : comoEsta === "publicado"
                ? "Es el diseño que ve el cliente hoy."
                : comoEsta === "de-siempre"
                  ? "Es la portada de siempre: cambia algo para darle su diseño."
                  : "Borrador guardado: la web sigue mostrando el diseño publicado."}
          </p>
          {(estado.publicado || estado.anterior) && (
            <Boton peso="fantasma" onClick={() => setVolviendo(true)}>
              Volver al anterior {/* unificar-fijo: regresa el diseño que estaba publicado (maqueta aprobada), no es la vuelta de una pantalla */}
            </Boton>
          )}
          <EnlaceVer href={DIRECCION_TIENDA_ONLINE} target="_blank">
            Ver en la web
          </EnlaceVer>
          <Boton
            peso="primario"
            onClick={() => setPublicando(true)}
            disabled={!puedePublicar}
            title={revision.bloquea ? "Para publicar falta que la letra se lea sobre el fondo." : undefined}
          >
            Publicar diseño
          </Boton>
          {revision.bloquea && <p className="w-full text-right text-[12.5px] text-tinta/70">Para publicar falta: que la letra se lea sobre el fondo.</p>}
        </div>
      </div>

      {publicando && (
        <PublicarDiseno
          campana={campana}
          diseno={diseno}
          piezas={piezas}
          avisos={revision.avisos}
          despues={despues}
          ahora={ahora}
          guardarYa={guardarYa}
          onClose={() => setPublicando(false)}
        />
      )}
      {volviendo && <VolverAlAnterior campana={campana} estado={estado} onClose={() => setVolviendo(false)} />}
    </div>
  );
}

/** Paso 1: los ocho estilos de partida, cada uno con su portada en chico. El texto y las prendas que ya se eligieron se quedan. */
function PasoEstilo({
  diseno,
  campana,
  piezas,
  ahora,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada;
  piezas: readonly PiezaDePortada[];
  ahora: number;
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const actual = estiloDelDiseno(diseno)?.id ?? null;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-tinta/70">Un toque y la portada queda lista. Después cambia lo que quieras.</p>
      <div className="tw-opciones">
        {ESTILOS.map((e) => {
          const con = aplicarEstilo(diseno, e.id);
          return (
            <button key={e.id} type="button" className="tw-opcion" aria-pressed={actual === e.id} onClick={() => onCambiar(con)}>
              <Lienzo ancho={1280} alto={720}>
                <PortadaDeCampana campana={campana} diseno={con} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
              <span className="tw-opcion-nombre">
                {e.nombre}
                <small>{e.nota}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Paso 2: las paletas curadas, las sacadas de las prendas de la campaña y «Mi color» (la letra se elige sola). */
function PasoColores({
  diseno,
  paletasDePrendas,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  paletasDePrendas: readonly ColoresPropios[];
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const propia = diseno.paleta === "propia" ? diseno.colores : null;
  const esMiColor = propia?.nombre === "Mi color";
  const miColorSeLee = esMiColor && seLee(diseno, "claro") && seLee(diseno, "oscuro");
  const elegir = (colores: ColoresPropios) => onCambiar({ ...diseno, paleta: "propia", colores });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <TituloGrupo>Paletas que siempre se leen bien</TituloGrupo>
        <div className="tw-muestras">
          {PALETAS.map((p) => (
            <Muestra
              key={p.id}
              nombre={p.nombre}
              fondo={p.fondo}
              acento={p.acento}
              elegida={diseno.paleta === p.id}
              onClick={() => onCambiar({ ...diseno, paleta: p.id, colores: null })}
            />
          ))}
        </div>
      </div>
      {paletasDePrendas.length > 0 && (
        <div className="space-y-2">
          <TituloGrupo>Sacadas de las prendas de esta campaña</TituloGrupo>
          <div className="tw-muestras">
            {paletasDePrendas.map((p) => (
              <Muestra key={p.fondo} nombre={p.nombre} fondo={p.fondo} acento={p.acento} elegida={propia?.fondo === p.fondo && propia.nombre === p.nombre} onClick={() => elegir(p)} />
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <TituloGrupo nota="la letra se elige sola">O tu propio color</TituloGrupo>
        <label className="tw-mi-color">
          <input
            type="color"
            value={esMiColor ? propia.fondo : COLOR_PROPIO_DE_PARTIDA}
            onChange={(e) => elegir(paletaPropia(e.target.value))}
            aria-label="Elegir mi color"
          />
          <span className="text-[13px] text-tinta">
            <b className="block font-semibold">Elegir mi color</b>
            <span className="text-tinta/70">{esMiColor ? (miColorSeLee ? "Se lee bien." : "Con este color la letra no se lee bien.") : "Toca el círculo."}</span>
          </span>
        </label>
        {esMiColor && !miColorSeLee && (
          <Aviso
            tono="atencion"
            chico
            accion={
              <Boton peso="fantasma" onClick={() => elegir(paletaPropia(colorQueSeLee(propia.fondo)))}>
                Usar uno un poco más oscuro
              </Boton>
            }
          >
            Ni la letra clara ni la oscura se leen bien sobre este tono.
          </Aviso>
        )}
      </div>
    </div>
  );
}

/** Una muestra de color: el fondo con su acento en un punto. */
function Muestra({ nombre, fondo, acento, elegida, onClick }: { nombre: string; fondo: string; acento: string; elegida: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tw-muestra" aria-pressed={elegida} title={nombre} aria-label={nombre} onClick={onClick} data-color-dato style={{ background: fondo }}>
      <i style={{ background: acento }} />
    </button>
  );
}

/** La revisión: lo que se midió de la portada (que la letra se lea en los dos temas, que las prendas tengan foto). */
export function Revision({ avisos }: { avisos: readonly AvisoDeRevision[] }) {
  return (
    <ul className="tw-revision" aria-label="Revisión del diseño">
      {avisos.map((a) => (
        <li key={a.texto} data-tono={a.tono}>
          {a.tono === "ok" ? <Check aria-hidden /> : a.tono === "ojo" ? <Eye aria-hidden /> : <X aria-hidden />}
          <span>{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}
