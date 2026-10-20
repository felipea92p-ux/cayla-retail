"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { limpiarTallasSobrantes, quitarDeBandejaDelPanel, vaciarBandejaDelPanel } from "@/app/acciones/campanita";
import {
  cookieDeClave,
  cookieDelDia,
  etiquetaCampanita,
  llegadasNuevas,
  PREFIJO_LEIDO,
  PREFIJO_PANEL_VISTO,
  textoGlobo,
  textoLlegadasNuevas,
  textoNovedades,
  type AvisoEnPanel,
  type DatosCampanita,
  type LlegadaViva,
} from "@/lib/campanita";
import { hoyLima } from "@/lib/cuentas";
import { Icono } from "../Icono";
import { useAvisoBreve } from "../club/useAvisoBreve";
// El globo rojo (`.t-globo`) y el panel que baja del ícono.
import "@/app/estilos/bolsa.css";
import "@/app/estilos/campanita.css";

/** Escribe una cookie de este aparato. Si el navegador no deja guardar, no pasa nada: solo no se recuerda el estado. */
function escribirCookie(expresion: string) {
  try {
    document.cookie = expresion;
  } catch {
    // El navegador no deja guardar: la notificación queda como estaba.
  }
}

/** Anota en ESTE aparato que hoy se miró la campanita (de ahí en adelante «nuevo» es lo que llegue después). Sin cookies, la campanita
 *  sigue funcionando y las novedades vuelven a empezar sin número. */
function anotarMirada(cookie: string) {
  escribirCookie(cookieDelDia(cookie, hoyLima(), location.protocol === "https:"));
}

/**
 * La campanita de la cabecera (ADR-0408; Felipe, 2026-10-17; historial y «Ver todas», 2026-10-19). Un botón con su globo que abre un panel
 * con las 5 notificaciones más recientes (la más nueva primero), «Lo nuevo» y el enlace a «Ver todas».
 *
 * Estados: «Entendido» (abrir el panel) oculta el globo rojo hasta que llegue una nueva; no quita el punto ni el número. «Leído» (clic en la
 * notificación) quita su punto y resta 1 del número. «Eliminar» (la «×», una a una o todas) la quita del panel y de «Ver todas».
 */
