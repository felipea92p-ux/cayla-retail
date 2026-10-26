"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/campos";
import { anclaDeArranque, direccionDelTramo, esDeEstaPantalla, guiaDelTramo } from "@/lib/asistente/recorrido";
import { crearArranqueDemo } from "@/lib/guias/arranque-demo";
import { GUIAS } from "@/lib/guias/registro";
import { debeOfrecer, esEntradaDelMenu, guiaDeRuta } from "@/lib/guias/reglas";
import type { Guia } from "@/lib/guias/tipos";
import { GuiaInteractiva, type FinDeGuia } from "./GuiaInteractiva";
import { esperarAncla } from "./piloto";
import { marcaDeVez, olvidarRecorrido, tomarSiguiente } from "./recorrido";
import { leerVistas, marcarVista } from "./vistas";

// El que decide CUÁNDO corre una guía (ADR-0389). Montado una vez en `AppShell`; una pantalla no tiene que hacer nada.
//   · La primera vez que una persona entra a una pantalla con guía, se le OFRECE (una tarjeta abajo a la derecha, sin velo):
//     una sola vez por persona y por pantalla (Felipe, 2026-10-07), diga que sí o que no.
//   · `?demo=1` en la URL (lo pone «Demo» de Mi perfil al llevarte a otra pantalla) la arranca sola.
//   · El evento `cayla:abrir-guia` (el mismo «Demo», si ya estás en esa pantalla) también.
//   · «Pregúntale a CAYLA» (ADR-0529, actividad 3) arranca un TRAMO: la guía corta que empieza en el paso que responde
//     (`?demo=1&paso=…&vez=…`, o el mismo evento con el paso). Al terminarlo, si el recorrido sigue, lleva a la pantalla del
//     siguiente (`components/guias/recorrido.ts`); si la persona sale, lo que faltaba se olvida.

export const EVENTO_ABRIR_GUIA = "cayla:abrir-guia";

/** Lo que lleva el evento cuando lo dispara el asistente: el paso donde arranca el tramo. Sin detalle, la guía entera. */
type PedidoDeTramo = { pasoId: string | null };

/** Arranca la guía de la pantalla abierta (desde «Demo» de Mi perfil, sin navegar). Con `tramo`, solo desde ese paso (el asistente). */
export function abrirGuiaAqui(tramo?: PedidoDeTramo) {
  window.dispatchEvent(tramo ? new CustomEvent<PedidoDeTramo>(EVENTO_ABRIR_GUIA, { detail: tramo }) : new Event(EVENTO_ABRIR_GUIA));
}

/** Cuánto espera un tramo del asistente a que aparezca su pieza, en una pantalla recién abierta, antes de arrancar igual. */
const ESPERA_TRAMO_MS = 8000;

/** Cuánto espera la oferta tras llegar: que la pantalla termine de dibujarse y el loader se vaya. */
const ESPERA_OFERTA_MS = 1400;

