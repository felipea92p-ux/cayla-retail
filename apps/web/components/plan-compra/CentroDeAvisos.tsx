"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Bell, ChevronUp, CircleAlert, CircleCheck, Info } from "lucide-react";
import { usePosicionLista } from "@/components/ui/useAnclaje";
import { avisosVisibles, elQueAsoma, porAtender, type AccionDelAviso, type AvisoDelPlan, type NivelDelAviso, type Vistos } from "@/lib/plan-compra-avisos";

// El centro de avisos del Plan de campaña (tarea #4 de la auditoría, Felipe 2026-10-26, spike ②): UN ícono con su número, sin palabra, que abre una
// lista flotante con su barra de desplazamiento. Reemplaza a las franjas dispersas (el plazo, el stock sobre la tabla). Lo que decide cada cosa
// —qué es urgente, qué cuenta, cuándo un «ya lo vi» deja de valer— vive en `lib/plan-compra-avisos.ts`; esto solo lo dibuja.
//
// Se ve TAL CUAL la maqueta (docs/maquetas/plan-campana-vision-2026-10/2-avisos.html; Felipe lo pidió así): el marcado y las clases siguen su
// `montarAvisos`/`cuerpoAvisos`, y la cara está en `app/estilos/centro-avisos.css`. No usa `<Aviso>` ni `<Globito>` a propósito: la maqueta es la
// decisión (franja de 5 px, etiqueta del nivel, botones en columna a la derecha, el número DENTRO del botón).
//
// Flota encima de la tabla y no la mueve (ADR-0185: la página no se encoge bajo el mouse). Lo urgente asoma una línea junto al ícono aunque esté
// cerrado: esconder el plazo tras un contador baja cuánto se lo descubre, y es el único aviso cuyo costo de ignorarlo es plata.
// Se cierra con Escape (y el foco vuelve al ícono), con un clic afuera y al elegir una acción que abre otra cosa.

const ETIQUETA: Record<NivelDelAviso, string> = { urgente: "Urgente", pendiente: "Por atender", info: "Para saber", ok: "En orden" };
const ICONO: Record<NivelDelAviso, ReactNode> = {
  urgente: <CircleAlert aria-hidden />,
  pendiente: <CircleAlert aria-hidden />,
  info: <Info aria-hidden />,
  ok: <CircleCheck aria-hidden />,
};
const ANCHO_PANEL = 460;
const MARGEN = 12;

function Acciones({ aviso, alAccionar, alVisto }: { aviso: AvisoDelPlan; alAccionar: (a: AccionDelAviso) => void; alVisto: () => void }) {
  const marcable = aviso.nivel !== "urgente";
  if (aviso.acciones.length === 0 && !marcable) return null;
  return (
    <div className="ca-acc">
      {aviso.acciones.map((a) =>
        a.tipo === "ir-conteo" ? (
          <Link key={a.tipo} href="/inventario/conteo" className="ca-btn">
            {a.texto}
          </Link>
        ) : (
          <button key={a.tipo} type="button" className="ca-btn" aria-haspopup="dialog" data-guia={a.tipo === "cambiar-dias" ? "plan.plazo-cambiar" : undefined} onClick={() => alAccionar(a)}>
            {a.texto}
          </button>
        ),
      )}
      {/* «Ya lo vi» no borra: deja de contar ese aviso hasta que cambie el dato. «Entendido» esconde lo que solo informa. Lo urgente no se marca. */}
      {marcable && (
        <button type="button" className="ca-btn ca-btn-texto" onClick={alVisto} title={aviso.nivel === "pendiente" ? "Deja de contarlo hasta que cambie" : undefined}>
          {aviso.nivel === "pendiente" ? "Ya lo vi" : "Entendido"}
        </button>
      )}
    </div>
  );
}

