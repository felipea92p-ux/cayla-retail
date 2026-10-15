"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pedirAviso } from "@/app/acciones/club";
import { etiquetaBotonAvisame, mensajeAviso, textoAvisoAnotado, textoBotonAvisame } from "@/lib/club";
import { Icono } from "../Icono";
import { useAvisoBreve } from "./useAvisoBreve";
import "@/app/estilos/club.css";

/**
 * «Avísame cuando llegue la M» (maqueta v4, `vProducto`: el botón ancho que reemplaza a «Agregar a la bolsa» cuando la talla no
 * hay). Anota en la base que esta cuenta espera ESA prenda (modelo, color y talla) en esa tienda; sin tienda elegida («Todas»), en
 * cualquier tienda de la web. Ya anotado se queda apagado: «Te avisaremos cuando llegue». El aviso llega a «Mi cuenta ▸ Te avisamos
 * cuando llegue» (nunca por WhatsApp: el Club no manda mensajes personales, ADR-0288 G-5), y la tienda lo ve en Vitrina web ▸
 * Esperan una talla. Si mientras tanto llegó, la base no lo anota (`hay`): el aviso lo dice y la página se vuelve a leer, para que
 * la ficha ofrezca agregarla a la bolsa.
 *
 * Dónde va (lo pone la integración, actividad 4): en la ficha, en lugar del botón principal, cuando la talla elegida no hay en la
 * tienda elegida. `varianteId` es la prenda de ese color y esa talla; `sedeId`/`sedeNombre`, la tienda de «Ver lo que hay en» (o
 * `null`). `pedido` sale de `leerGuardadosEnBase(usuario).esperas.has(claveEspera(varianteId, sedeId))` (lib/club.ts).
 */
export function BotonAvisame({
  varianteId,
  talla,
  sedeId = null,
  sedeNombre = null,
  pedido = false,
}: {
  varianteId: string;
  talla: string;
  sedeId?: string | null;
  /** El nombre web de la tienda elegida («Trujillo»), para decir dónde. */
  sedeNombre?: string | null;
  /** Ya lo había pedido (la página lo sabe por `leerGuardadosEnBase`). */
  pedido?: boolean;
}) {
  const router = useRouter();
  const [anotado, setAnotado] = useState(pedido);
  const [deServidor, setDeServidor] = useState(pedido);
  if (deServidor !== pedido) {
    setDeServidor(pedido);
    setAnotado(pedido);
  }
  const [pendiente, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();
  const nombreSede = sedeId ? sedeNombre : null;

  function tocar() {
    if (pendiente || anotado) return;
    iniciar(async () => {
      const r = await pedirAviso(varianteId, sedeId);
      if (r.estado === "anotada") {
        setAnotado(true);
        mostrar(textoAvisoAnotado(talla, nombreSede), true);
        return;
      }
      mostrar(mensajeAviso(r.estado), false);
      // Llegó mientras la miraba: que la ficha se vuelva a leer y ofrezca agregarla.
      if (r.estado === "hay") router.refresh();
    });
  }

  return (
    <>
      {anotado ? (
        <button type="button" className="t-btn t-btn-ancho t-btn-sec c-avisame" disabled>
          <Icono nombre="check" />
          Te avisaremos cuando llegue
        </button>
      ) : (
        <button
          type="button"
          className="t-btn t-btn-ancho t-btn-sec c-avisame"
          onClick={tocar}
          disabled={pendiente}
          aria-busy={pendiente || undefined}
          aria-label={etiquetaBotonAvisame(talla, nombreSede)}
        >
          <Icono nombre="campana" />
          {textoBotonAvisame(talla)}
        </button>
      )}
      {aviso}
    </>
  );
}
