"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { activarAvisosEnCelular, desactivarAvisosEnCelular } from "@/app/acciones/push";
import { claveAUint8 } from "@/lib/push";

// «Avísame en el celular» (Felipe, 2026-10-20): el botón que pide el permiso de avisos en este aparato. Se pide SOLO con un toque (iPhone
// no deja pedirlo de otra forma, y Chrome lo penaliza). En iPhone solo funciona con la app agregada a la pantalla de inicio: si no lo
// está, el botón no pide nada y dice cómo agregarla. Si el aparato no soporta avisos, no se dibuja nada.

/** Lo que el aparato permite: se lee del navegador (el servidor no lo sabe: no dibuja nada hasta conocerlo). */
type Capacidad = "revisando" | "no" | "instalar" | "denegado" | "si";

const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const esAppInstalada = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** El service worker de la tienda (`public/sw.js`): es el que recibe el aviso aunque la app esté cerrada. */
const RUTA_SW = "/sw.js";

function capacidadDelAparato(): Capacidad {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no";
  if (esIphone() && !esAppInstalada()) return "instalar";
  if (Notification.permission === "denied") return "denegado";
  return "si";
}

const sinCambios = () => () => {};
const enServidor = (): Capacidad => "revisando";

export function AvisarEnCelular({ clavePublica }: { clavePublica: string | null }) {
  const capacidad = useSyncExternalStore(sinCambios, capacidadDelAparato, enServidor);
  // Si el navegador tiene una suscripción activa en este aparato: «revisando» hasta leerla.
  const [suscrito, setSuscrito] = useState<"revisando" | "si" | "no">("revisando");
  const [negado, setNegado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (capacidad !== "si" || !clavePublica) return;
    let vigente = true;
    navigator.serviceWorker
      .getRegistration(RUTA_SW)
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (vigente) setSuscrito(sub ? "si" : "no");
      })
      .catch(() => {
        if (vigente) setSuscrito("no");
      });
    return () => {
      vigente = false;
    };
  }, [capacidad, clavePublica]);

  async function activar() {
    if (!clavePublica) return;
    setTrabajando(true);
    setFallo(false);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso === "denied") return setNegado(true);
      if (permiso !== "granted") return;
      const reg = (await navigator.serviceWorker.getRegistration(RUTA_SW)) ?? (await navigator.serviceWorker.register(RUTA_SW));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAUint8(clavePublica) as BufferSource }));
      const ok = await activarAvisosEnCelular(sub.toJSON());
      if (ok) setSuscrito("si");
      else setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setTrabajando(false);
    }
  }

  async function apagar() {
    setTrabajando(true);
    setFallo(false);
    try {
      const reg = await navigator.serviceWorker.getRegistration(RUTA_SW);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Primero se quita en la base: si eso falla, el aparato sigue activo y la persona lo intenta de nuevo.
        const ok = await desactivarAvisosEnCelular(sub.endpoint);
        if (!ok) {
          setFallo(true);
          return;
        }
        await sub.unsubscribe();
      }
      setSuscrito("no");
    } catch {
      setFallo(true);
    } finally {
      setTrabajando(false);
    }
  }

  // Lo que se ve sale de la capacidad y de lo que se sabe de la suscripción; nada de esto se fija a mano dentro de un efecto.
  // Con permiso bloqueado o iPhone sin instalar no hay suscripción que consultar: el texto que explica sale enseguida.
  if (!clavePublica || capacidad === "revisando" || capacidad === "no") return null;
  if (capacidad === "si" && suscrito === "revisando") return null;
  const denegado = negado || capacidad === "denegado";

  let texto: string;
  let boton: { texto: string; accion: () => void } | null = null;
  if (capacidad === "instalar") {
    texto = "En iPhone, primero agrega CAYLA a tu pantalla de inicio (botón Compartir ▸ Agregar a inicio). Desde la app puedes activar los avisos.";
  } else if (denegado) {
    texto = "Los avisos están bloqueados en este aparato. Puedes permitirlos en la configuración del navegador.";
  } else if (fallo) {
    texto = "No pudimos cambiar los avisos ahora. Vuelve a intentarlo en un momento.";
    boton = { texto: "Intentar de nuevo", accion: suscrito === "si" ? apagar : activar };
  } else if (suscrito === "si") {
    texto = "Te avisamos al celular cuando llegue una talla que esperabas o cambie tu pedido.";
    boton = { texto: "Apagar los avisos en este celular", accion: apagar };
  } else {
    texto = "Recibe un aviso en el celular cuando llegue una talla que esperabas o cambie tu pedido, aunque la app esté cerrada.";
    boton = { texto: "Avísame en el celular", accion: activar };
  }

  return (
    <section className="n-celular" aria-label="Avisos en el celular">
      <p className="n-celular-txt">{texto}</p>
      {boton && (
        <button type="button" className="t-btn t-btn-sec" onClick={boton.accion} disabled={trabajando} aria-busy={trabajando}>
          {boton.texto}
        </button>
      )}
    </section>
  );
}
