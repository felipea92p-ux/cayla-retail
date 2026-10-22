"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * El botón de un `<form action={accionDelServidor}>` que dice que está trabajando (Felipe 2026-10-21: «todo botón que presiono tiene que dar
 * la sensación de carga»). Un formulario de servidor no pasa por `useTransition`, así que sin esto la persona tocaba «Quitar» o la tienda
 * de recojo y la pantalla se quedaba quieta hasta que la acción terminaba. Mientras espera: se apagan todos los botones del formulario (un
 * segundo toque no manda otra vez la acción) y el tocado marca `aria-busy` (los estilos de `.t-btn`, `.w-quitar` y `.w-opcion` lo muestran)
 * y, si se le dio, cambia su texto (`textoPendiente`, «Quitando…»). En un formulario con varios botones (las tiendas de recojo), solo el
 * que se tocó dice que trabaja: se reconoce por su `name` y su `value`.
 */
export function BotonDeFormulario({
  textoPendiente,
  children,
  disabled,
  ...resto
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { textoPendiente?: string }) {
  const { pending, data } = useFormStatus();
  const tocado = pending && (!resto.name || data?.get(resto.name) === String(resto.value ?? ""));
  return (
    <button {...resto} type="submit" disabled={disabled || pending} aria-busy={tocado || undefined}>
      {tocado && textoPendiente ? textoPendiente : children}
    </button>
  );
}
