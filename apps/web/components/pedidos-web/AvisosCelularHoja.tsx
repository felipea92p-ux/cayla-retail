"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { claveAUint8, paqueteDePrueba, paqueteDelPedido, puedeAvisar, suscripcionValida, telefonoDe, type Telefono } from "@/lib/push-pedidos-web";

/**
 * «Avisos de pedidos» (ADR-0582): que ESTE teléfono suene cuando un cliente separa en la tienda web para esta tienda. Activar pide el
 * permiso del teléfono (iPhone solo deja pedirlo con un toque), se suscribe con la clave pública del ERP y anota el teléfono con su
 * sede (`pedidos_web_push_activar`, que exige ver «Pedidos web» y operar la sede). El aviso lo manda el cron cada minuto.
 *
 * Lo que no se puede, se explica con pasos en vez de un «no se puede»: el iPhone abierto en Safari (hay que agregarlo a la pantalla de
 * inicio), el permiso bloqueado (se vuelve a dar en Ajustes) y el sonido de Android (se elige una vez en Ajustes, con el archivo que se
 * descarga aquí). El iPhone suena con el tono de iOS: Apple no deja que una app web elija el suyo.
 */

type Estado =
  | { fase: "leyendo" }
  | { fase: "iphone_sin_instalar" }
  | { fase: "sin_soporte" }
  | { fase: "sin_clave" }
  | { fase: "bloqueado" }
  | { fase: "apagado" }
  | { fase: "activo"; ubicacionId: string; sede: string };

type ErrorRpc = { message?: string; hint?: string | null } | null;
const rpc = (nombre: string, args: Record<string, unknown>) =>
  createClient().rpc(nombre as never, args as never) as unknown as Promise<{ data: unknown; error: ErrorRpc }>;

