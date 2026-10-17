"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Dices, Eye, Monitor, Moon, Smartphone, Sun, X } from "lucide-react";
import { mismoDiseno, revisarDiseno, type Aviso as AvisoDeRevision, type ColoresPropios, type DisenoDeCampana, type Tema } from "@cayla-retail/portada";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton } from "@/components/ui/campos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
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
  resumenAcomodo,
  resumenColores,
  resumenDetalles,
  resumenEstilo,
  resumenFondo,
  resumenPrendas,
  resumenTexto,
  sorprendeme,
  type CampanaDePortada,
  type ClavePaso,
  type EstadoDiseno,
  type PiezaDePortada,
} from "@/lib/campana-diseno";
import { Lienzo } from "./Lienzo";
import { PasoAcomodo, PasoColores, PasoDetalles, PasoEstilo, PasoFondo, PasoPrendas, PasoTexto } from "./PasosDelDiseno";
import { PortadaDeCampana } from "./PortadaDeCampana";
import { PublicarDiseno } from "./PublicarDiseno";
import { VolverAlAnterior } from "./VolverAlAnterior";

/** Cuánto se espera después del último toque para guardar el borrador (varios toques seguidos, un solo guardado). */
const ESPERA_GUARDADO_MS = 450;

/** Cuántos pasos atrás guarda «Deshacer» (lo de esta visita: al salir de la pantalla se olvida). */
const DESHACER_MAX = 30;

type Guardado = "al-dia" | "guardando" | "error" | "choque";

/**
 * Tienda web ▸ Campañas ▸ una campaña ▸ «Diseño en la web» (ADR-0436, actividades 4 y 7; maqueta, pantalla 2). A la izquierda los siete
 * pasos (un estilo de partida, los colores, el fondo, cómo se acomoda y, opcionales, el texto, las prendas y los detalles), a la derecha
 * la portada como la verá el cliente, en computadora o celular y en claro u oscuro, con «Deshacer» y «Sorpréndeme», y abajo la revisión
 * y «Publicar». Cada toque se guarda solo como BORRADOR (`guardar_diseno_borrador`, suelto del combo «Responsable»): la web sigue
 * mostrando lo publicado hasta que alguien publica.
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
  // «Deshacer»: los diseños de antes de cada toque. Escribir la frase cuenta como un solo toque hasta que se toca otra cosa.
  const [historial, setHistorial] = useState<readonly DisenoDeCampana[]>([]);
  const escribiendo = useRef(false);

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

  /** Un toque: lo de antes queda para «Deshacer» (la frase, una vez por tanda de escritura) y se guarda el borrador. */
  function cambiar(nuevo: DisenoDeCampana, { escritura = false }: { escritura?: boolean } = {}) {
    if (guardado === "choque" || mismoDiseno(nuevo, diseno)) return;
    if (!(escritura && escribiendo.current)) setHistorial((h) => [...h.slice(-(DESHACER_MAX - 1)), diseno]);
    escribiendo.current = escritura;
    aplicar(nuevo);
  }

  function deshacer() {
    const anterior = historial[historial.length - 1];
    if (!anterior || guardado === "choque") return;
    setHistorial((h) => h.slice(0, -1));
    escribiendo.current = false;
    aplicar(anterior);
  }

  function aplicar(nuevo: DisenoDeCampana) {
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
  const resumen: Record<ClavePaso, string> = {
    estilo: resumenEstilo(diseno),
    colores: resumenColores(diseno),
    fondo: resumenFondo(diseno),
    acomodo: resumenAcomodo(diseno),
    texto: resumenTexto(diseno),
    prendas: resumenPrendas(diseno, piezas),
    detalles: resumenDetalles(diseno, campana),
  };
  const cuerpo = (clave: ClavePaso) => {
    switch (clave) {
      case "estilo":
        return <PasoEstilo diseno={diseno} campana={campana} piezas={piezas} ahora={ahora} onCambiar={cambiar} />;
      case "colores":
        return <PasoColores diseno={diseno} paletasDePrendas={paletasDePrendas} onCambiar={cambiar} />;
      case "fondo":
        return <PasoFondo diseno={diseno} onCambiar={cambiar} />;
      case "acomodo":
        return <PasoAcomodo diseno={diseno} campana={campana} piezas={piezas} ahora={ahora} onCambiar={cambiar} />;
      case "texto":
        return <PasoTexto diseno={diseno} campana={campana} onCambiar={cambiar} onEscribir={(d) => cambiar(d, { escritura: true })} />;
      case "prendas":
        return <PasoPrendas diseno={diseno} campana={campana} piezas={piezas} onCambiar={cambiar} />;
      case "detalles":
        return <PasoDetalles diseno={diseno} campana={campana} onCambiar={cambiar} />;
    }
  };
  const puedePublicar = !revision.bloquea && comoEsta === "borrador" && guardado !== "choque" && guardado !== "error";

  return (
    <div className="tw-editor">
      <div className="tw-pasos" data-guia="campana.diseno-pasos">
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
              {abiertoAqui && <div className="tw-paso-cuerpo">{cuerpo(p.clave)}</div>}
            </section>
          );
        })}
      </div>

      <div className="tw-editor-vista space-y-4">
        <div className="flex flex-wrap items-center gap-3" data-guia="campana.diseno-mirar">
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Dónde se mira"
            valor={vista}
            onCambio={(v) => setVista(v as "pc" | "cel")}
            opciones={[
              { clave: "pc", etiqueta: "Computadora", icono: <Monitor aria-hidden className="h-4 w-4" />, guia: "campana.diseno-computadora" },
              { clave: "cel", etiqueta: "Celular", icono: <Smartphone aria-hidden className="h-4 w-4" />, guia: "campana.diseno-celular" },
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
          <div className="ml-auto flex flex-wrap items-center gap-3" data-guia="campana.diseno-probar">
            <BotonDeshacer onClick={deshacer} disabled={historial.length === 0} title={historial.length === 0 ? "Todavía no hay nada que deshacer" : undefined} />
            <Boton peso="fantasma" className="btn-chico" onClick={() => cambiar(sorprendeme(diseno, { pct: campana.pct, conPrendas: piezas.length > 0 }))}>
              <span className="flex items-center gap-2">
                <Dices aria-hidden className="h-4 w-4 shrink-0" />
                Sorpréndeme
              </span>
            </Boton>
          </div>
        </div>

        <div data-guia="campana.diseno-previa">
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

        <Revision avisos={revision.avisos} guia="campana.diseno-revision" />

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
                  : estado.publicado
                    ? "Borrador guardado: la web sigue mostrando el diseño publicado."
                    : "Borrador guardado: la web sigue mostrando la portada de siempre."}
          </p>
          {(estado.publicado || estado.anterior) && (
            <Boton peso="fantasma" onClick={() => setVolviendo(true)} data-guia="campana.diseno-volver">
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
            data-guia="campana.diseno-publicar"
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

/** La revisión: lo que se midió de la portada (que la letra se lea en los dos temas, que las prendas tengan foto). */
export function Revision({ avisos, guia }: { avisos: readonly AvisoDeRevision[]; guia?: string }) {
  return (
    <ul className="tw-revision" aria-label="Revisión del diseño" data-guia={guia}>
      {avisos.map((a) => (
        <li key={a.texto} data-tono={a.tono}>
          {a.tono === "ok" ? <Check aria-hidden /> : a.tono === "ojo" ? <Eye aria-hidden /> : <X aria-hidden />}
          <span>{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}
