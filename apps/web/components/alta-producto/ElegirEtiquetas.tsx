"use client";

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { proponerEtiqueta, type ValorCreado } from "@/lib/alta-producto-ejes";
import type { EtiquetaAlta } from "@/lib/alta-producto-datos";
import {
  filtrarEtiquetas,
  fraseDeExistente,
  FRASE_ETIQUETA_INVALIDA,
  repartirEtiquetas,
  significadoDelTexto,
  textoDeDescuento,
} from "@/lib/etiquetas-alta-reglas";
import { useResponsable } from "@/lib/useResponsable";

/* ====================================================================
   ElegirEtiquetas · el campo «Etiquetas» del alta, como el de Shopify (2026-09-26)

   Por qué existe: las etiquetas ya se podían poner al crear una prenda, pero vivían tras un enlace chico («+ Etiquetas
   (opcional)») al final del paso de precios y solo mostraban las ya aprobadas: quien buscaba dónde etiquetar no lo
   veía, y si la etiqueta que quería no existía no había salida sin dejar el formulario y perder lo llenado. Ahora es un
   campo a la vista: escribes para buscar, tocas una y queda como chip (con su ✕), sigues con otra; y si la que quieres no
   existe, «+ Crear» la crea ahí mismo (misma idea que «+ Nuevo tejido»: ProponerValor).

   CONTRATO
     PROMETE: `elegidas` (ids) es siempre lo que la persona ve como chips; lo que se ve en línea punteada («ya aplica por
              campaña») NO está en `elegidas` y no se puede quitar: la campaña lo aplica sola a toda la categoría.
              Enter agrega lo más parecido a lo escrito (primero la igual, luego las que empiezan igual) o, si lo escrito es
              nuevo y las flechas no movieron nada, ofrece crearlo; nunca agrega algo distinto a lo que se ve resaltado.
     ASUME:   `etiquetas` = aprobadas y activas (lo que trae `getContextoAlta`, más las creadas aquí). Quien no es líder no
              ve las que llevan descuento (`repartirEtiquetas`): la base las rechazaría, así que ni se ofrecen.
     NO HACE: no guarda la prenda ni sus etiquetas (eso es del envío del formulario, `p_etiqueta_ids`); solo crea una
              etiqueta NUEVA en el vocabulario, y solo con conexión y con un responsable de turno (ADR-0161).

   Es la variante de SELECCIÓN MÚLTIPLE del combo del sistema: no puede ser `ComboBuscable` (que elige UNA opción y la deja
   escrita en el campo), pero usa las mismas piezas — lista `fixed` por portal medida contra la caja (ADR-0185/0211,
   `usePosicionLista`/`useDestinoFlotante`), buscador sin tildes y el paginado de la regla global (ADR-0209,
   `useComboLista`) — y el mismo teclado: flechas y Enter; Escape cierra la lista y, con la lista cerrada, borra lo escrito
   (cada uno con `stopPropagation`, ADR-0136); Retroceso con el campo vacío quita el último chip.
   ==================================================================== */

type Props = {
  /** El vocabulario aprobado y vigente (incluye lo creado en esta pantalla). */
  etiquetas: readonly EtiquetaAlta[];
  categoriaId: string;
  /** Ids elegidos a mano, en el orden en que se agregaron. */
  elegidas: readonly string[];
  /** El `setState` del formulario: se usa siempre con función (`prev => …`) para no pisar lo que se agregó mientras una respuesta venía en camino. */
  onElegidas: Dispatch<SetStateAction<string[]>>;
  /** Un líder: la base le deja dar etiquetas CON descuento. A los demás no se les ofrecen. */
  esLider: boolean;
  /** Quien crea una etiqueta y la deja aprobada de una (`fn_puede_editar_etiquetas`: líder o un rol con el módulo Etiquetas). Solo cambia lo que dice el panel de crear. */
  puedeAprobar: boolean;
  /** Sin internet no se puede crear una etiqueta nueva (sí elegir las que ya existen). */
  enLinea: boolean;
  /** Una etiqueta nueva quedó aprobada: el formulario la suma a su vocabulario. */
  onCreada: (e: EtiquetaAlta) => void;
  /** Lo que alguien sin permiso de aprobar propuso en esta pantalla: espera a un líder, así que no se puede agregar ni proponer otra vez. Vive en el formulario para no perderse al plegar el paso. */
  propuestas: readonly string[];
  onPropuesta: (nombre: string) => void;
};