/** El service worker del ERP: lo registra `SinConexion` (en producción); si aún no está, se registra aquí al activar. */
async function registroDelErp(registrar: boolean): Promise<ServiceWorkerRegistration | null> {
  const actual = await navigator.serviceWorker.getRegistration();
  if (actual || !registrar) return actual ?? null;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function AvisosCelularHoja({
  tiendaId,
  tienda,
  clavePublica,
  onClose,
}: {
  tiendaId: string;
  tienda: string;
  /** La clave pública de envío del ERP (`ERP_VAPID_PUBLIC_KEY`); null si aún no se configuró. */
  clavePublica: string | null;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "leyendo" });
  const [telefono, setTelefono] = useState<Telefono>("otro");
  const [ocupado, setOcupado] = useState<"activar" | "apagar" | null>(null);
  const [errorBase, setErrorBase] = useState<{ titulo: string; detalle: string } | null>(null);
  // Un doble clic no suscribe dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const t = telefonoDe(navigator.userAgent);
      setTelefono(t);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const tienePush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const puede = puedeAvisar({ telefono: t, instalada, tienePush });
      let siguiente: Estado;
      if (puede !== "si") siguiente = { fase: puede };
      else if (!clavePublica) siguiente = { fase: "sin_clave" };
      else if (Notification.permission === "denied") siguiente = { fase: "bloqueado" };
      else {
        const registro = await registroDelErp(false).catch(() => null);
        const suscripcion = registro ? await registro.pushManager.getSubscription().catch(() => null) : null;
        if (!suscripcion) siguiente = { fase: "apagado" };
        else {
          const { data } = await rpc("fn_pedidos_web_push_estado", { p_endpoint: suscripcion.endpoint });
          const d = (data ?? {}) as { activo?: boolean; ubicacion_id?: string; sede?: string };
          siguiente = d.activo && d.ubicacion_id ? { fase: "activo", ubicacionId: d.ubicacion_id, sede: d.sede ?? tienda } : { fase: "apagado" };
        }
      }
      if (vivo) setEstado(siguiente);
    })();
    return () => {
      vivo = false;
    };
  }, [clavePublica, tienda]);

  async function activar() {
    if (enVuelo.current || !clavePublica) return;
    enVuelo.current = true;
    setOcupado("activar");
    setErrorBase(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? { fase: "bloqueado" } : { fase: "apagado" });
        if (permiso !== "denied") setErrorBase({ titulo: "No se activó", detalle: "El teléfono no dio el permiso. Vuelve a tocar «Activar» y elige «Permitir»." });
        return;
      }
      const registro = await registroDelErp(true);
      if (!registro) throw new Error("sin service worker");
      const clave = claveAUint8(clavePublica);
      let suscripcion = await registro.pushManager.getSubscription();
      try {
        suscripcion ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
      } catch {
        // Una suscripción vieja con otra clave no deja crear la nueva: se suelta y se vuelve a pedir.
        await suscripcion?.unsubscribe().catch(() => {});
        suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
      }
      const limpia = suscripcionValida(suscripcion.toJSON());
      if (!limpia) throw new Error("suscripción sin claves");
      const { error } = await rpc("pedidos_web_push_activar", {
        p_ubicacion_id: tiendaId,
        p_endpoint: limpia.endpoint,
        p_p256dh: limpia.p256dh,
        p_auth: limpia.auth,
      });
      if (error) {
        setErrorBase({ titulo: "No se activaron los avisos", detalle: traducirError({ message: error.message ?? "", hint: error.hint }, "activar los avisos") });
        return;
      }
      setEstado({ fase: "activo", ubicacionId: tiendaId, sede: tienda });
      avisar.exito("Avisos activados", { detalle: `Este celular suena con cada pedido web de ${tienda}.` });
    } catch {
      setErrorBase({ titulo: "No se activaron los avisos", detalle: "El teléfono no respondió. Revisa que tenga internet y vuelve a intentarlo." });
    } finally {
      enVuelo.current = false;
      setOcupado(null);
    }
  }

  async function apagar() {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setOcupado("apagar");
    setErrorBase(null);
    try {
      const registro = await registroDelErp(false);
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      if (suscripcion) {
        const { error } = await rpc("pedidos_web_push_apagar", { p_endpoint: suscripcion.endpoint });
        if (error) {
          setErrorBase({ titulo: "No se apagaron los avisos", detalle: traducirError({ message: error.message ?? "", hint: error.hint }, "apagar los avisos") });
          return;
        }
        await suscripcion.unsubscribe().catch(() => {});
      }
      setEstado({ fase: "apagado" });
      avisar.exito("Avisos apagados", { detalle: "Este celular ya no suena con los pedidos web." });
    } catch {
      setErrorBase({ titulo: "No se apagaron los avisos", detalle: "El teléfono no respondió. Vuelve a intentarlo." });
    } finally {
      enVuelo.current = false;
      setOcupado(null);
    }
  }

  // El mismo aviso que manda el servidor, armado por el service worker: así suena y se ve igual que uno de verdad.
  async function probar() {
    const registro = await registroDelErp(false).catch(() => null);
    registro?.active?.postMessage({ tipo: "probar-aviso-pedido-web", paquete: paqueteDePrueba(tienda) });
  }

  const activoAqui = estado.fase === "activo" && estado.ubicacionId === tiendaId;
  const activoEnOtra = estado.fase === "activo" && estado.ubicacionId !== tiendaId;
  // La muestra con un pedido de verdad de la maqueta (W-0018), en esta tienda.
  const muestra = paqueteDelPedido({ pedidoId: "", codigo: "W-0018", sede: tienda, prendas: 1, total: 109, foto: null });
  // Solo se lee (o se explica cómo): la × arriba. Si se puede activar o cambiar de sede, «Cancelar» en su pie (ADR-0358, `modal`).
  const guarda = estado.fase === "apagado" || activoEnOtra;

  return (
    <Modal
      titulo="Avisos de pedidos"
      subtitulo={`En este celular · ${tienda}`}
      onClose={onClose}
      tamano="angosta"
      bloqueado={ocupado !== null}
      conCerrar={!guarda}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-[13px] text-taupe">Cuando un cliente separa en la tienda web, este celular suena y muestra el pedido. Así:</p>

          {/* El aviso tal como llega (el texto «A · Directo» que eligió Felipe): número, sede, cuántas prendas y total. */}
          <div aria-hidden className="flex items-start gap-3 rounded-2xl border border-sand bg-hueso/60 px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-rojo text-crema">
              <BellRing className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-tinta">{muestra.titulo}</span>
              <span className="block truncate text-[13px] text-tinta/70">{muestra.texto.replace(/S\/ 0\.00/, "S/ 109.00")}</span>
            </span>
          </div>

          {estado.fase === "leyendo" && <p className="text-[13px] text-taupe">Revisando este celular…</p>}

          {activoAqui && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-tinta">
              <Chip tono="verde">Activo</Chip> Este celular suena con cada pedido web de {tienda}.
            </p>
          )}
          {activoEnOtra && (
            <Aviso tono="info" titulo={`Este celular suena para ${estado.sede}`}>
              Si lo cambias, sonará solo con los pedidos de {tienda}.
            </Aviso>
          )}
          {estado.fase === "apagado" && <p className="text-[13px] text-tinta">Este celular todavía no suena. Actívalo y elige «Permitir» cuando el teléfono pregunte.</p>}

          {estado.fase === "iphone_sin_instalar" && (
            <Aviso tono="atencion" titulo="Primero agrega el ERP a la pantalla de inicio">
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>Abre el ERP en Safari.</li>
                <li>Toca Compartir (el cuadrado con la flecha hacia arriba).</li>
                <li>Elige «Agregar a pantalla de inicio» y luego «Agregar».</li>
                <li>Abre «CAYLA ERP» desde su ícono rojo y vuelve aquí.</li>
              </ol>
            </Aviso>
          )}
          {estado.fase === "sin_soporte" && (
            <Aviso tono="atencion" titulo="Este navegador no recibe avisos">
              En un Android, abre el ERP en Chrome; en un iPhone, agrégalo a la pantalla de inicio desde Safari.
            </Aviso>
          )}
          {estado.fase === "sin_clave" && (
            <Aviso tono="atencion" titulo="Los avisos todavía no están listos">
              Falta configurar el envío en el ERP. Avísale al líder.
            </Aviso>
          )}
          {estado.fase === "bloqueado" && (
            <Aviso tono="atencion" titulo="Las notificaciones están bloqueadas">
              {telefono === "iphone"
                ? "Ve a Ajustes ▸ Notificaciones ▸ CAYLA ERP y prende «Permitir notificaciones». Después vuelve aquí."
                : telefono === "android"
                  ? "Ve a Ajustes ▸ Apps ▸ CAYLA ERP ▸ Notificaciones y prende las notificaciones. Después vuelve aquí."
                  : "Toca el candado junto a la dirección de la página, permite las notificaciones y vuelve aquí."}
            </Aviso>
          )}

          {telefono === "android" && activoAqui && (
            <div className="space-y-2 border-t border-sand pt-4">
              <p className="text-[13px] font-semibold text-tinta">El sonido «Campanita»</p>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-tinta">
                <li>Descarga el sonido.</li>
                <li>Ve a Ajustes ▸ Apps ▸ CAYLA ERP ▸ Notificaciones y toca el tipo de aviso.</li>
                <li>Toca «Sonido», elige «Agregar» (o «+») y escoge «campanita-cayla».</li>
              </ol>
              <BotonDescargar href="/sonidos/campanita-cayla.wav" chico>
                Descargar el sonido
              </BotonDescargar>
              <p className="text-[12px] text-taupe">Los nombres cambian un poco según la marca del teléfono.</p>
            </div>
          )}
          {telefono === "iphone" && activoAqui && <p className="text-[12px] text-taupe">En el iPhone suena el tono de iOS: Apple no deja que una app web elija el suyo.</p>}

          {errorBase && (
            <Aviso tono="error" titulo={errorBase.titulo}>
              {errorBase.detalle}
            </Aviso>
          )}

          {guarda && (
            <PieAcciones izquierda={activoEnOtra ? <Boton type="button" peso="peligro" onClick={() => void apagar()} cargando={ocupado === "apagar"} textoCargando="Apagando…">Apagar</Boton> : undefined}>
              <Boton type="button" peso="fantasma" onClick={cerrar} disabled={ocupado !== null}>
                Cancelar
              </Boton>
              <Boton type="button" peso="primario" onClick={() => void activar()} cargando={ocupado === "activar"} textoCargando="Activando…">
                {activoEnOtra ? `Cambiar a ${tienda}` : "Activar en este celular"}
              </Boton>
            </PieAcciones>
          )}
          {activoAqui && (
            <PieAcciones
              izquierda={
                <Boton type="button" peso="peligro" onClick={() => void apagar()} cargando={ocupado === "apagar"} textoCargando="Apagando…">
                  Apagar
                </Boton>
              }
            >
              <Boton type="button" peso="fantasma" onClick={() => void probar()} disabled={ocupado !== null}>
                Probar el aviso
              </Boton>
            </PieAcciones>
          )}
        </div>
      )}
    </Modal>
  );
}
