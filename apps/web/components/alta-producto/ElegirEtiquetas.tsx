"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Search } from "lucide-react";
import { MuestraEtiqueta, TONOS } from "@/components/MuestraEtiqueta";
import { GrillaMuestras, TarjetaMuestraBase, TileVerTodos } from "@/components/alta-producto/GrillaMuestras";
import { Modal } from "@/components/ui/Modal";
import { Resaltado } from "@/components/ui/Resaltado";
import { avisar } from "@/components/ui/Avisos";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { proponerEtiqueta, type ValorCreado } from "@/lib/alta-producto-ejes";
import type { EtiquetaAlta } from "@/lib/alta-producto-datos";
import { ayudaDeEtiqueta } from "@/lib/etiqueta-ayuda";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import {
  agruparEtiquetas,
  coincideConTexto,
  etiquetasALaVista,
  fraseDeExistente,
  FRASE_ETIQUETA_INVALIDA,
  repartirEtiquetas,
  significadoDelTexto,
  textoDeDescuento,
} from "@/lib/etiquetas-alta-reglas";
import { AvisoSinIdentidad, useFirmaDeMitad } from "@/components/alta-producto/IdentidadAlta";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";

/* ====================================================================
   ElegirEtiquetas · el campo «Etiquetas» del alta, con el mismo molde que Tejido, Patrón y Temporada (2026-09-29)

   Por qué cambió otra vez: la versión anterior (2026-09-26) ponía TODO el vocabulario a la vista, siempre, agrupado,
   con un buscador arriba para filtrar esa lista larga — distinto de cómo se ven Tejido y Patrón al lado. Felipe pidió
   que las cuatro filas del paso 3 se vean hechas por la misma mano: una grilla chica (lo marcado y lo que «ya aplica»
   nunca se esconden) + una tarjeta punteada «Ver todos». El buscador y el agrupado por Rotación/Artesanal/Campaña no
   se perdieron: se mudaron DENTRO de esa hoja, igual que «Buscar tejido»/«Buscar patrón» viven dentro de la suya.

   CONTRATO
     PROMETE: `elegidas` (ids) es siempre lo que se ve marcado con ✓, tanto en la grilla chica como en la hoja; lo que
              se ve en línea punteada («ya aplica») NO está en `elegidas` y no se puede marcar: la campaña lo aplica
              sola a toda la categoría. La grilla chica nunca esconde una marcada ni una cubierta.
     ASUME:   `etiquetas` = aprobadas y activas (lo que trae `getContextoAlta`, más las creadas aquí). Se ofrecen TODAS, con
              descuento o sin él, a quien da de alta el producto (ADR-0293, 2026-09-30): antes quien no era líder no veía
              «Para liquidar» ni «Últimas unidades» y parecía que no existían.
     NO HACE: no guarda la prenda ni sus etiquetas (eso es del envío del formulario, `p_etiqueta_ids`); solo crea una
              etiqueta NUEVA en el vocabulario, y solo con conexión (la firma quien inició el alta, sin combo propio desde 2026-09-29).

   A diferencia de Tejido/Patrón/Temporada: acá se elige de a VARIAS (no una), así que tocar una tarjeta en la hoja NO
   la cierra, y el «Ver todos» cuenta el universo entero (elegibles + cubiertas), no solo lo que ofrece una categoría.
   ==================================================================== */

type Props = {
  /** El vocabulario aprobado y vigente (incluye lo creado en esta pantalla). */
  etiquetas: readonly EtiquetaAlta[];
  categoriaId: string;
  /** Ids elegidos a mano. */
  elegidas: readonly string[];
  /** El `setState` del formulario: se usa siempre con función (`prev => …`) para no pisar lo que se marcó mientras una respuesta venía en camino. */
  onElegidas: Dispatch<SetStateAction<string[]>>;
  /** Quien crea una etiqueta y la deja aprobada de una (`fn_puede_editar_etiquetas`: líder o un rol con el módulo Etiquetas). Solo cambia lo que dice el panel de crear. */
  puedeAprobar: boolean;
  /** Sin internet no se puede crear una etiqueta nueva (sí elegir las que ya existen). */
  enLinea: boolean;
  /** Una etiqueta nueva quedó aprobada: el formulario la suma a su vocabulario. */
  onCreada: (e: EtiquetaAlta) => void;
  /** Lo que alguien sin permiso de aprobar propuso en esta pantalla: espera a un líder, así que no se puede marcar ni proponer otra vez. Vive en el formulario para no perderse al plegar el paso. */
  propuestas: readonly string[];
  onPropuesta: (nombre: string) => void;
};

