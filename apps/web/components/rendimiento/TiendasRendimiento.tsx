"use client";

import { useState, type ReactNode } from "react";
import type { SedeDeRendimiento } from "@/lib/rendimiento";
import { vistaDeUrl, type Vista } from "@/lib/rendimiento-meta-reglas";
import { ComparativoTiendas } from "./ComparativoTiendas";
import { PanelRendimiento } from "./PanelRendimiento";

/* ====================================================================
   La tienda elegida es estado del navegador (Felipe, 2026-10-03; auditoría de Rendimiento, cambio 3)

   Antes cada tarjeta era un enlace a `?sede=`: una navegación de Next, que para la espera global (ADR-0149) es una «carga» → el loader a
   pantalla completa y dos rondas de lecturas en cada cambio, para mostrar datos que ya estaban en memoria (el servidor lee TODAS las tiendas
   de una vez: `leerPantallaRendimiento`). Ahora cambiar de tienda es instantáneo, igual que Hoy · Semana · Mes: la URL se actualiza con
   `history.replaceState` (para compartirla o recargar en la misma tienda) pero no navega, no pide nada y no mueve el scroll.

   Los rankings los dibuja el servidor (uno por tienda, ya armados) y llegan aquí como piezas listas: este componente solo elige cuál se ve.
   Al cambiar de tienda la VISTA (Hoy · Semana · Mes) se conserva: es lo que la persona estaba mirando, no un dato de la tienda.
   ==================================================================== */

export function TiendasRendimiento({
  sedes,
  inicialId,
  sesionId,
  hoy,
  vistaInicial,
  personaCuentaId,
  esAdmin,
  rankings,
}: {
  sedes: SedeDeRendimiento[];
  inicialId: string;
  /** La tienda de la sesión de quien mira: lleva la marca «Tu sesión». */
  sesionId: string;
  hoy: string;
  vistaInicial: Vista;
  personaCuentaId: string | null;
  esAdmin: boolean;
  /** Los dos rankings del mes de cada tienda, ya dibujados por el servidor, por `ubicacionId`. */
  rankings: Record<string, ReactNode>;
}) {
  const [activaId, setActivaId] = useState(inicialId);
  // La vista que la persona tiene puesta: el panel la avisa al cambiarla y se conserva al cambiar de tienda.
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const activa = sedes.find((s) => s.ubicacionId === activaId) ?? sedes[0];

  function elegir(id: string) {
    if (id === activaId) return;
    setActivaId(id);
    // Solo la barra de direcciones (sin navegar), conservando el resto de los parámetros como `vista`.
    const url = new URL(window.location.href);
    url.searchParams.set("sede", id);
    const v = vistaDeUrl(url.searchParams.get("vista"));
    if (v === "hoy") url.searchParams.delete("vista");
    window.history.replaceState(null, "", url);
  }

  if (!activa) return null;
  return (
    <>
      {sedes.length > 1 && <ComparativoTiendas sedes={sedes} activaId={activa.ubicacionId} sesionId={sesionId} hoy={hoy} onElegir={elegir} />}

      <div id="panel-tienda" role={sedes.length > 1 ? "tabpanel" : undefined} aria-label={sedes.length > 1 ? activa.nombre : undefined} className="space-y-6">
        {activa.panelDisponible ? (
          <PanelRendimiento
            key={activa.ubicacionId}
            ubicacionId={activa.ubicacionId}
            nombre={activa.nombre}
            hoy={hoy}
            serie={activa.serie}
            detalle={activa.detalle}
            personas={activa.personas}
            historial={activa.historial}
            vistaInicial={vista}
            onVista={setVista}
            personaCuentaId={personaCuentaId}
            esAdmin={esAdmin}
          />
        ) : (
          <p className="nota-cayla">
            No se pudieron leer las metas de cada persona ahora. Lo demás de esta pantalla —los rankings del mes— sí está al día.
          </p>
        )}
        {rankings[activa.ubicacionId]}
      </div>
    </>
  );
}
