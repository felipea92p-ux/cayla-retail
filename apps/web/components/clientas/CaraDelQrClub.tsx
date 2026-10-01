"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { crearInvitacionClub, resumenClientaCaja } from "@/lib/club-acciones";
import {
  CONSULTA_QR_CADA_MS,
  caraDelQr,
  debePedirInvitacion,
  esperaDelQr,
  type CaraDelQr,
  type ClubDeLaCaja,
  type ComoLlegoLaPublicidad,
  type InvitacionDelQr,
} from "@/lib/club-caja-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { NIVEL_QR } from "@/lib/qr";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * La cara del QR personal de una socia sin publicidad, la MISMA en Cobrar (al unirla y desde el chip «Sin publicidad · QR»)
 * y en la ficha de /clientas («Mostrar su QR»). Camino B (ADR-0288, «Actualización 2026-09-30 (c)»), dibujada como el spike
 * del club (rama `claude/spyke-club-clientas-visual-631f7a`, `47-club-qr.js`, `modalQR`):
 *   1. Al aparecer crea su invitación (`crear_invitacion_club`, firma el responsable del combo; si no hay, lo pide antes:
 *      el QR no se crea sin quién) y dibuja el QR de su página `/club/{token}`.
 *   2. Mientras está a la vista pregunta `resumen_clienta_caja` cada 3 s (lectura `resumen_`: no abre el loader). Cuando
 *      ella marca la casilla y confirma, pasa sola a «Listo» y avisa (`onPublicidad`) para que la caja o la ficha se
 *      actualicen. Deja de preguntar al cerrarse, con la pestaña oculta y a los 10 minutos («¿Ya lo hizo? Actualizar»).
 *   3. Si la invitación no se puede crear, el QR del camino A (el WhatsApp de la tienda con su mensaje): nunca sin salida.
 * «Esperando su confirmación…» va con un punto QUIETO: el del spike late, y la regla de movimiento (ADR-0136) no admite
 * bucles. «Llegó su mensaje (respaldo)» lo resuelve quien la usa (`onLlegoSuMensaje`): la ficha tiene su hoja; Cobrar, la
 * suya en la misma hoja. Lo que muestra cada momento lo decide `caraDelQr` (lib/club-caja-reglas.ts, con pruebas).
 */