export function ElegirEtiquetas({ etiquetas, categoriaId, elegidas, onElegidas, puedeAprobar, enLinea, onCreada, propuestas, onPropuesta }: Props) {
  const [hoja, setHoja] = useState(false);
  const [nueva, setNueva] = useState(false);
  const hoy = useMemo(() => hoyLima(), []);
  /** La última etiqueta tocada (grilla chica u hoja): su ayuda se lee en una línea aparte donde no hay mouse (`[@media(hover:none)]`). */
  const [ultimaId, setUltimaId] = useState<string | null>(null);

  const reparto = useMemo(() => repartirEtiquetas(etiquetas, { categoriaId }), [etiquetas, categoriaId]);
  const idsCubiertas = useMemo(() => new Set(reparto.cubiertas.map((c) => c.id)), [reparto.cubiertas]);
  // Lo elegido que la campaña ya cubre no cuenta como elegido a mano (ya está «ya aplica»): si la persona la marcó y DESPUÉS
  // cambió a una categoría que la cubre, el formulario tampoco la manda.
  const marcadas = useMemo(() => new Set(elegidas.filter((eid) => etiquetas.some((e) => e.id === eid) && !idsCubiertas.has(eid))), [elegidas, etiquetas, idsCubiertas]);

  const total = reparto.elegibles.length + reparto.cubiertas.length;
  const visibles = useMemo(() => etiquetasALaVista(reparto.elegibles, reparto.cubiertas, marcadas), [reparto, marcadas]);

  const ultimaEtiqueta = ultimaId ? (etiquetas.find((e) => e.id === ultimaId) ?? null) : null;
  const ayudaUltima = ultimaEtiqueta ? ayudaDeEtiqueta(ultimaEtiqueta, { cubierta: idsCubiertas.has(ultimaEtiqueta.id), hoy }) : null;

  function alternar(eid: string) {
    onElegidas((prev) => (prev.includes(eid) ? prev.filter((x) => x !== eid) : [...prev, eid]));
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-2.5">
        {etiquetas.length === 0 ? (
          <p className="text-sm text-taupe">{enLinea ? "Todavía no hay etiquetas. Ábrelas desde «Ver todos» para crear la primera." : "Todavía no hay etiquetas."}</p>
        ) : (
          <GrillaMuestras>
            {visibles.map((et) => (
              <TarjetaEtiqueta
                key={et.id}
                et={et}
                hoy={hoy}
                cubierta={idsCubiertas.has(et.id)}
                marcada={marcadas.has(et.id)}
                onAlternar={() => alternar(et.id)}
                onTocar={() => setUltimaId(et.id)}
              />
            ))}
            <TileVerTodos total={total} singular="etiqueta" plural="etiquetas" onClick={() => setHoja(true)} />
          </GrillaMuestras>
        )}

        {ultimaEtiqueta && (
          <p role="status" className="text-xs text-taupe [@media(hover:hover)]:hidden">
            <strong className="text-tinta">{ultimaEtiqueta.nombre}:</strong> {ayudaUltima?.queEs} {ayudaUltima?.datos.join(" ")}
          </p>
        )}

        {propuestas.length > 0 && (
          <p className="text-xs text-taupe">
            Esperando a un líder: {propuestas.map((p) => `«${p}»`).join(", ")}. Cuando la apruebe podrás marcarla.
          </p>
        )}
        <p className="text-xs text-taupe">
          Se aplican a todas las variantes de la prenda.
        </p>
      </div>

      {hoja && (
        <Modal
          variante="hoja"
          ancho="max-w-[680px]"
          titulo="Elige las etiquetas"
          subtitulo={`${total} en el catálogo.`}
          onClose={() => setHoja(false)}
          // «+ Nueva etiqueta» arriba a la derecha, a la vista (Felipe 2026-10-02): antes solo aparecía al escribir un nombre que no existe.
          acciones={
            <Boton type="button" peso="primario" onClick={() => setNueva(true)} disabled={!enLinea} title={enLinea ? undefined : "Crear una etiqueta necesita internet"} className="h-9 whitespace-nowrap py-0">
              + Nueva etiqueta
            </Boton>
          }
        >
          <HojaEtiquetas
            etiquetas={etiquetas}
            reparto={reparto}
            idsCubiertas={idsCubiertas}
            marcadas={marcadas}
            hoy={hoy}
            puedeAprobar={puedeAprobar}
            enLinea={enLinea}
            propuestas={propuestas}
            onAlternar={alternar}
            onTocar={setUltimaId}
            onCreada={onCreada}
            onPropuesta={onPropuesta}
          />
          {nueva && (
            <NuevaEtiquetaModal
              contexto={{ todas: etiquetas, reparto, elegidas: [...marcadas], propuestas }}
              puedeAprobar={puedeAprobar}
              enLinea={enLinea}
              onCerrar={() => setNueva(false)}
              onCreada={(e) => {
                onCreada(e);
                alternar(e.id);
              }}
              onPropuesta={onPropuesta}
            />
          )}
        </Modal>
      )}
    </TooltipProvider>
  );
}

