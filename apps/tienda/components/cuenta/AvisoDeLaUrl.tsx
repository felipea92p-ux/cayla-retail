"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MENSAJES } from "@/lib/cuentas";
import { Icono } from "../Icono";

// El aviso corto de abajo («Listo: …», maqueta `toastW`) después de una acción que cambia de página: la acción vuelve con
// `?aviso=<clave>` y aquí se dice en palabras. Se va solo (su animación dura 3,4 s); al terminar se borra de la dirección, así
// recargar no lo repite.
const AVISOS: Record<string, string> = {
  salir: "Saliste de tu cuenta.",
  // Cómo se confirma el Club al terminar de crear la cuenta (Felipe 2026-10-15), igual que al unirse en el cartel de la tienda.
  bienvenida: "¡Listo! Te damos la bienvenida al Club CAYLA.",
  unida: "Listo: tu cuenta quedó unida a tu ficha del Club CAYLA.",
  // Los avisos por WhatsApp no se activaron (su ficha tiene otro celular): «Mi cuenta» lo explica en una nota que se queda.
  "avisos-sin-activar": "Listo: tu cuenta quedó unida a tu ficha del Club CAYLA.",
  clave: "Listo: cambiaste tu contraseña.",
  "clave-igual": MENSAJES.claveIgual,
  "cuenta-creada": "Tu cuenta quedó creada. Entra con tu correo y tu contraseña.",
};

const DURACION_MS = 3600;

export function AvisoDeLaUrl() {
  const parametros = useSearchParams();
  const clave = parametros.get("aviso") ?? "";
  const texto = AVISOS[clave];

  useEffect(() => {
    if (!texto) return;
    const reloj = setTimeout(() => {
      // Solo se limpia la dirección, sin volver a pedir la página.
      const url = new URL(window.location.href);
      url.searchParams.delete("aviso");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }, DURACION_MS);
    return () => clearTimeout(reloj);
  }, [texto]);

  if (!texto) return null;
  return (
    <div key={clave} className="w-aviso" role="status">
      <Icono nombre="check" />
      <span>{texto}</span>
    </div>
  );
}