const TITULO_CAMPANA = "Esta campaña ya rige sobre todas las prendas de esta categoría: se aplica sola, no hace falta elegirla.";

export function ElegirEtiquetas({ etiquetas, categoriaId, elegidas, onElegidas, esLider, puedeAprobar, enLinea, onCreada, propuestas, onPropuesta }: Props) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const sinAbrir = useRef(false);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  /** El nombre que se está creando (la mini-hoja de confirmar con el responsable está abierta), o null. */
  const [creando, setCreando] = useState<string | null>(null);
  // La lista va en `fixed`, medida contra la caja entera (no contra el input, que puede ser pequeño entre los chips).
  const posLista = usePosicionLista(caja, abierto, 256, 4);
  const destino = useDestinoFlotante(caja, abierto);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();

  const reparto = useMemo(() => repartirEtiquetas(etiquetas, { categoriaId, daDescuentos: esLider }), [etiquetas, categoriaId, esLider]);
  // Lo elegido que la campaña ya cubre no se muestra como chip quitable (ya está en «cubiertas»): si la persona la eligió y
  // DESPUÉS cambió a una categoría que la cubre, el formulario tampoco la manda.
  const chips = useMemo(
    () =>
      elegidas
        .map((eid) => etiquetas.find((e) => e.id === eid))
        .filter((e): e is EtiquetaAlta => Boolean(e) && !reparto.cubiertas.some((c) => c.id === e!.id)),
    [elegidas, etiquetas, reparto.cubiertas]
  );
  const contexto = { todas: etiquetas, reparto, elegidas, propuestas };
  const filtradas = useMemo(() => filtrarEtiquetas(reparto.elegibles, elegidas, texto), [reparto.elegibles, elegidas, texto]);
  const mostradas = filtradas.slice(0, visibles);
  const significado = significadoDelTexto(texto, contexto);
  const hayCrear = significado.tipo === "nueva" && enLinea && creando === null;
  const ultimo = mostradas.length - 1 + (hayCrear ? 1 : 0);
  const activoSeguro = Math.max(0, Math.min(activo, ultimo));

  // Una frase que dice POR QUÉ lo escrito no se puede agregar como etiqueta nueva (o ya está): reemplaza a un botón muerto.
  const notaLista =
    significado.tipo === "existe" && significado.motivo !== "elegible"
      ? fraseDeExistente(significado.motivo)
      : significado.tipo === "invalida"
        ? FRASE_ETIQUETA_INVALIDA
        : significado.tipo === "nueva" && !enLinea
          ? "Sin conexión no se pueden crear etiquetas nuevas. Elige entre las que ya existen."
          : null;
  const mensajeVacio =
    notaLista ??
    (texto.trim()
      ? `Nada coincide con «${texto.trim()}».`
      : etiquetas.length === 0
        ? enLinea
          ? "Todavía no hay etiquetas. Escribe una para crearla."
          : "Todavía no hay etiquetas."
        : "Ya agregaste todas las etiquetas disponibles.");

  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activoSeguro}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activoSeguro, abierto]);

  function abrir() {
    // Volver el foco al campo tras quitar un chip o crear una etiqueta no debe reabrir la lista (ni subir el teclado del celular).
    if (sinAbrir.current) {
      sinAbrir.current = false;
      return;
    }
    setActivo(0);
    mostrarDesde(0);
    setAbierto(true);
  }

  function enfocarSinAbrir() {
    const el = entrada.current;
    if (!el || document.activeElement === el) return;
    sinAbrir.current = true;
    el.focus();
    setTimeout(() => {
      sinAbrir.current = false;
    }, 0);
  }

  function agregar(et: EtiquetaAlta) {
    onElegidas((prev) => (prev.includes(et.id) ? prev : [...prev, et.id]));
    setTexto("");
    setActivo(0);
    reiniciar();
    // La lista sigue abierta y el foco en el campo: se pueden agregar varias seguidas, como en Shopify.
    setAbierto(true);
    entrada.current?.focus();
  }

  function quitar(eid: string) {
    onElegidas((prev) => prev.filter((x) => x !== eid));
    enfocarSinAbrir();
  }

  function pedirCrear(nombre: string) {
    setCreando(nombre);
    setTexto("");
    setAbierto(false);
  }

  /** Enter (o coma): agrega lo resaltado —la igual va primero—, o abre «Crear» si lo resaltado es esa opción. Nunca agrega otra cosa. */
  function confirmarTexto(t: string) {
    if (!t.trim()) return;
    const sig = significadoDelTexto(t, contexto);
    // Ya la tiene, la cubre una campaña, no es de este rol, o trae comas: no se agrega ninguna parecida "de paso".
    if (sig.tipo === "invalida" || (sig.tipo === "existe" && sig.motivo !== "elegible")) return;
    const candidatas = filtrarEtiquetas(reparto.elegibles, elegidas, t);
    const i = t === texto ? activoSeguro : 0;
    if (candidatas[i]) agregar(candidatas[i]);
    else if (sig.tipo === "nueva" && enLinea && creando === null) pedirCrear(sig.nombre);
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) abrir();
      else setActivo(e.key === "ArrowDown" ? Math.min(ultimo, activoSeguro + 1) : Math.max(0, activoSeguro - 1));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // Enter NO envía el formulario grande (el formulario ya lo frena) y la coma no se escribe.
      confirmarTexto(texto);
    } else if (e.key === "Backspace" && texto === "" && chips.length > 0 && !e.repeat) {
      // `!e.repeat`: dejar Retroceso apretado para borrar lo escrito NO debe seguir de largo y llevarse los chips ya elegidos.
      e.preventDefault();
      const ultimoId = chips[chips.length - 1].id;
      onElegidas((prev) => prev.filter((x) => x !== ultimoId));
    } else if (e.key === "Escape") {
      // Este Escape lo usó el campo (cerró la lista o borró lo escrito): que no siga y cierre también una hoja de
      // afuera (useEscapeLibre.ts). Sin nada que cerrar ni borrar, se deja pasar.
      if (abierto || texto) {
        e.preventDefault();
        e.stopPropagation();
        if (abierto) setAbierto(false);
        else setTexto("");
      }
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  }

  return (
    <div>
      <div
        ref={caja}
        // Tocar cualquier parte de la caja (no solo el hueco del input) enfoca el campo, como en Shopify.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            entrada.current?.focus();
          }
        }}
        className="caja-cayla flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5"
      >
        {reparto.cubiertas.map((et) => (
          <span
            key={et.id}
            title={TITULO_CAMPANA}
            // Texto corrido (no `flex`): en un celular angosto cada pedazo se volvía su propia columna y se partía en tres.
            className="min-h-8 max-w-full rounded-md border border-dashed border-tinta/30 bg-tinta/[0.03] px-2 py-1 text-sm leading-snug text-tinta/70"
          >
            <span aria-hidden className="mr-1.5 text-[11px]">
              ✓
            </span>
            {et.nombre}
            {textoDeDescuento(et) && <span className="tabular-nums"> · {textoDeDescuento(et)}</span>}
            <span className="text-[11px] text-tinta/50"> · ya aplica por campaña</span>
          </span>
        ))}
        {chips.map((et) => (
          <span key={et.id} className="flex min-h-8 max-w-full items-center gap-0.5 rounded-md border border-tinta bg-tinta/[0.07] py-0.5 pl-2.5 pr-0.5 text-sm text-tinta">
            <span className="truncate">{et.nombre}</span>
            {textoDeDescuento(et) && <span className="shrink-0 tabular-nums text-tinta/65">· {textoDeDescuento(et)}</span>}
            <button
              type="button"
              aria-label={`Quitar la etiqueta «${et.nombre}»`}
              onClick={() => quitar(et.id)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded text-[13px] text-tinta/60 transition-colors hover:bg-tinta/10 hover:text-tinta"
            >
              <span aria-hidden>✕</span>
            </button>
          </span>
        ))}
        <input
          ref={entrada}
          id={`${id}-campo`}
          role="combobox"
          aria-label="Etiquetas"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-activedescendant={abierto && ultimo >= 0 ? `${id}-op-${activoSeguro}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={texto}
          placeholder={chips.length + reparto.cubiertas.length > 0 ? "Agregar otra…" : "Busca o crea una etiqueta…"}
          onFocus={abrir}
          onClick={() => !abierto && abrir()}
          onChange={(e) => {
            const v = e.target.value;
            setActivo(0);
            reiniciar();
            if (!abierto) setAbierto(true);
            // El teclado del celular no manda «coma» como tecla: llega escrita al final. Se trata como Enter.
            if (v.endsWith(",") && !v.slice(0, -1).includes(",")) {
              const sinComa = v.slice(0, -1);
              setTexto(sinComa);
              confirmarTexto(sinComa);
              return;
            }
            setTexto(v);
          }}
          onKeyDown={alTeclado}
          onBlur={() => setAbierto(false)}
          className="h-8 min-w-[9rem] flex-1 bg-transparent px-1 text-sm text-tinta outline-none placeholder:text-tinta/45"
        />
      </div>

      {abierto &&
        posLista &&
        destino &&
        createPortal(
          <ul
            ref={lista}
            id={`${id}-lista`}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Etiquetas disponibles"
            style={{ position: "fixed", ...posLista }}
            // Tocar la barra de desplazamiento o el borde de la lista no le quita el foco al campo (cerraría la lista).
            onMouseDown={(e) => e.preventDefault()}
            onScroll={alHacerScroll}
            className="card-cayla z-50 overflow-y-auto shadow-lg"
          >
            {notaLista && mostradas.length > 0 && (
              <li role="presentation" className="border-b border-sand px-3 py-2 text-xs text-tinta/65">
                {notaLista}
              </li>
            )}
            {mostradas.length === 0 && !hayCrear && (
              <li role="presentation" className="px-3 py-3 text-sm text-tinta/65">
                {mensajeVacio}
              </li>
            )}
            {mostradas.map((et, i) => (
              <li
                key={et.id}
                id={`${id}-op-${i}`}
                data-i={i}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActivo(i)}
                // mousedown y no click: el blur del campo cerraría la lista antes de que llegara el click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  agregar(et);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${i === activoSeguro ? "bg-sand/60 text-tinta" : "text-tinta/85"}`}
              >
                {et.nombre}
                {textoDeDescuento(et) && <span className="ml-2 text-xs tabular-nums text-tinta/55">{textoDeDescuento(et)}</span>}
              </li>
            ))}
            {hayCrear && significado.tipo === "nueva" && (
              <li
                id={`${id}-op-${mostradas.length}`}
                data-i={mostradas.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActivo(mostradas.length)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pedirCrear(significado.nombre);
                }}
                className={`cursor-pointer px-3 py-2.5 text-sm font-semibold ${mostradas.length > 0 ? "border-t border-sand" : ""} ${activoSeguro === mostradas.length ? "bg-sand/60 text-tinta" : "text-tinta/85"}`}
              >
                + Crear «{significado.nombre}»
              </li>
            )}
          </ul>,
          destino
        )}

      {creando !== null && (
        <CrearEtiquetaAbierta
          nombre={creando}
          puedeAprobar={puedeAprobar}
          onAprobada={(valor) => {
            onCreada({ id: valor.id, nombre: valor.texto, estilo: "neutral", descuentoPct: null, categoriaIds: [] });
            onElegidas((prev) => (prev.includes(valor.id) ? prev : [...prev, valor.id]));
            avisar.exito(`Etiqueta «${valor.texto}» creada y agregada`);
            setCreando(null);
            enfocarSinAbrir();
          }}
          onPendiente={(valor) => {
            onPropuesta(valor.texto);
            avisar.aviso(`Propuesta enviada: ${valor.texto}`, { detalle: "Un líder tiene que aprobarla en Catálogo → Atributos antes de poder usarla." });
            setCreando(null);
            enfocarSinAbrir();
          }}
          onCerrar={() => {
            setCreando(null);
            enfocarSinAbrir();
          }}
        />
      )}

      {/* Lo escrito y no agregado se ve (y se dice), no se pierde en silencio al pulsar «Seguir»: la lista ya se cerró. */}
      {texto.trim() && !abierto && creando === null && (
        <p role="status" className="mt-1.5 text-xs text-ambar-profundo">
          {notaLista ?? `Escribiste «${texto.trim()}» pero todavía no la agregaste: da Enter o elígela de la lista.`}
        </p>
      )}
      <p className="mt-1.5 text-xs text-taupe">
        Se aplican a todas las variantes de la prenda.
        {reparto.ocultasPorDescuento > 0 && ` Las que llevan descuento (${reparto.ocultasPorDescuento}) las pone un líder.`}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {chips.length === 0 ? "Ninguna etiqueta agregada" : `${chips.length} etiqueta${chips.length === 1 ? "" : "s"} agregada${chips.length === 1 ? "" : "s"}: ${chips.map((c) => c.nombre).join(", ")}`}
        {abierto && notaLista ? `. ${notaLista}` : ""}
      </p>
    </div>
  );
}

