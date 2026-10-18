"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MENSAJES } from "@/lib/cuentas-mensajes";
import { Icono } from "../Icono";

// El aviso corto de abajo («Listo: …», maqueta `toastW`) después de una acción que cambia de página: la acción vuelve con
// `?aviso=<clave>` y aquí se dice en palabras. Se va solo (su animación dura 3,4 s); al terminar se borra de la dirección, así
// recargar no lo repite.
const AVISOS: Record<string, string> = {
  salir: "Saliste de tu cuenta.",
  // Cómo se confirma el Club al terminar de crear la cuenta (Felipe 2026-10-15), igual que al unirse en el cartel de la tienda.
  bienvenida: "¡Listo! Te damos la bienvenida al Club CAYLA.",
  // Solo quien ya era miembro (se unió en el cartel antes de que existiera la página): sin la palabra «ficha», que nadie conoce
  // (Felipe 2026-10-16). Quien solo tenía una ficha de caja recibe la bienvenida de arriba.
  unida: "¡Listo! Ya eras del Club CAYLA: tu código y tus beneficios ya están en tu cuenta.",
  // Los avisos por WhatsApp no se activaron (en la tienda tiene anotado otro celular): «Mi cuenta» lo explica en una nota que se queda.
  "avisos-sin-activar": "¡Listo! Tu cuenta del Club CAYLA quedó creada.",
  clave: "Listo: cambiaste tu contraseña.",
  "clave-igual": MENSAJES.claveIgual,
  "cuenta-creada": "Tu cuenta quedó creada. Entra con tu correo y tu contraseña.",
  // Crear la cuenta o entrar con Google por primera vez (ADR-0438): ya puede separar; el Club empieza cuando complete sus datos.
  "cuenta-lista": "¡Listo! Tu cuenta está creada.",
  // «Mi cuenta» (Felipe 2026-10-15): cambiar el correo, restablecer el acceso pedido en tienda y eliminar la cuenta.
  correo: "Listo: ahora entras con tu correo nuevo.",
  "acceso-restablecido": "Listo: recuperaste tu cuenta. Desde ahora entras con tu correo nuevo.",
  "acceso-restablecido-entra": "Listo: tu correo nuevo y tu contraseña quedaron. Entra con ellos.",
  "acceso-sin-clave": "Tu correo nuevo quedó confirmado. Pide aquí el enlace para crear tu contraseña.",
  "cuenta-eliminada": "Listo: eliminamos tu cuenta y tus datos.",
};

const DURACION_MS = 3600;

export function AvisoDeLaUrl() {
  const parametros = useSearchParams();
  const clave = parametros.get("aviso") ?? "";
  // Solo las claves de la lista: con `?aviso=__proto__` (o `constructor`) una búsqueda suelta devolvía lo heredado de todo objeto y la
  // página se caía al dibujarlo.
  const texto = Object.hasOwn(AVISOS, clave) ? AVISOS[clave] : undefined;

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