export function CaraDelQrClub({
  clientaId,
  nombre,
  codigo,
  club,
  ubicacionId,
  responsable,
  llego = null,
  onPublicidad,
  onLlegoSuMensaje,
  onListo,
}: {
  clientaId: string;
  /** Cómo se la nombra en «Listo: María recibe novedades por WhatsApp». */
  nombre: string;
  /** Su código de socia («C-0142»), o null (una socia de legado sin código: la página no lo necesita; el respaldo, sí). */
  codigo: string | null;
  /** Los textos del club y el WhatsApp de la tienda: solo para el QR de respaldo (camino A). */
  club: ClubDeLaCaja;
  ubicacionId: string | null;
  responsable: ControlResponsable;
  /** Quien la usa ya sabe que la tiene (registró «Llegó su mensaje» en la misma hoja). */
  llego?: ComoLlegoLaPublicidad | null;
  /** Llegó su publicidad (o la base dice que ya la tenía): la caja relee su resumen, la ficha se vuelve a leer. */
  onPublicidad: () => void;
  onLlegoSuMensaje: () => void;
  onListo: () => void;
}) {
  const [invitacion, setInvitacion] = useState<InvitacionDelQr>({ estado: "sin_pedir" });
  const [vista, setVista] = useState<ComoLlegoLaPublicidad | null>(null);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  // El reloj de la espera: `desde` es cuándo empezó (la invitación lista, o «Actualizar»); `ahora` se mueve con cada consulta.
  const [desde, setDesde] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [revisando, setRevisando] = useState(false);
  const [origen] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const publicidad = llego ?? vista;

  const cara = caraDelQr({
    nombre,
    codigo,
    club,
    origen,
    invitacion,
    publicidad,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
    espera: esperaDelQr({ visible, desdeMs: desde, ahoraMs: ahora }),
  });
  // Guía de foco (ADR-0284): lo único que se llena aquí es quién le muestra el QR, y solo si falta.
  const guia = useGuiaCampos(
    cara.tipo === "pide_responsable"
      ? [{ id: "responsable", nombre: "Quién le muestra el QR", requerido: true, hecho: responsable.listo, pendiente: cara.pendiente }]
      : []
  );

  // `onPublicidad` cambia en cada render de quien la usa: la consulta lee siempre el último sin reiniciarse.
  const alPublicidad = useRef(onPublicidad);
  useEffect(() => {
    alPublicidad.current = onPublicidad;
  }, [onPublicidad]);

  // 1. La invitación: una sola vez, cuando haya quién la firme. La base devuelve la vigente si ya había una (7 días).
  const pedida = useRef(false);
  const pedir = debePedirInvitacion({ invitacion, publicidad, responsableListo: responsable.listo });
  useEffect(() => {
    if (!pedir || pedida.current) return;
    pedida.current = true;
    crearInvitacionClub(clientaId, ubicacionId, responsable.firma())
      .then(({ token, error }) => {
        if (error?.hint === "ya_tiene_publicidad") {
          setVista("ya_tenia");
          alPublicidad.current();
          return;
        }
        if (error || !token) {
          // Solo ante un rechazo (como el resto de Cobrar): con éxito, `despues` soltaría a quien atiende la venta en curso.
          if (error) responsable.despues(error);
          setInvitacion({ estado: "fallo", detalle: error && !esFalloDeRed(error) ? traducirError(error, "preparar su página") : null });
          return;
        }
        const t = Date.now();
        setDesde(t);
        setAhora(t);
        setInvitacion({ estado: "lista", token });
      })
      .catch(() => setInvitacion({ estado: "fallo", detalle: null }));
    // Solo `pedir` dispara: la firma y el responsable se leen en el momento de pedirla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedir]);

  // 2. ¿Ya confirmó? Cada 3 s, solo con la página a la vista y hasta los 10 minutos. Un fallo de red no cambia nada: la
  //    siguiente vuelta pregunta de nuevo.
  const consultar = cara.tipo === "pagina" && cara.consultar;
  useEffect(() => {
    if (!consultar) return;
    let vigente = true;
    let enVuelo = false;
    const vuelta = setInterval(() => {
      setAhora(Date.now());
      if (enVuelo) return;
      enVuelo = true;
      resumenClientaCaja(clientaId)
        .then(({ resumen }) => {
          if (vigente && resumen?.conPublicidad) {
            setVista("pagina");
            alPublicidad.current();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          enVuelo = false;
        });
    }, CONSULTA_QR_CADA_MS);
    return () => {
      vigente = false;
      clearInterval(vuelta);
    };
  }, [consultar, clientaId]);

  // La pestaña oculta pausa la consulta; al volver, sigue sola (si no pasaron los 10 minutos).
  useEffect(() => {
    const alCambiar = () => {
      setVisible(document.visibilityState === "visible");
      setAhora(Date.now());
    };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);

  /** «¿Ya lo hizo? Actualizar»: pregunta una vez y, si todavía no, vuelve a esperar otros 10 minutos. */
  async function actualizar() {
    setRevisando(true);
    const { resumen } = await resumenClientaCaja(clientaId).catch(() => ({ resumen: null }));
    setRevisando(false);
    if (resumen?.conPublicidad) {
      setVista("pagina");
      alPublicidad.current();
      return;
    }
    const t = Date.now();
    setDesde(t);
    setAhora(t);
  }

  return (
    <VistaCaraDelQr
      cara={cara}
      codigo={codigo}
      revisando={revisando}
      onActualizar={actualizar}
      onLlegoSuMensaje={onLlegoSuMensaje}
      onListo={onListo}
      pedirResponsable={
        <>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Preparando su QR…" />
        </>
      }
    />
  );
}

/**
 * Lo que se VE de cada momento de la cara del QR (sin estado ni red): lo dibuja `CaraDelQrClub` y lo prueba
 * `lib/club-cara-qr.test.ts` renderizando cada `CaraDelQr`. `pedirResponsable`: el combo con su guía, solo en ese momento.
 */
export function VistaCaraDelQr({
  cara,
  codigo,
  revisando,
  pedirResponsable,
  onActualizar,
  onLlegoSuMensaje,
  onListo,
}: {
  cara: CaraDelQr;
  codigo: string | null;
  revisando: boolean;
  pedirResponsable: React.ReactNode;
  onActualizar: () => void;
  onLlegoSuMensaje: () => void;
  onListo: () => void;
}) {
  if (cara.tipo === "listo") {
    return (
      // Entra como respuesta a su confirmación (ADR-0136: dentro del contenido, corto, sin rebote).
      <div className="anim-revelar space-y-4">
        <div role="status" className="card-cayla p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-verde/15 text-verde" aria-hidden>
            <Check className="h-6 w-6" />
          </span>
          <p className="label-cayla mt-3 text-[11px] text-verde-profundo">{cara.etiqueta}</p>
          <p className="mt-1 font-display text-2xl leading-snug text-tinta">{cara.titulo}</p>
          <p className="mt-1 text-sm text-tinta/70">{cara.detalle}</p>
        </div>
        <div className="flex justify-end pt-1">
          <Boton type="button" peso="primario" autoFocus onClick={onListo}>
            Listo
          </Boton>
        </div>
      </div>
    );
  }

  if (cara.tipo === "pide_responsable") {
    return (
      <div className="anim-revelar space-y-5">
        <p className="text-sm text-tinta/75">Su QR abre una página de CAYLA a su nombre, y queda registrado quién se lo mostró. Primero, quién eres.</p>
        {pedirResponsable}
        <PieDeLaCara onLlegoSuMensaje={onLlegoSuMensaje} onListo={onListo} respaldo />
      </div>
    );
  }

  const enlace = cara.tipo === "pagina" ? cara.enlace : cara.tipo === "respaldo" ? cara.enlace : null;
  const destino = cara.tipo === "pagina" || cara.tipo === "respaldo" ? cara.destino : null;
  return (
    // Entra como respuesta a «Unir al club» o a «Mostrar su QR» (ADR-0136: dentro del contenido, corto y sin rebote).
    <div className="anim-revelar space-y-4">
      {cara.tipo === "respaldo" && (
        // Sin QR de WhatsApp tampoco, la misma nota dice por qué y qué queda: «Llegó su mensaje».
        <div className="nota-cayla space-y-1.5">
          <p>{cara.aviso}</p>
          {cara.detalle && <p className="text-xs text-tinta/65">{cara.detalle}</p>}
          {!enlace && <p>{cara.como}</p>}
        </div>
      )}

      {cara.tipo === "respaldo" && !enlace ? null : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-sand bg-crema p-5 sm:flex-row sm:gap-6">
          <div className="shrink-0 rounded-xl bg-papel p-3 ring-1 ring-tinta/10">
            {enlace ? (
              <QRCodeSVG
                value={enlace}
                size={176}
                // La página es un enlace corto (~45 bytes): nivel M, como las etiquetas. El de WhatsApp lleva el mensaje
                // entero (~240 bytes): nivel L, módulos más grandes para que el celular lo lea de la pantalla.
                level={cara.tipo === "pagina" ? NIVEL_QR : "L"}
                marginSize={0}
                bgColor="transparent"
                fgColor="currentColor"
                className="h-44 w-44 text-tinta"
                title={cara.tipo === "pagina" ? `Su página del club${codigo ? `, código ${codigo}` : ""}` : `WhatsApp de la tienda con el mensaje${codigo ? ` de ${codigo}` : ""}`}
              />
            ) : (
              // Pidiendo su invitación: el lugar del QR queda reservado (la hoja no salta cuando llega). Sin giro: el loader
              // general ya dice que la base está respondiendo.
              <div className="grid h-44 w-44 place-items-center text-center text-xs text-tinta/55">Preparando su QR…</div>
            )}
          </div>
          <div className="min-w-0 space-y-2 text-center sm:text-left">
            <p className="label-cayla text-[11px] text-taupe-profundo">{codigo ? `Su QR · código ${codigo}` : "Su QR"}</p>
            <p className="font-display text-xl leading-snug text-tinta">Pídele que lo escanee con la cámara de su celular.</p>
            <p className="text-[13px] leading-snug text-tinta/70">
              {cara.tipo === "respaldo" ? cara.como : "Se abre una página de CAYLA con el texto y una casilla. Cuando la marque y confirme, esto se actualiza solo."}
            </p>
            {destino && <p className="break-all font-mono text-[11px] text-tinta/45">{destino}</p>}
          </div>
        </div>
      )}

      {cara.tipo === "pagina" && (
        <div role="status" aria-live="polite" className="flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-hueso px-3.5 py-2.5 text-sm text-tinta/80">
          {/* Quieto a propósito: el del spike late, y la regla de movimiento no admite bucles (ADR-0136). */}
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ambar" />
          {cara.espera === "vencida" ? (
            <>
              <span className="min-w-0 flex-1">¿Ya lo hizo?</span>
              <Boton type="button" peso="fantasma" className="!py-2" cargando={revisando} onClick={onActualizar}>
                {revisando ? "Revisando…" : "Actualizar"}
              </Boton>
            </>
          ) : (
            <span className="min-w-0 flex-1">Esperando su confirmación…</span>
          )}
        </div>
      )}

      {(cara.tipo === "pagina" || cara.tipo === "respaldo") && <p className="text-xs leading-relaxed text-tinta/60">{cara.pie}</p>}
      <PieDeLaCara onLlegoSuMensaje={onLlegoSuMensaje} onListo={onListo} respaldo={cara.tipo !== "respaldo"} />
    </div>
  );
}

/** «Llegó su mensaje (respaldo)» a la izquierda y «Listo, por ahora no» a la derecha (spike, `modalQR`), sin los de demo. */
function PieDeLaCara({ onLlegoSuMensaje, onListo, respaldo }: { onLlegoSuMensaje: () => void; onListo: () => void; respaldo: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <button
        type="button"
        onClick={onLlegoSuMensaje}
        title="Si la página no le carga y te escribe por WhatsApp: la prueba es el chat de la tienda."
        className="text-xs text-tinta/70 underline underline-offset-2 hover:text-rojo"
      >
        {respaldo ? "Llegó su mensaje (respaldo)" : "Llegó su mensaje"}
      </button>
      <Boton type="button" peso="fantasma" autoFocus onClick={onListo}>
        Listo, por ahora no
      </Boton>
    </div>
  );
}