/**
 * Una etiqueta, tarjeta del mismo molde que Tejido/Patrón/Temporada (`TarjetaMuestraBase`): se marca con un toque
 * (✓ + borde tinta); al pasar el mouse o dar foco, el globo dice qué significa. Una CON descuento lleva el
 * porcentaje en una insignia sobre el dibujo, en el tono de su propio grupo (nunca rojo: es el acento de marca).
 */
function TarjetaEtiqueta({
  et,
  hoy,
  cubierta,
  marcada,
  enHoja = false,
  busqueda = "",
  onAlternar,
  onTocar,
}: {
  et: EtiquetaAlta;
  hoy: string;
  cubierta: boolean;
  marcada: boolean;
  enHoja?: boolean;
  busqueda?: string;
  onAlternar: () => void;
  onTocar: () => void;
}) {
  const ayuda = ayudaDeEtiqueta(et, { cubierta, hoy });
  const dto = textoDeDescuento(et);
  const acento = TONOS[estiloConocido(et.estilo)].acento;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TarjetaMuestraBase
          elegido={marcada}
          cubierta={cubierta}
          onClick={() => {
            onTocar();
            if (!cubierta) onAlternar();
          }}
          // Sin `title` nativo: la burbuja ya trae el nombre entero y, desde que `TarjetaMuestraBase` deja pasar los eventos del
          // `TooltipTrigger` (2026-10-02), se abre de verdad; los dos juntos se encimarían.
        >
          <div className="relative">
            <MuestraEtiqueta nombre={et.nombre} estilo={estiloConocido(et.estilo)} className="h-10 w-full" />
            {dto && (
              <span
                aria-hidden
                className="absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none text-crema"
                style={{ backgroundColor: acento }}
              >
                {dto.replace(" dto", "")}
              </span>
            )}
          </div>
          <span className={`px-0.5 ${enHoja ? "break-words leading-tight" : "truncate"}`}>
            {(marcada || cubierta) && <span aria-hidden>✓ </span>}
            <Resaltado texto={et.nombre} busqueda={busqueda} />
          </span>
          {cubierta && enHoja && <span className="px-0.5 text-[10px] leading-snug text-taupe">se aplica sola</span>}
        </TarjetaMuestraBase>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} collisionPadding={8} className="max-w-[16rem] leading-snug">
        <p className="font-semibold">{et.nombre}</p>
        <p className="mt-0.5">{ayuda.queEs}</p>
        {ayuda.datos.map((d) => (
          <p key={d} className="mt-1 opacity-75">
            {d}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * El contenido de «Ver todos»: el buscador (también sirve para crear una etiqueta que no existe) y el vocabulario
 * completo agrupado por Rotación/Artesanal/Campaña y festividad/General, igual que Catálogo ▸ Atributos ▸ Etiquetas.
 * Tocar una tarjeta acá NO cierra la hoja: a diferencia de Tejido/Patrón/Temporada, de etiquetas se eligen varias.
 */
function HojaEtiquetas({
  etiquetas,
  reparto,
  idsCubiertas,
  marcadas,
  hoy,
  puedeAprobar,
  enLinea,
  propuestas,
  onAlternar,
  onTocar,
  onCreada,
  onPropuesta,
}: {
  etiquetas: readonly EtiquetaAlta[];
  reparto: ReturnType<typeof repartirEtiquetas>;
  idsCubiertas: ReadonlySet<string>;
  marcadas: ReadonlySet<string>;
  hoy: string;
  puedeAprobar: boolean;
  enLinea: boolean;
  propuestas: readonly string[];
  onAlternar: (id: string) => void;
  onTocar: (id: string) => void;
  onCreada: (e: EtiquetaAlta) => void;
  onPropuesta: (nombre: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  /** El nombre que se está creando (la mini-hoja de confirmar con el responsable está abierta), o null. */
  const [creando, setCreando] = useState<string | null>(null);

  const visibles = useMemo(() => [...reparto.elegibles, ...reparto.cubiertas].filter((e) => coincideConTexto(e, texto)), [reparto, texto]);
  const grupos = useMemo(() => agruparEtiquetas(visibles), [visibles]);

  const contexto = { todas: etiquetas, reparto, elegidas: [...marcadas], propuestas };
  const significado = significadoDelTexto(texto, contexto);
  const hayCrear = significado.tipo === "nueva" && enLinea && creando === null;
  const notaTexto =
    significado.tipo === "existe" && significado.motivo !== "elegible" && significado.motivo !== "elegida"
      ? fraseDeExistente(significado.motivo)
      : significado.tipo === "invalida"
        ? FRASE_ETIQUETA_INVALIDA
        : significado.tipo === "nueva" && !enLinea
          ? "Sin conexión no se pueden crear etiquetas nuevas. Elige entre las que ya existen."
          : null;

  function pedirCrear(nombre: string) {
    setCreando(nombre);
    setTexto("");
  }

  /** Enter en el buscador: marca la igual a lo escrito; si queda UNA sola a la vista, esa; si lo escrito es nuevo, ofrece crearlo. */
  function confirmar() {
    if (!texto.trim()) return;
    if (significado.tipo === "existe" && significado.motivo === "elegible" && significado.etiqueta) {
      onAlternar(significado.etiqueta.id);
      setTexto("");
      return;
    }
    const soloUna = visibles.length === 1 && reparto.elegibles.some((e) => e.id === visibles[0].id) && !marcadas.has(visibles[0].id) ? visibles[0] : null;
    if (soloUna) {
      onAlternar(soloUna.id);
      setTexto("");
    } else if (visibles.length === 0 && hayCrear && significado.tipo === "nueva") {
      // Solo si NO hay nada parecido a la vista: «Día» con cinco «Día de…» delante no debe ofrecer crear «Día». Con parecidas a la
      // vista, crear queda en el botón «+ Crear «X»», a un clic y a la vista.
      pedirCrear(significado.nombre);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="caja-cayla flex h-9 w-full items-center gap-2 px-3 sm:w-72">
          <Search aria-hidden size={14} className="shrink-0 text-tinta/45" />
          <span className="sr-only">Buscar o crear una etiqueta</span>
          <input
            ref={entrada}
            value={texto}
            autoFocus
            autoComplete="off"
            placeholder="Buscar o crear una etiqueta…"
            // El teclado del celular no manda «coma» como tecla: llega escrita al final. Se descarta (las etiquetas van de a una).
            onChange={(e) => setTexto(e.target.value.replace(/,+$/, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                confirmar();
              } else if (e.key === "Escape" && texto) {
                // Este Escape lo usó el campo (borró lo escrito): que no cierre también la hoja (Modal usa `useEscapeLibre`).
                e.preventDefault();
                e.stopPropagation();
                setTexto("");
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
          />
        </label>
        {hayCrear && significado.tipo === "nueva" && (
          <Boton type="button" onClick={() => pedirCrear(significado.nombre)} className="h-9 whitespace-nowrap py-0">
            + Crear «{significado.nombre}»
          </Boton>
        )}
      </div>
      {/* Lo escrito y no marcado ni creado se ve (y se dice), no se pierde en silencio al cerrar la hoja. */}
      {(notaTexto || (texto.trim() && creando === null)) && (
        <p role="status" className="mt-2 text-xs text-ambar-profundo">
          {notaTexto ??
            (hayCrear && significado.tipo === "nueva"
              ? `Escribiste «${significado.nombre}»: elige una de abajo o pulsa «+ Crear» para agregarla.`
              : `Escribiste «${texto.trim()}»: elige la etiqueta de abajo.`)}
        </p>
      )}

      {creando !== null && (
        <div className="mt-2.5">
          <CrearEtiquetaAbierta
            nombre={creando}
            puedeAprobar={puedeAprobar}
            onAprobada={(valor) => {
              onCreada({ id: valor.id, nombre: valor.texto, estilo: "neutral", descuentoPct: null, categoriaIds: [], vigenteDesde: null, vigenteHasta: null });
              onAlternar(valor.id);
              avisar.exito(`Etiqueta «${valor.texto}» creada y agregada`);
              setCreando(null);
              entrada.current?.focus();
            }}
            onPendiente={(valor) => {
              onPropuesta(valor.texto);
              avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
              setCreando(null);
              entrada.current?.focus();
            }}
            onCerrar={() => {
              setCreando(null);
              entrada.current?.focus();
            }}
          />
        </div>
      )}

      <div className="scroll-cayla -mx-1 mt-3 max-h-[52vh] overflow-y-auto px-1 pb-1">
        {grupos.length === 0 ? (
          <p className="py-4 text-[13px] text-taupe">{texto.trim() ? `Nada coincide con «${texto.trim()}».` : "No hay etiquetas para elegir."}</p>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <section key={g.estilo} aria-label={g.nombre}>
                <p className="label-cayla mb-1.5 flex items-center gap-1.5 text-[11px] text-tinta/65">
                  <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${g.punto}`} />
                  {g.nombre}
                  <span className="font-normal tabular-nums text-tinta/40">{g.etiquetas.length}</span>
                </p>
                <GrillaMuestras>
                  {g.etiquetas.map((et) => (
                    <TarjetaEtiqueta
                      key={et.id}
                      et={et}
                      hoy={hoy}
                      cubierta={idsCubiertas.has(et.id)}
                      marcada={marcadas.has(et.id)}
                      enHoja
                      busqueda={texto}
                      onAlternar={() => onAlternar(et.id)}
                      onTocar={() => onTocar(et.id)}
                    />
                  ))}
                </GrillaMuestras>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** «+ Nueva etiqueta» de la cabecera de la hoja: pide el nombre y, si de verdad es nueva, abre la misma confirmación de siempre. */
function NuevaEtiquetaModal({
  contexto,
  puedeAprobar,
  enLinea,
  onCerrar,
  onCreada,
  onPropuesta,
}: {
  contexto: Parameters<typeof significadoDelTexto>[1];
  puedeAprobar: boolean;
  enLinea: boolean;
  onCerrar: () => void;
  onCreada: (e: EtiquetaAlta) => void;
  onPropuesta: (nombre: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const significado = significadoDelTexto(texto, contexto);
  const nota =
    significado.tipo === "existe" && significado.motivo !== "elegible" && significado.motivo !== "elegida"
      ? fraseDeExistente(significado.motivo)
      : significado.tipo === "existe"
        ? `«${significado.etiqueta?.nombre ?? texto.trim()}» ya existe: tócala en la lista para marcarla.`
        : significado.tipo === "invalida"
          ? FRASE_ETIQUETA_INVALIDA
          : null;
  return (
    <Modal variante="hoja" ancho="max-w-md" titulo="Nueva etiqueta" subtitulo="Escribe cómo se va a llamar." onClose={onCerrar}>
      {(cerrar) => (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tinta">Nombre de la etiqueta</span>
            <input
              autoFocus
              autoComplete="off"
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/,+$/, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              className="caja-cayla h-10 w-full px-3 text-sm text-tinta placeholder:text-tinta/45"
            />
          </label>
          {nota && (
            <p role="status" className="text-xs text-ambar-profundo">
              {nota}
            </p>
          )}
          {significado.tipo === "nueva" && enLinea && (
            <CrearEtiquetaAbierta
              key={significado.nombre}
              nombre={significado.nombre}
              puedeAprobar={puedeAprobar}
              onAprobada={(valor) => {
                onCreada({ id: valor.id, nombre: valor.texto, estilo: "neutral", descuentoPct: null, categoriaIds: [], vigenteDesde: null, vigenteHasta: null });
                avisar.exito(`Etiqueta «${valor.texto}» creada y agregada`);
                cerrar();
              }}
              onPendiente={(valor) => {
                onPropuesta(valor.texto);
                avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
                cerrar();
              }}
              onCerrar={cerrar}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

// «Crear» es UNA escritura aparte del producto; la firma quien inició el alta (`useFirmaDeMitad`), sin combo propio desde 2026-09-29.
// NO va dentro de la transacción del alta: si crear la etiqueta fallara a mitad, la persona perdería la prenda que llenaba.
// Si la red cae, la respuesta es «No se pudo hablar con el servidor» y NO se crea nada: la prenda y lo llenado siguen ahí.
// Lo que pasa después lo decide la RESPUESTA (¿quedó aprobada?), no lo que este panel anunció: `puedeAprobar` solo cambia el texto.
function CrearEtiquetaAbierta({
  nombre,
  puedeAprobar,
  onAprobada,
  onPendiente,
  onCerrar,
}: {
  nombre: string;
  puedeAprobar: boolean;
  onAprobada: (valor: ValorCreado) => void;
  onPendiente: (valor: ValorCreado) => void;
  onCerrar: () => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firma = useFirmaDeMitad("alta_producto_etiqueta");

  async function crear() {
    if (trabajando || !firma.listo) return;
    setTrabajando(true);
    setError(null);
    const { valor, error: errCrear } = await proponerEtiqueta(nombre, firma.encabezados());
    setTrabajando(false);
    if (errCrear || !valor) {
      setError(errCrear ?? "No se pudo crear la etiqueta. Reintenta.");
      return;
    }
    if (valor.aprobado) onAprobada(valor);
    else onPendiente(valor);
  }

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="group"
      aria-label={`Crear la etiqueta ${nombre}`}
      className="space-y-2.5 rounded-md border border-sand bg-hueso p-3 outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !trabajando) {
          e.preventDefault();
          e.stopPropagation();
          onCerrar();
        }
      }}
    >
      <p className="text-sm text-tinta">
        Crear la etiqueta <strong>«{nombre}»</strong>
      </p>
      <p className="text-xs text-taupe">
        {puedeAprobar
          ? "Queda en el catálogo para usarla en otras prendas, y se marca en esta."
          : "Queda pendiente: un líder tiene que aprobarla en Catálogo → Atributos antes de poder marcarla en una prenda."}
      </p>
      <AvisoSinIdentidad firma={firma} enHoja />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void crear()} disabled={trabajando || !firma.listo} title={firma.motivo ?? undefined} className="btn-cayla btn-primario">
          {trabajando ? "Creando…" : puedeAprobar ? "Crear y agregar" : "Proponer etiqueta"}
        </button>
        <button type="button" onClick={onCerrar} disabled={trabajando} className="btn-cayla btn-sutil">
          Cancelar
        </button>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}

