"use client";

import { useFormStatus } from "react-dom";
import { Icono } from "../Icono";

/**
 * «Cerrar sesión»: el botón de un `<form action={salir}>`, el mismo en el menú de la persona y en «Tu cuenta» de «Mi perfil» (una sola
 * forma de decirlo). Dice «Cerrando sesión…» y se apaga mientras espera, para que un segundo toque no mande otra salida.
 */
export function BotonCerrarSesion({ className, conIcono = false }: { className: string; conIcono?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      {conIcono && <Icono nombre="flecha" />}
      {pending ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