export function BotonCampanita({
  cookie,
  vistoAntes,
  datos,
  hrefNuevo,
  tallasActivas,
}: {
  /** El nombre de la cookie de esta persona (`nombreCookieCampanita`). */
  cookie: string;
  /** ¿Ya había mirado la campanita antes en este aparato? */
  vistoAntes: boolean;
  datos: DatosCampanita;
  hrefNuevo: string;
  /** Las claves de las tallas que llegaron hoy (null si la base no contestó). Las demás cookies de talla se quitan. */
  tallasActivas: string[] | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [miradoAhora, setMiradoAhora] = useState(false);
  const [panelVisto, setPanelVisto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const idPanel = useId();
  const router = useRouter();
  const [, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();
  // Lo que la pantalla ya conoce: lo que llegue después de estas es nuevo y se avisa de inmediato.
  const conocidas = useRef(new Set(datos.claves));
  const mostrarRef = useRef(mostrar);
  useEffect(() => {
    mostrarRef.current = mostrar;
  });

  useEffect(() => {
    if (!vistoAntes) anotarMirada(cookie);
  }, [vistoAntes, cookie]);

  // Al abrir la página: las tallas que ya no están a favor (se volvieron a acabar) dejan de tener cookie. Así, si vuelven a llegar, avisan
  // como nuevas. Si se quitó algo, se vuelve a dibujar la campanita sin las cookies viejas.
  const claveTallas = tallasActivas === null ? null : tallasActivas.join(",");
  useEffect(() => {
    if (claveTallas === null) return;
    let vigente = true;
    const activas = claveTallas ? claveTallas.split(",") : [];
    limpiarTallasSobrantes(activas)
      .then((cambio) => {
        if (cambio && vigente) router.refresh();
      })
      .catch(() => {
        // Sin conexión: se intenta de nuevo la próxima vez que se abra la página.
      });
    return () => {
      vigente = false;
    };
  }, [claveTallas, router]);

  // En vivo: mientras la tienda está abierta, pregunta si llegó algo que la pantalla no conoce. Cuando llega, avisa con el aviso breve y
  // pide a la página que vuelva a leer la campanita (el globo y el panel). Sin red o sin sesión, calla y vuelve a preguntar después.
  useEffect(() => {
    let vigente = true;
    async function mirar() {
      if (document.visibilityState !== "visible") return;
      try {
        const respuesta = await fetch("/api/avisos-club", { cache: "no-store" });
        if (!respuesta.ok) return;
        const { llegadas } = (await respuesta.json()) as { llegadas: LlegadaViva[] };
        const nuevas = llegadasNuevas(conocidas.current, llegadas);
        if (!vigente || nuevas.length === 0) return;
        for (const n of nuevas) conocidas.current.add(n.clave);
        mostrarRef.current(textoLlegadasNuevas(nuevas), true, true, boton.current);
        router.refresh();
      } catch {
        // Sin conexión: no pasa nada; la próxima vuelta lo intenta de nuevo.
      }
    }
    const reloj = setInterval(mirar, INTERVALO_AVISOS_MS);
    document.addEventListener("visibilitychange", mirar);
    return () => {
      vigente = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, [router]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);


  // La «×» del panel: quita UNA notificación de la bandeja, sin borrarla (sigue en «Todas las notificaciones»).
  function quitar(clave: string) {
    iniciar(async () => {
      await quitarDeBandejaDelPanel([clave]);
      router.refresh();
    });
  }

  // «Vaciar bandeja»: quita las notificaciones del panel, sin borrarlas (siguen en «Todas las notificaciones»).
  function vaciar() {
    iniciar(async () => {
      await vaciarBandejaDelPanel();
      router.refresh();
    });
  }

  function alternar() {
    if (!abierto) {
      anotarMirada(cookie);
      setMiradoAhora(true);
      // «Entendido» (abrir el panel): los avisos ya se vieron. Oculta el globo rojo; el punto y el número no cambian.
      anotarEnPanel(datos.claves);
      setPanelVisto(true);
    }
    setAbierto((a) => !a);
  }

  // Anota en este aparato que esos avisos ya se vieron al abrir el panel («Entendido»).
  function anotarEnPanel(claves: string[]) {
    const seguro = location.protocol === "https:";
    for (const c of claves) escribirCookie(cookieDeClave(PREFIJO_PANEL_VISTO, c, seguro));
  }

  // «Leído» (clic en la notificación): quita su punto y resta 1 del número. Lo que lee la página al volver ya lo cuenta así.
  function marcarLeida(clave: string) {
    escribirCookie(cookieDeClave(PREFIJO_LEIDO, clave, location.protocol === "https:"));
  }

  // Lo nuevo ya se vio al abrir: el globo queda solo con las notificaciones sin leer.
  const globo = miradoAhora ? datos.globo - (datos.novedades ?? 0) : datos.globo;
  // El globo rojo se oculta con «Entendido» y solo vuelve con una notificación nueva (o con productos nuevos que aún no se miraron).
  const mostrarGlobo = globo > 0 && ((datos.pendientePanel && !panelVisto) || (!miradoAhora && (datos.novedades ?? 0) > 0));
  const sinNada = datos.claves.length === 0;

  return (
    <div className="t-avisos" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="t-ico"
        aria-label={etiquetaCampanita(globo)}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={alternar}
      >
        <Icono nombre="campana" />
        {mostrarGlobo ? <span className="t-globo">{textoGlobo(globo)}</span> : null}
      </button>
      {abierto && (
        <div className="t-avisos-panel" id={idPanel} role="region" aria-label="Tus notificaciones">
          {datos.recientes.length > 0 && (
            <section>
              <div className="t-avisos-cab-fila">
                <h3 className="t-avisos-sub">Tus notificaciones</h3>
                <button type="button" className="t-avisos-vaciar" onClick={vaciar}>
                  Vaciar bandeja
                </button>
              </div>
              <ul>
                {datos.recientes.map((f: AvisoEnPanel) => (
                  <li key={f.clave}>
                    <Link
                      className="t-avisos-fila"
                      href={f.href}
                      onClick={() => {
                        marcarLeida(f.clave);
                        setAbierto(false);
                      }}
                    >
                      <span className="t-avisos-ic" aria-hidden="true">
                        <Icono nombre={f.tipo === "respuesta" ? "chat" : "campana"} />
                      </span>
                      <span>
                        <b>{f.titulo}</b>
                        <small>{f.texto}</small>
                      </span>
                      {f.sinVer ? <span className="t-avisos-punto" role="img" aria-label="Sin leer" /> : null}
                    </Link>
                    <button type="button" className="t-avisos-borrar" aria-label={`Quitar de la bandeja: ${f.titulo}`} onClick={() => quitar(f.clave)}>
                      <Icono nombre="cerrar" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link className="t-avisos-nota t-avisos-mas t-avisos-todas-enlace" href="/notificaciones" onClick={() => setAbierto(false)}>
            Ver todas las notificaciones
          </Link>
          <section className="t-avisos-lo-nuevo">
            <h3 className="t-avisos-sub">Lo nuevo</h3>
            <p className="t-avisos-nota">{textoNovedades(datos.novedades)}</p>
            <Link className="t-enlace t-avisos-ver" href={hrefNuevo} onClick={() => setAbierto(false)}>
              Ver lo nuevo <Icono nombre="flecha" />
            </Link>
          </section>
          {sinNada && (
            <p className="t-avisos-ayuda">¿Una talla agotada? Toca «Avísame» en la prenda y te lo decimos aquí apenas llegue.</p>
          )}
        </div>
      )}
      {aviso}
    </div>
  );
}

/** Cada cuánto pregunta la campanita si llegó algo que la pantalla no conoce (mientras la pestaña esté a la vista). */
const INTERVALO_AVISOS_MS = 60_000;