export function CentroDeAvisos({
  avisos,
  vistos,
  onVisto,
  onAccion,
}: {
  avisos: readonly AvisoDelPlan[];
  vistos: Vistos;
  /** La persona marcó un aviso como visto. */
  onVisto: (a: AvisoDelPlan) => void;
  /** Eligió una acción que abre otra cosa (una hoja, el cajón): el centro se cierra antes. «Ir a Conteo» es un enlace y no pasa por aquí. */
  onAccion: (a: AccionDelAviso) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // El ancla es la caja que envuelve al botón: sirve para colocar la lista y para devolver el foco.
  const ancla = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const visibles = avisosVisibles(avisos, vistos);
  const n = porAtender(avisos, vistos);
  const urgente = elQueAsoma(avisos);
  const pos = usePosicionLista(ancla, abierto, 4000, 8);

  // Mientras está abierto: Escape lo cierra (y el foco vuelve al ícono) y un toque afuera también.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      ancla.current?.querySelector<HTMLElement>("button")?.focus();
    };
    const alTocar = (e: PointerEvent) => {
      const destino = e.target as Node;
      if (panel.current?.contains(destino) || ancla.current?.contains(destino)) return;
      // La tarjeta de la guía interactiva está «afuera», pero tocarla no es pedir que se cierre lo que la guía está explicando.
      if (destino instanceof Element && destino.closest("[data-guia-motor]")) return;
      setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear, true);
    document.addEventListener("pointerdown", alTocar, true);
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      document.removeEventListener("pointerdown", alTocar, true);
    };
  }, [abierto]);

  // Al abrirse, el foco entra a la lista (queda en un portal, lejos del ícono en el orden del teclado).
  useEffect(() => {
    if (abierto && pos) panel.current?.focus({ preventScroll: true });
    // Solo al abrirse: cada cuadro `pos` cambia de objeto y no debe devolver el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pos === null]);

  const etiqueta = abierto ? "Ocultar los avisos" : n > 0 ? `Avisos: ${n} por atender` : "Avisos: nada por atender";
  const accionar = (a: AccionDelAviso) => {
    setAbierto(false);
    onAccion(a);
  };

  return (
    <div className="ca-centro" data-guia="plan.avisos">
      {/* Lo urgente no se esconde: asoma una línea junto al ícono, y tocarla abre la lista. */}
      {urgente?.corto && !abierto && (
        <button type="button" className="ca-asoma" onClick={() => setAbierto(true)} aria-label={`${urgente.corto}. Abrir los avisos`}>
          {urgente.corto}
        </button>
      )}
      <div ref={ancla} className="ca-ancla">
        <button
          type="button"
          className="ca-boton"
          data-urgente={urgente ? "" : undefined}
          data-vacio={n === 0 ? "" : undefined}
          aria-expanded={abierto}
          aria-controls={abierto ? id : undefined}
          aria-label={etiqueta}
          title={abierto ? "Ocultar los avisos" : "Avisos"}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? <ChevronUp aria-hidden /> : <Bell aria-hidden />}
          <span className="ca-n">{n}</span>
          <span className="ca-txt">{abierto ? "Ocultar" : "Avisos"}</span>
        </button>
      </div>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panel}
            id={id}
            // Un diálogo que no es modal: la página de atrás sigue viva. Así el lector de pantalla lo anuncia como lo que es, y la guía interactiva
            // lo cuenta como algo abierto que su Escape puede cerrar.
            role="dialog"
            aria-modal="false"
            aria-label="Avisos"
            tabIndex={-1}
            data-guia="plan.avisos-panel"
            style={{
              position: "fixed",
              right: Math.max(MARGEN, window.innerWidth - (pos.left + pos.width)),
              width: `min(${ANCHO_PANEL}px, 92vw)`,
              // Como la maqueta: lo que queda hasta el borde de abajo menos 24 px, y nunca menos de 180.
              maxHeight: Math.max(180, pos.maxHeight - 8),
              ...("top" in pos ? { top: pos.top } : { bottom: pos.bottom }),
            }}
            className="ca-panel anim-revelar"
          >
            <h4 className="ca-titulo">Avisos · {n > 0 ? `${n} por atender` : "nada por atender"}</h4>
            {/* Con más avisos de los que caben, la lista corre por dentro con su propia barra; la página de atrás no se mueve. */}
            <div className="ca-lista" tabIndex={0} aria-label="Lista de avisos">
              {visibles.length === 0 ? (
                <div className="ca-vacia">Nada pendiente. Lo que ya viste vuelve a salir si cambia.</div>
              ) : (
                visibles.map((a) => (
                  <div key={a.id} className="ca-aviso" data-nivel={a.nivel}>
                    <span className="ca-ic">{ICONO[a.nivel]}</span>
                    <div>
                      <b>
                        <span className="ca-etiqueta">{ETIQUETA[a.nivel]}</span>
                        {a.titulo}
                      </b>
                      <span className="ca-d">{a.texto}</span>
                    </div>
                    <Acciones aviso={a} alAccionar={accionar} alVisto={() => onVisto(a)} />
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