export function MotorGuias({ quien, entradas }: { quien: string; /** Las rutas del menú de esta persona: solo ahí se ofrece sola. */ entradas: readonly string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const guia = guiaDeRuta(pathname, GUIAS);
  const [vistas, setVistas] = useState<{ quien: string; ids: Set<string> } | null>(null);
  const [corriendo, setCorriendo] = useState<Guia | null>(null);
  // ¿Lo que corre es un tramo del asistente? Al terminar no cuenta como demo vista entera, y puede seguir en otra pantalla.
  const [enRecorrido, setEnRecorrido] = useState(false);
  const [ofrecida, setOfrecida] = useState<Guia | null>(null);

  // Qué se le ofreció ya (una sola lectura por persona; si la base no responde, lo del navegador).
  useEffect(() => {
    let vigente = true;
    void leerVistas(quien).then((ids) => {
      if (vigente) setVistas({ quien, ids });
    });
    return () => {
      vigente = false;
    };
  }, [quien]);

  // Un tramo arranca cuando su pieza está a la vista (o pasados 8 s, y la tarjeta lo dice). Si mientras tanto la persona se fue a otra
  // pantalla, ya no arranca: explicaría piezas que no están.
  const arrancarTramo = useCallback((tramo: Guia) => {
    const ancla = anclaDeArranque(tramo);
    void (ancla ? esperarAncla(ancla, ESPERA_TRAMO_MS) : Promise.resolve(null)).then(() => {
      if (guiaDeRuta(window.location.pathname, GUIAS)?.id !== tramo.id) return;
      setEnRecorrido(true);
      setCorriendo(tramo);
    });
  }, []);

  const anotar = useCallback(
    (id: string, completa: boolean) => {
      setVistas((v) => (v ? { ...v, ids: new Set(v.ids).add(id) } : v));
      void marcarVista(quien, id, completa);
    },
    [quien],
  );

  // `?demo=1`: llegó desde «Demo» de Mi perfil. Se quita de la URL (una recarga no la vuelve a arrancar). El arranque va en
  // un temporizador que NO se cancela al limpiar la URL (si dependiera de `params`, limpiarla lo cancelaría); si la demo de
  // esta guía ya corre o arrancó hace poco, solo se limpia la URL (`lib/guias/arranque-demo.ts`).
  const pideDemo = params.get("demo") === "1";
  const pasoPedido = params.get("paso");
  const vez = params.get("vez");
  const [arranque] = useState(crearArranqueDemo);
  const corriendoRef = useRef<string | null>(null);
  useEffect(() => {
    corriendoRef.current = corriendo?.id ?? null;
  }, [corriendo]);
  useEffect(() => {
    if (!pideDemo || !guia) return;
    const limpio = new URLSearchParams(params.toString());
    limpio.delete("demo");
    limpio.delete("paso");
    limpio.delete("vez");
    // `history.replaceState` y no `router.replace`: en una ruta interceptada (el Historial de un producto, `@modal/(.)[id]`)
    // el router volvía a resolver la intercepción, Next respondía 500 y recargaba la página, y la guía se perdía.
    window.history.replaceState(window.history.state, "", limpio.size ? `${pathname}?${limpio}` : pathname);
    // Un tramo del asistente trae su `vez`: pedirlo de nuevo es otra vez, no un `?demo=1` que volvió con un enlace.
    const esTramo = vez !== null;
    arranque.pedir(esTramo ? `${guia.id}#${vez}` : guia.id, corriendoRef.current, () => {
      setOfrecida(null);
      if (esTramo) return arrancarTramo(guiaDelTramo(guia, pasoPedido));
      setEnRecorrido(false);
      setCorriendo(guia);
    });
  }, [pideDemo, guia, params, pathname, arranque, vez, pasoPedido, arrancarTramo]);
  useEffect(() => () => arranque.desmontar(), [arranque]);

  // «Demo» estando ya en la pantalla.
  useEffect(() => {
    const abrir = (e: Event) => {
      if (!guia) return;
      const tramo = e instanceof CustomEvent ? (e.detail as PedidoDeTramo | null) : null;
      setOfrecida(null);
      if (tramo) return arrancarTramo(guiaDelTramo(guia, tramo.pasoId));
      setEnRecorrido(false);
      setCorriendo(guia);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_GUIA, abrir);
  }, [guia, arrancarTramo]);

  // La oferta de la primera vez. Se anota como ofrecida en cuanto se muestra: si la persona se va sin responder, igual ya
  // se le ofreció (no se le insiste).
  const ofrecer = !!guia && !corriendo && !pideDemo && vistas?.quien === quien && debeOfrecer({ guiaId: guia.id, vistas: vistas.ids, leidas: true, entradaDelMenu: esEntradaDelMenu(pathname, entradas) });
  useEffect(() => {
    if (!ofrecer || !guia) return;
    const t = setTimeout(() => {
      setOfrecida(guia);
      anotar(guia.id, false);
    }, ESPERA_OFERTA_MS);
    return () => clearTimeout(t);
  }, [ofrecer, guia, anotar]);

  // Cambiar de pantalla (el «atrás» del navegador en plena demo) cierra la oferta y la guía que eran de la otra pantalla: una
  // guía que sigue corriendo sobre otra ruta explicaría piezas que no están.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la oferta y la guía pertenecen a la ruta: se cierran al salir de ella
    setOfrecida((o) => (o && o.id !== guia?.id ? null : o));
    setCorriendo((c) => (c && c.id !== guia?.id ? null : c));
  }, [guia]);

  function alTerminar(fin: FinDeGuia) {
    // Un tramo enseña un paso, no la pantalla: la guía queda como ofrecida, no como vista entera.
    if (corriendo) anotar(corriendo.id, fin === "completa" && !enRecorrido);
    setCorriendo(null);
    if (!enRecorrido) return;
    setEnRecorrido(false);
    if (fin !== "completa") return olvidarRecorrido();
    const siguiente = tomarSiguiente();
    if (!siguiente) return;
    if (!esDeEstaPantalla(siguiente, pathname)) return router.push(direccionDelTramo(siguiente, marcaDeVez()));
    if (guia) arrancarTramo(guiaDelTramo(guia, siguiente.pasoId));
  }

  return (
    <>
      {ofrecida && !corriendo && (
        <aside className="guia-oferta" aria-labelledby="guia-oferta-titulo" role="complementary">
          <p className="label-cayla text-[10.5px] text-taupe-profundo">Primera vez aquí</p>
          <h2 id="guia-oferta-titulo" className="mt-1 font-display text-[20px] leading-tight text-tinta">
            ¿Te mostramos {ofrecida.titulo}?
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta/75">
            {ofrecida.resumen} Es una demo de un par de minutos: no se guarda nada.
          </p>
          <div className="mt-3.5 flex items-center justify-end gap-2">
            <Boton type="button" peso="fantasma" onClick={() => setOfrecida(null)}>
              Ahora no
            </Boton>
            <Boton
              type="button"
              peso="primario"
              data-guia-ver
              onClick={() => {
                setCorriendo(ofrecida);
                setOfrecida(null);
              }}
            >
              Ver la demo
            </Boton>
          </div>
          <p className="mt-2.5 text-[11.5px] text-tinta/55">Siempre la encuentras en Mi perfil ▸ Demo.</p>
        </aside>
      )}
      {/* La clave lleva el primer paso: dos tramos seguidos de la misma pantalla son dos guías, y la segunda arranca de cero. */}
      {corriendo && <GuiaInteractiva key={`${corriendo.id}#${corriendo.pasos[0]?.id ?? ""}`} guia={corriendo} onTerminar={alTerminar} />}
    </>
  );
}
