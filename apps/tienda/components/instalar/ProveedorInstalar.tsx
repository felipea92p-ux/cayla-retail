"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  CLAVE_REGISTRO,
  comoInstalar,
  conCierre,
  conInstalada,
  leerRegistro,
  plataformaDe,
  REGISTRO_VACIO,
  textoDelRegistro,
  VARIABLE_DEL_AVISO,
  type ComoInstalar,
  type Plataforma,
  type Registro,
  type Situacion,
  type TipoDeGuia,
} from "@/lib/instalar";
import { GuiaInstalar } from "./GuiaInstalar";

/** El aviso de instalar que Chrome de Android entrega a la página (todavía no está en los tipos de TypeScript). */
type EventoDeInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type Instalar = {
  /** Falso hasta que se leyó el aparato (en el servidor no hay navegador): nadie dibuja nada antes. */
  listo: boolean;
  situacion: Situacion;
  como: ComoInstalar;
  /** El botón «Añadir»: instala con un toque donde el navegador lo permite; si no, abre la guía. */
  instalar: () => Promise<"aceptada" | "guia" | "rechazada">;
  /** Un «Ahora no»: se calla 30 días (y con dos, para siempre). */
  cerrar: () => void;
  /** Sale un aviso solo, una vez por visita: la marca vive aquí, que no se desmonta al cambiar de página. */
  ofrecido: MutableRefObject<boolean>;
};

type Entorno = { listo: boolean; plataforma: Plataforma; yaEsApp: boolean; hayEvento: boolean; registro: Registro; ahora: number };
const ENTORNO_VACIO: Entorno = { listo: false, plataforma: "otra", yaEsApp: false, hayEvento: false, registro: REGISTRO_VACIO, ahora: 0 };

const Contexto = createContext<Instalar | null>(null);

export function useInstalar(): Instalar {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useInstalar va dentro de <ProveedorInstalar>");
  return valor;
}

/**
 * Lo que sabe el navegador sobre instalar CAYLA (ADR-0431), en un solo lugar y desde el primer momento: el aviso de Chrome llega una
 * vez y se pierde si nadie lo guarda, y los tres avisos (la hoja o la franja del Inicio, la tarjeta tras separar, la fila de «Mi
 * perfil») lo necesitan. Va en la raíz. Lo que la persona decidió se guarda en este aparato (`localStorage`), nunca en la base: es una
 * preferencia del celular, no del Club. Si el navegador no deja guardar, se pregunta en cada visita (más vale de más que romper).
 */
export function ProveedorInstalar({ children }: { children: React.ReactNode }) {
  // Todo lo que solo sabe el navegador, en un solo estado: se llena una vez al montar (leerlo al iniciar rompería la hidratación).
  const [entorno, setEntorno] = useState<Entorno>(ENTORNO_VACIO);
  const [guia, setGuia] = useState<TipoDeGuia | null>(null);
  const evento = useRef<EventoDeInstalar | null>(null);
  const registroActual = useRef<Registro>(REGISTRO_VACIO);
  const ofrecido = useRef(false);

  const guardar = useCallback((r: Registro) => {
    registroActual.current = r;
    setEntorno((e) => ({ ...e, registro: r }));
    try {
      localStorage.setItem(CLAVE_REGISTRO, textoDelRegistro(r));
    } catch {
      // Sin almacenamiento (navegación privada, bloqueado): lo decidido vale hasta cerrar la página.
    }
  }, []);

  useEffect(() => {
    const aparato = plataformaDe({ ua: navigator.userAgent, plataforma: navigator.platform, toques: navigator.maxTouchPoints });
    const pantalla = window.matchMedia("(display-mode: standalone)");
    const esApp = () => pantalla.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CLAVE_REGISTRO);
    } catch {
      guardado = null;
    }
    const inicial = leerRegistro(guardado);
    registroActual.current = inicial;
    // El aviso de Chrome pudo llegar antes de que esta pieza se armara: el script del <head> lo dejó guardado (`SCRIPT_DEL_AVISO`).
    const temprano = (window as unknown as Record<string, unknown>)[VARIABLE_DEL_AVISO];
    if (temprano) evento.current = temprano as EventoDeInstalar;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el aparato, la pantalla y lo guardado solo existen en el navegador
    setEntorno({ listo: true, plataforma: aparato, yaEsApp: esApp(), hayEvento: Boolean(temprano), registro: inicial, ahora: Date.now() });

    const alCambiarLaPantalla = () => setEntorno((e) => ({ ...e, yaEsApp: esApp() }));
    // Chrome avisa que la tienda se puede instalar. Se guarda el aviso (solo vale una vez) y se le quita el suyo propio: la tienda
    // ofrece el suyo cuando toca, no en el segundo cero.
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      evento.current = e as EventoDeInstalar;
      setEntorno((x) => ({ ...x, hayEvento: true }));
    };
    const alInstalarse = () => {
      evento.current = null;
      setEntorno((x) => ({ ...x, hayEvento: false }));
      guardar(conInstalada(registroActual.current));
    };
    pantalla.addEventListener("change", alCambiarLaPantalla);
    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalarse);
    // Chrome de Android solo ofrece instalar con un service worker (`public/sw.js`, que no guarda nada en caché).
    if (aparato === "android" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      pantalla.removeEventListener("change", alCambiarLaPantalla);
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalarse);
    };
  }, [guardar]);

  const { listo, plataforma, yaEsApp, hayEvento, registro, ahora } = entorno;
  // `ahora` es la hora en que se leyó el aparato: basta para saber si pasaron 30 días desde el último «Ahora no» (cada visita lo relee).
  const situacion = useMemo<Situacion>(() => ({ plataforma, yaEsApp, hayEvento, registro, ahora }), [plataforma, yaEsApp, hayEvento, registro, ahora]);
  const como = comoInstalar(plataforma, hayEvento);

  const cerrar = useCallback(() => guardar(conCierre(registroActual.current, Date.now())), [guardar]);

  const instalar = useCallback<Instalar["instalar"]>(async () => {
    const aviso = evento.current;
    if (aviso) {
      // El aviso de Chrome vale una sola vez, y `prompt()` tiene que salir del mismo toque del dedo (antes de cualquier espera).
      evento.current = null;
      (window as unknown as Record<string, unknown>)[VARIABLE_DEL_AVISO] = undefined;
      setEntorno((x) => ({ ...x, hayEvento: false }));
      try {
        await aviso.prompt();
        const { outcome } = await aviso.userChoice;
        if (outcome === "accepted") {
          guardar(conInstalada(registroActual.current));
          return "aceptada";
        }
      } catch {
        // El navegador no dejó mostrarlo: se cuenta como que no.
      }
      guardar(conCierre(registroActual.current, Date.now()));
      return "rechazada";
    }
    if (plataforma === "ios" || plataforma === "android") {
      setGuia(plataforma);
      return "guia";
    }
    return "rechazada";
  }, [plataforma, guardar]);

  const valor = useMemo<Instalar>(() => ({ listo, situacion, como, instalar, cerrar, ofrecido }), [listo, situacion, como, instalar, cerrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {guia && (
        <GuiaInstalar
          tipo={guia}
          alCerrar={() => {
            setGuia(null);
            cerrar();
          }}
        />
      )}
    </Contexto.Provider>
  );
}
