"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RefreshCw, Search, ShieldCheck, UserRound, SearchX } from "lucide-react";
import { nombresCortos } from "@/lib/nombre-integrante";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { PersonaDeTurno } from "@/lib/responsable-reglas";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { comboNecesitaBuscador, filtrarCombo } from "@/lib/combo-reglas";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Vacio } from "@/components/ui/Vacio";
import { Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";

type Props = {
  control: ControlResponsable;
  /** Mientras se guarda, no se cambia de responsable. */
  deshabilitado?: boolean;
  className?: string;
  /** El aviso del Admin como chip de una línea (Punto de venta, spike 2026-09-26): el recuadro de siempre ocupaba
   *  ~60 px del pie del ticket, justo donde el espacio más cuesta, y no cambia nada de lo que se hace. */
  compacto?: boolean;
};

/**
 * El combo «Responsable» (ADR-0161; diseño aprobado en `docs/maquetas/responsable-y-roles-spike-2026-09/`, pantallas
 * 2, 3 y 4). Va encima del botón que guarda, en TODA acción que guarda (desde el 2026-09-23 también Compras, Producción, Colaboradores y Roles). Las reglas viven en
 * `lib/responsable-reglas.ts` y el estado en `useResponsable`; esto solo pinta:
 *
 *  · Vacío, con borde punteado rojo: `control.pregunta` — «¿Quién está atendiendo?» al atender a la clienta (Punto de
 *    venta, Cambios, Devoluciones; siempre vacío) y «¿Quién hace esta operación?» en el resto (con la sesión de una
 *    persona presente ya viene elegida ella). En una terminal, vacío siempre.
 *  · La lista «De turno ahora · Tienda X»: presentes con punto verde; en pausa, deshabilitadas con punto ámbar; las
 *    que ya salieron solo se cuentan al pie.
 *  · Nadie presente: la operación se bloquea (sin «Otra persona») y se dice qué hacer — marcar entrada en el kiosco
 *    y «Actualizar lista». Igual para un líder, incluso trabajando desde casa (A9).
 *  · El Admin (ADR-0178) no pasa por nada de esto: firma él y solo ve un aviso de que no necesita autorización.
 */
export function ComboResponsable({ control, deshabilitado = false, className = "", compacto = false }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  // La caja flotante entera (buscador + opciones): vive en un portal, fuera de `raiz`.
  const capa = useRef<HTMLDivElement>(null);
  // La lista FLOTA (`fixed`, medida contra el botón; abre hacia abajo o, si no cabe, hacia arriba), igual que
  // ComboBuscable. Antes se abría dentro del contenido y empujaba todo 150–250 px; al elegir se cerraba de golpe y,
  // como el combo suele ser lo penúltimo de un formulario o de una ventana, la vista saltaba (2026-09-23, ADR-0185).
  // `fixed` tampoco queda recortada por el scroll propio de un `<Modal>`, que era la razón de abrirla en línea.
  const posLista = usePosicionLista(boton, abierto, 320);
  const destino = useDestinoFlotante(boton, abierto);
  const idLista = useId();
  const { estado, lista, sede, elegidoId } = control;

  // Cerrar al tocar fuera. Solo mientras está abierta: no deja oyentes sueltos en cada pantalla.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      // La lista cuelga de un portal (ADR-0211), FUERA de `raiz` en el DOM: el «¿tocó afuera?» tiene que
      // mirar las dos cajas. Mirando solo `raiz`, tocar una opción contaba como «afuera», la lista se cerraba
      // en el mousedown y el click de la opción ya no llegaba: no se podía elegir con mouse ni con el dedo.
      const t = e.target as Node;
      if (raiz.current?.contains(t) || capa.current?.contains(t)) return;
      setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  // Regla global de combos (ADR-0209): con más de 8 personas de turno a la vez, un buscador; si no, exactamente
  // el control de siempre. El paginado casi nunca se activa acá (una tienda no tiene 50 personas en un turno),
  // pero se cablea igual — es la misma regla en todo el sistema, no una excepción para este combo. Antes de los
  // `return` de abajo (admin/nadie/sin_lectura) porque son Hooks: tienen que llamarse en el mismo orden siempre,
  // aunque `lista` no importe en esos estados (`LISTA_VACIA`/la del Admin ya traen `elegibles`/`enPausa`).
  const opciones: PersonaDeTurno[] = useMemo(() => [...lista.elegibles, ...lista.enPausa], [lista.elegibles, lista.enPausa]);
  const mostrarBuscador = comboNecesitaBuscador(opciones.length);
  const filtradas = useMemo(() => {
    if (!mostrarBuscador || !busqueda) return opciones;
    return filtrarCombo(opciones, busqueda, (p) => ({ texto: p.nombre }));
  }, [opciones, busqueda, mostrarBuscador]);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();
  const mostradas = mostrarBuscador ? filtradas.slice(0, visibles) : opciones;

  // `posLista` (no solo `abierto`) en las dependencias: el panel recién se monta un render después de
  // abrir (usePosicionLista mide el botón antes de poder posicionarlo) — enfocar solo con `abierto` intentaba
  // enfocar un <input> que todavía no existía en el DOM, y se perdía el foco para siempre en esa apertura.
  useEffect(() => {
    if (abierto && posLista && mostrarBuscador) buscador.current?.focus();
  }, [abierto, posLista, mostrarBuscador]);

  // ADR-0454 (temporal, hasta integrar Lima con Dynamic): una terminal con firma de respaldo (Caja y Almacén de Lima) no pide nada, la base firma
  // sola. Se dice en una línea —como al Admin— y no se deja un hueco: muchas pantallas ponen su propio título («Quién recibe») junto al combo.
  if (estado === "respaldo" && compacto) {
    return (
      <p role="status" className={`flex ${className}`}>
        <Chip tono="pizarra" versalitas={false} title="Esta terminal no pide responsable. Lo que guardes queda a nombre de quien la respalda.">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
          Sin responsable{control.firmaDeRespaldo ? ` · ${control.firmaDeRespaldo}` : ""}
        </Chip>
      </p>
    );
  }

  if (estado === "respaldo") {
    return (
      <Aviso tono="info" chico className={className} titulo="Esta terminal no pide responsable">
        {control.firmaDeRespaldo ? `Lo que guardes queda a nombre de ${control.firmaDeRespaldo}.` : "Lo que guardes queda firmado por la terminal."}
      </Aviso>
    );
  }

  if (estado === "admin" && compacto) {
    return (
      <p role="status" className={`flex ${className}`}>
        <Chip tono="pizarra" versalitas={false} title="Eres admin: no necesitas autorización. Lo que guardes queda a tu nombre.">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
          Admin · queda a tu nombre
        </Chip>
      </p>
    );
  }

  if (estado === "admin") {
    return (
      <Aviso tono="info" chico className={className} titulo="Eres admin">
        No necesitas autorización. Lo que guardes queda a tu nombre.
      </Aviso>
    );
  }

  if (estado === "nadie" || estado === "sin_lectura") {
    const nadie = estado === "nadie";
    return (
      <Aviso tono="atencion" className={className} titulo={nadie ? `Nadie de turno en ${sede}` : "No se pudo leer quién está de turno"}>
        {nadie ? (
          <>
            <p>
              Para guardar, quien atiende tiene que haber marcado su <b className="font-semibold">entrada</b> hoy en esta tienda. Nadie lo
              ha hecho todavía (la regla es la misma para los líderes).
            </p>
            <ol className="ml-[18px] mt-2 list-decimal">
              <li>Marca tu entrada en el kiosco de asistencia de la tienda.</li>
              <li>Vuelve aquí y toca «Actualizar lista».</li>
            </ol>
          </>
        ) : (
          <p>Revisa la conexión y vuelve a intentar. Sin esa lista no se puede elegir quién hace la operación.</p>
        )}
        <Boton type="button" onClick={() => void control.recargar()} cargando={control.recargando} textoCargando="Actualizando…" className="mt-3 h-9">
          <span className="flex items-center gap-2">
            <RefreshCw className="-my-1 h-3.5 w-3.5" aria-hidden />
            Actualizar lista
          </span>
        </Boton>
      </Aviso>
    );
  }

  const cargando = estado === "cargando";
  const elegido = lista.elegibles.find((p) => p.personaId === elegidoId) ?? null;
  const cortos = nombresCortos(opciones.map((p) => p.nombre));

  function abrirOCerrar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setBusqueda("");
    mostrarDesde(Math.max(0, opciones.findIndex((p) => p.personaId === elegidoId)));
    setAbierto(true);
    // Al abrir se relee quién está de turno (2026-10-10): quien acaba de marcar su vuelta del refrigerio aparece en la lista
    // abierta sin esperar el próximo sondeo. Sin giro ni bloqueo: la lista que ya había sigue a la vista mientras llega.
    void control.recargar();
  }

  function elegir(p: PersonaDeTurno) {
    control.elegir(p.personaId);
    setAbierto(false);
  }

  function alTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && abierto) {
      // Este Escape cerró la lista: que no siga y cierre también el modal (useEscapeLibre.ts). El foco vuelve al botón,
      // como en `Desplegable`: si estaba en el buscador o en una persona, se desmontaron con la lista.
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
      return;
    }
    // Tab desde el botón deja el combo (la lista cuelga al final de la hoja, no a continuación): se cierra, para que no
    // quede a la vista con el foco en otro campo, donde un Escape ya no le llegaría. Dentro de la lista, Tab recorre
    // las personas y la lista sigue abierta.
    if (e.key === "Tab" && abierto && e.target === boton.current) {
      setAbierto(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    // Las opciones viven en el portal (`capa`), no dentro de `raiz`: buscándolas en `raiz`, las flechas no encontraban ninguna.
    const botones = Array.from(capa.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])') ?? []);
    if (botones.length === 0) return;
    e.preventDefault();
    if (!abierto) {
      setAbierto(true);
      return;
    }
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente = e.key === "ArrowDown" ? (i + 1) % botones.length : (i - 1 + botones.length) % botones.length;
    botones[siguiente]?.focus();
  }

  return (
    // `campo`: la etiqueta se oscurece con la caja encendida (ADR-0358, ronda 6).
    <div ref={raiz} className={`campo relative ${className}`} onKeyDown={alTeclado}>
      <p className="campo-etiqueta mb-1.5 flex items-center gap-1.5">
        Responsable <span className="text-rojo" aria-hidden>*</span>
      </p>
      <button
        ref={boton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={elegido ? `Responsable: ${elegido.nombre.replace(/\.$/, "")}. Cambiar` : "Elegir responsable"}
        disabled={deshabilitado || cargando}
        onClick={abrirOCerrar}
        // La caja que se enciende, de 48 px con su avatar (ADR-0358, ronda 6). Antes, una caja crema propia con borde rojo punteado
        // mientras faltaba: ahora lo dice el «*», «Obligatorio para guardar» y la guía de foco, como en todo campo.
        className="caja-cayla caja-campo caja-campo-alta disabled:cursor-default disabled:opacity-60"
      >
        {elegido ? (
          <AvatarPersona personaId={elegido.personaId} nombre={elegido.nombre} tamano={32} />
        ) : (
          <UserRound className="h-4 w-4 flex-none" aria-hidden />
        )}
        <span className={`min-w-0 flex-1 truncate text-sm ${elegido ? "" : "text-tinta/65"}`}>
          {cargando ? "Leyendo quién está de turno…" : elegido ? (cortos.get(elegido.nombre) ?? elegido.nombre) : control.pregunta}
        </span>
        <ChevronDown className="combo-flecha" aria-hidden />
      </button>
      {/* Pantalla abierta sin red (ADR-0210): la lista es la última que se leyó aquí. La base confirma al subir. */}
      {control.deMemoria && (
        <p className="mt-1.5 text-xs text-ambar-profundo">
          Sin conexión: lista de turno de las {diaYHoraLima(control.deMemoria).hora}. Al subir, el sistema confirma que esa persona estaba de turno.
        </p>
      )}

      {/* Portal a `document.body` (como `MenuAcciones`/`ResumenControles`, ADR-0211): esta lista va en `fixed`
          medida contra el control, y sin portal cualquier ancestro con stacking context propio (una tarjeta
          `@container`, un modal) la atrapa y la pinta detrás de contenido posterior en el DOM aunque tenga `z-50`. */}
      {abierto &&
        posLista &&
        destino &&
        createPortal(
          <div
            ref={capa}
            style={{ position: "fixed", ...posLista }}
            className="anim-revelar lista-flotante z-50 flex flex-col overflow-hidden rounded-xl"
          >
          {mostrarBuscador && (
            <div className="combo-buscar">
              <Search aria-hidden />
              <input
                ref={buscador}
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  reiniciar();
                }}
                placeholder="Buscar…"
                aria-label={`Buscar en de turno ahora · ${sede}`}
                aria-controls={idLista}
                autoComplete="off"
              />
            </div>
          )}
          <div id={idLista} role="listbox" aria-label={`De turno ahora en ${sede}`} onScroll={alHacerScroll} className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="label-cayla px-2 pb-2 pt-1.5 text-[11px] text-tinta/60">De turno ahora · {sede}</p>
            {mostrarBuscador && mostradas.length === 0 ? (
              <Vacio tamano="chico" alinear="izquierda" icono={<SearchX />}>
                Nada coincide con <b>«{busqueda.trim()}»</b>.
              </Vacio>
            ) : (
              mostradas.map((p) => (
                <button
                  key={p.personaId}
                  type="button"
                  role="option"
                  aria-selected={p.personaId === elegidoId}
                  disabled={p.enPausa}
                  onClick={() => elegir(p)}
                  className="relative flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-rojo/10 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {/* La elegida: el hilo rojo de canto, como en toda lista de combo (ADR-0358, ronda 6). */}
                  <span
                    aria-hidden
                    className={`absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-rojo transition-transform duration-200 ease-cayla ${p.personaId === elegidoId ? "scale-y-100" : "scale-y-0"}`}
                  />
                  <AvatarPersona personaId={p.personaId} nombre={p.nombre} tamano={32} />
                  <span className="min-w-0 flex-1">
                    {cortos.get(p.nombre) ?? p.nombre}
                    <small className="block text-[11.5px] text-tinta/60">
                      {p.enPausa ? "En pausa · no puede firmar" : p.deOtraSede ? "De turno · de otra sede" : "De turno"}
                    </small>
                  </span>
                  {p.personaId === elegidoId ? (
                    <Check aria-hidden className="combo-tilde" />
                  ) : (
                    <span className={`h-2 w-2 flex-none rounded-full ${p.enPausa ? "bg-ambar" : "bg-verde"}`} aria-hidden />
                  )}
                </button>
              ))
            )}
            {lista.salieron > 0 && (
              <p className="mt-1.5 border-t border-sand px-2 pb-0.5 pt-2 text-xs text-tinta/60">
                {lista.salieron === 1 ? "1 persona ya marcó su salida y no aparece." : `${lista.salieron} personas ya marcaron su salida y no aparecen.`}
              </p>
            )}
          </div>
        </div>,
          destino
        )}

      {!elegido && !cargando && <p className="mt-1.5 text-xs text-tinta/60">Obligatorio para guardar.</p>}
    </div>
  );
}