// «Crear» es UNA escritura aparte del producto (ADR-0161): lleva su propio combo «Responsable», igual que «+ Nuevo tejido».
// Vive en la parte ABIERTA para que el formulario no lea la asistencia (`useResponsable`) por un campo que nadie usó.
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
  const responsable = useResponsable();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (trabajando || !responsable.listo) return;
    setTrabajando(true);
    setError(null);
    const { valor, error: errCrear } = await proponerEtiqueta(nombre, responsable.encabezados());
    setTrabajando(false);
    if (errCrear || !valor) {
      setError(errCrear ?? "No se pudo crear la etiqueta. Reintenta.");
      return;
    }
    responsable.despues(null);
    if (valor.aprobado) onAprobada(valor);
    else onPendiente(valor);
  }

  return (
    <div
      role="group"
      aria-label={`Crear la etiqueta ${nombre}`}
      className="mt-2 space-y-2.5 rounded-md border border-sand bg-hueso p-3"
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
          ? "Queda en el catálogo para usarla en otras prendas, y se agrega a esta."
          : "Queda pendiente: un líder tiene que aprobarla en Catálogo → Atributos antes de poder agregarla a una prenda."}
      </p>
      <ComboResponsable control={responsable} deshabilitado={trabajando} compacto className="max-w-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" autoFocus onClick={() => void crear()} disabled={trabajando || !responsable.listo} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario">
          {trabajando ? "Creando…" : puedeAprobar ? "Crear y agregar" : "Proponer etiqueta"}
        </button>
        <button type="button" onClick={onCerrar} disabled={trabajando} className="btn-cayla btn-sutil">
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rojo-profundo">
          {error}
        </p>
      )}
    </div>
  );
}
