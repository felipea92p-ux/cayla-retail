"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/campos";
import { GUIAS } from "@/lib/guias/registro";
import { debeOfrecer, esEntradaDelMenu, guiaDeRuta } from "@/lib/guias/reglas";
import type { Guia } from "@/lib/guias/tipos";
import { GuiaInteractiva, type FinDeGuia } from "./GuiaInteractiva";
import { leerVistas, marcarVista } from "./vistas";

// El que decide CUÁNDO corre una guía (ADR-0362). Montado una vez en `AppShell`; una pantalla no tiene que hacer nada.
//   · La primera vez que una persona entra a una pantalla con guía, se le OFRECE (una tarjeta abajo a la derecha, sin velo):
//     una sola vez por persona y por pantalla (Felipe, 2026-10-07), diga que sí o que no.
//   · `?demo=1` en la URL (lo pone «Demo» de Mi perfil al llevarte a otra pantalla) la arranca sola.
//   · El evento `cayla:abrir-guia` (el mismo «Demo», si ya estás en esa pantalla) también.

export const EVENTO_ABRIR_GUIA = "cayla:abrir-guia";

/** Arranca la guía de la pantalla abierta (desde «Demo» de Mi perfil, sin navegar). */
export function abrirGuiaAqui() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_GUIA));
}

/** Cuánto espera la oferta tras llegar: que la pantalla termine de dibujarse y el loader se vaya. */
const ESPERA_OFERTA_MS = 1400;

export function MotorGuias({ quien, entradas }: { quien: string; /** Las rutas del menú de esta persona: solo ahí se ofrece sola. */ entradas: readonly string[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const guia = guiaDeRuta(pathname, GUIAS);
  const [vistas, setVistas] = useState<{ quien: string; ids: Set<string> } | null>(null);
  const [corriendo, setCorriendo] = useState<Guia | null>(null);
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

  const anotar = useCallback(
    (id: string, completa: boolean) => {
      setVistas((v) => (v ? { ...v, ids: new Set(v.ids).add(id) } : v));
      void marcarVista(quien, id, completa);
    },
    [quien],
  );

  // `?demo=1`: llegó desde «Demo» de Mi perfil. Se quita de la URL (una recarga no la vuelve a arrancar). El arranque va en
  // un temporizador que NO se cancela al limpiar la URL (si dependiera de `params`, limpiarla lo cancelaría).
  const pideDemo = params.get("demo") === "1";
  const arranquePendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaDemo = useRef<{ id: string; cuando: number } | null>(null);
  const corriendoRef = useRef<string | null>(null);
  useEffect(() => {
    corriendoRef.current = corriendo?.id ?? null;
  }, [corriendo]);
  useEffect(() => {
    if (!pideDemo || !guia) return;
    const limpio = new URLSearchParams(params.toString());
    limpio.delete("demo");
    // Un enlace de la pantalla que conserva los parámetros de la URL (las píldoras de Facturas) puede traer de vuelta el `demo=1`:
    // si la demo de esta guía ya está corriendo o arrancó hace menos de un minuto, solo se limpia la URL y no se vuelve a empezar.
    const repetida = corriendoRef.current === guia.id || (ultimaDemo.current?.id === guia.id && Date.now() - ultimaDemo.current.cuando < 60_000);
    if (repetida) {
      window.history.replaceState(window.history.state, "", limpio.size ? `${pathname}?${limpio}` : pathname);
      return;
    }
    ultimaDemo.current = { id: guia.id, cuando: Date.now() };
    // `history.replaceState` y no `router.replace`: en una ruta interceptada (el Historial de un producto, `@modal/(.)[id]`)
    // el router volvía a resolver la intercepción, Next respondía 500 y recargaba la página, y la guía se perdía.
    window.history.replaceState(window.history.state, "", limpio.size ? `${pathname}?${limpio}` : pathname);
    if (arranquePendiente.current) clearTimeout(arranquePendiente.current);
    arranquePendiente.current = setTimeout(() => {
      arranquePendiente.current = null;
      setOfrecida(null);
      setCorriendo(guia);
    }, 700);
  }, [pideDemo, guia, params, pathname]);
  useEffect(() => () => {
    if (arranquePendiente.current) clearTimeout(arranquePendiente.current);
  }, []);

  // «Demo» estando ya en la pantalla.
  useEffect(() => {
    const abrir = () => {
      if (!guia) return;
      setOfrecida(null);
      setCorriendo(guia);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_GUIA, abrir);
  }, [guia]);

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
    if (corriendo) anotar(corriendo.id, fin === "completa");
    setCorriendo(null);
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
      {corriendo && <GuiaInteractiva key={corriendo.id} guia={corriendo} onTerminar={alTerminar} />}
    </>
  );
}
