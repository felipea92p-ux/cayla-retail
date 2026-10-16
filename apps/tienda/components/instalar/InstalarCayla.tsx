"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  avisoAlEntrar,
  INTENTOS_DE_QUIETUD,
  QUIETUD_MS,
  RETRASO_FRANJA_MS,
  RETRASO_HOJA_MS,
  textoDelBoton,
  type AvisoAlEntrar,
} from "@/lib/instalar";
import { Icono } from "../Icono";
import { HojaNativa } from "./HojaNativa";
import { IconoApp } from "./IconoApp";
import { useInstalar } from "./ProveedorInstalar";

const EVENTOS_DE_ACTIVIDAD = ["touchstart", "pointerdown", "keydown", "scroll", "wheel"] as const;

/** ¿Hay en la página el aviso del Club, abierto? Si lo hay, uno espera al otro: se ofrece la franja, que no se apila como tarjeta. */
const hayAvisoDelClub = () => document.querySelector(".t-aviso-club-envol:not([data-cerrado])") !== null;

/** Quien escribe algo, o ya tiene una hoja abierta, no recibe nada encima. */
function hayAlgoQueNoSeDebeTapar() {
  const activo = document.activeElement;
  const escribiendo = activo instanceof HTMLElement && (activo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName));
  return escribiendo || document.querySelector("dialog[open]") !== null;
}

/**
 * El aviso de instalar al entrar (ADR-0431; plantillas A y C de docs/maquetas/tienda-instalar-2026-10). Va en el marco del Inicio y el
 * catálogo. Reglas de buena vecindad, todas pensadas para no malograr lo que la persona vino a hacer:
 *  - Primero ve la tienda: la hoja espera 8 s y la franja 4 s.
 *  - Nunca encima de un gesto: si acaba de tocar o de bajar la página, se espera a que se quede quieta (y si no se queda, se deja para
 *    otra visita); tampoco con un campo en uso ni con otra hoja abierta.
 *  - La franja empuja la página hacia abajo, así que solo sale con la página arriba del todo (si no, lo que se lee saltaría).
 *  - Una sola vez por visita; «Ahora no» calla 30 días, y dos, para siempre (`lib/instalar.ts`).
 */
export function InstalarCayla() {
  const instalar = useInstalar();
  const { listo, situacion, ofrecido } = instalar;
  const pagina = usePathname();
  const [aviso, setAviso] = useState<AvisoAlEntrar>(null);

  useEffect(() => {
    if (!listo || ofrecido.current) return;
    const inicial = avisoAlEntrar(situacion, pagina, hayAvisoDelClub());
    if (!inicial) return;

    let ultimaActividad = 0;
    const marcar = () => {
      ultimaActividad = Date.now();
    };
    for (const e of EVENTOS_DE_ACTIVIDAD) window.addEventListener(e, marcar, { passive: true });

    let intentos = 0;
    let reloj: number;
    const alVencer = () => {
      if (ofrecido.current) return;
      const ahora = avisoAlEntrar({ ...situacion, ahora: Date.now() }, pagina, hayAvisoDelClub());
      if (!ahora) return;
      const quieta = Date.now() - ultimaActividad >= QUIETUD_MS;
      const arriba = ahora !== "franja" || window.scrollY <= 8;
      if (document.visibilityState !== "visible" || !quieta || !arriba || hayAlgoQueNoSeDebeTapar()) {
        if (++intentos <= INTENTOS_DE_QUIETUD) reloj = window.setTimeout(alVencer, 2000);
        return;
      }
      ofrecido.current = true;
      setAviso(ahora);
    };
    reloj = window.setTimeout(alVencer, inicial === "franja" ? RETRASO_FRANJA_MS : RETRASO_HOJA_MS);
    return () => {
      window.clearTimeout(reloj);
      for (const e of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(e, marcar);
    };
  }, [listo, situacion, pagina, ofrecido]);

  if (!aviso) return null;
  const alAnadir = () => {
    setAviso(null);
    void instalar.instalar();
  };
  const alCerrar = () => {
    setAviso(null);
    instalar.cerrar();
  };
  return aviso === "hoja" ? (
    <HojaDeInstalar texto={textoDelBoton(instalar.como)} alAnadir={alAnadir} alCerrar={alCerrar} />
  ) : (
    <FranjaDeInstalar texto={instalar.como === "evento" ? "Añadir" : "Ver cómo"} alAnadir={alAnadir} alCerrar={alCerrar} />
  );
}

/** Plantilla C: la hoja de abajo, con cómo quedará el ícono. */
function HojaDeInstalar({ texto, alAnadir, alCerrar }: { texto: string; alAnadir: () => void; alCerrar: () => void }) {
  return (
    <HojaNativa etiqueta="Añadir CAYLA a tu celular" alCerrar={alCerrar}>
      <h2 className="t-inst-tit">
        Pon CAYLA en tu <em>pantalla de inicio</em>
      </h2>
      <p className="t-inst-txt">Entra más rápido a separar tus prendas y a ver tu pedido. No ocupa espacio y no pasa por la tienda de apps.</p>
      <div className="t-inst-previa" aria-hidden="true">
        <span className="t-inst-it">
          <i />
          Mensajes
        </span>
        <span className="t-inst-it">
          <i />
          Fotos
        </span>
        <span className="t-inst-it t-inst-it-cayla">
          <IconoApp />
          CAYLA
        </span>
        <span className="t-inst-it">
          <i />
          Mapas
        </span>
      </div>
      <div className="t-inst-acc">
        <button type="button" className="t-btn t-btn-ancho" onClick={alAnadir}>
          {texto}
        </button>
        <button type="button" className="t-enlace t-inst-ahora-no" onClick={alCerrar}>
          Ahora no
        </button>
      </div>
    </HojaNativa>
  );
}

/** Plantilla A: la franja bajo la cabecera. Se abre con el mismo pliegue del aviso del Club (la fila de la grilla crece sin rebote). */
function FranjaDeInstalar({ texto, alAnadir, alCerrar }: { texto: string; alAnadir: () => void; alCerrar: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [cerrada, setCerrada] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAbierta(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  const oculta = !abierta || cerrada;
  return (
    <div className="t-inst-pliegue" data-cerrado={oculta || undefined} inert={oculta || undefined}>
      <div>
        <section className="t-inst-franja" aria-label="Instalar CAYLA">
          <IconoApp />
          <span className="t-inst-franja-txt">
            <b>CAYLA en tu celular</b>
            <small>Entra con un toque</small>
          </span>
          <button type="button" className="t-btn t-btn-chico" onClick={alAnadir}>
            {texto}
          </button>
          <button
            type="button"
            className="t-inst-x"
            aria-label="Cerrar aviso"
            onClick={() => {
              setCerrada(true);
              alCerrar();
            }}
          >
            <Icono nombre="cerrar" />
          </button>
        </section>
      </div>
    </div>
  );
}
