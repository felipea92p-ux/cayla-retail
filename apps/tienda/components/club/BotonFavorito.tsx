"use client";

import { useState, useTransition } from "react";
import { guardarFavorito } from "@/app/acciones/club";
import { MENSAJES_CLUB, mensajeFavorito } from "@/lib/club";
import { Icono } from "../Icono";
import { useGuardados } from "./Guardados";
import { useAvisoBreve } from "./useAvisoBreve";
import "@/app/estilos/club.css";

/**
 * El corazón de favoritos (maqueta v4: `.t-corazon` en la tarjeta y `.t-fav-grande` en la ficha). Guarda el MODELO en «Mi cuenta ▸
 * Favoritos» y en «Tus favoritos» (`/catalogo?lista=favoritos`). El corazón cambia apenas se toca y, si la base dice que no (el
 * modelo ya no se ve, el tope, sin conexión), vuelve a como estaba y el aviso de abajo dice por qué. Manda lo que se ve (guardar o
 * quitar), nunca «alternar»: un doble toque deja lo mismo que uno. Mientras la base contesta, otro toque no hace nada.
 *
 * Dónde va:
 *   · `forma="tarjeta"`: en la foto de `TarjetaPrenda` (`.t-card-media`), arriba a la derecha.
 *   · `forma="ficha"`: en la fila del botón principal de la ficha, a la derecha de «Agregar a la bolsa» / «Avísame».
 * Si guardado o no lo sabe solo: lo lee de `ProveedorGuardados` (el marco del catálogo), y al guardarse lo anota ahí para que los
 * demás corazones del mismo modelo cambien con él. Fuera del catálogo («Mi cuenta») se lo dice quien lo pone (`guardado`).
 */
export function BotonFavorito({
  productoId,
  nombre,
  guardado,
  forma = "tarjeta",
}: {
  productoId: string;
  /** El nombre del modelo, para el lector de pantalla («Guardar en favoritos: Blusa Emma»). */
  nombre: string;
  /** Si ya está guardado; sin él, lo dice `ProveedorGuardados` (y, fuera de él, no guardado). */
  guardado?: boolean;
  forma?: "tarjeta" | "ficha";
}) {
  const guardados = useGuardados();
  const segun = guardado ?? guardados?.esFavorito(productoId) ?? false;
  const [activo, setActivo] = useState(segun);
  // Lo que trae el servidor (o lo que otro corazón del mismo modelo anotó) manda (sin un efecto: se ajusta al dibujar).
  const [deServidor, setDeServidor] = useState(segun);
  if (deServidor !== segun) {
    setDeServidor(segun);
    setActivo(segun);
  }
  // Cada vez que se guarda, el corazón late una vez (la `key` lo vuelve a montar).
  const [latidos, setLatidos] = useState(0);
  const [pendiente, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();

  function tocar() {
    if (pendiente) return;
    const nuevo = !activo;
    setActivo(nuevo);
    if (nuevo) setLatidos((n) => n + 1);
    iniciar(async () => {
      const estado = await guardarFavorito(productoId, nuevo);
      const problema = mensajeFavorito(estado);
      if (problema) {
        setActivo(!nuevo);
        mostrar(problema, false);
        return;
      }
      guardados?.marcar(productoId, nuevo);
      if (estado === "guardado") mostrar(MENSAJES_CLUB.favoritoGuardado, true);
    });
  }

  const accion = activo ? "Quitar de favoritos" : "Guardar en favoritos";
  return (
    <>
      <button
        type="button"
        className={forma === "ficha" ? "c-corazon-grande" : "c-corazon"}
        aria-pressed={activo}
        aria-busy={pendiente || undefined}
        aria-label={forma === "tarjeta" ? `${accion}: ${nombre}` : accion}
        title={accion}
        onClick={tocar}
      >
        <span key={latidos} className={latidos > 0 ? "c-late" : "c-ic"}>
          <Icono nombre="corazon" />
        </span>
      </button>
      {aviso}
    </>
  );
}
