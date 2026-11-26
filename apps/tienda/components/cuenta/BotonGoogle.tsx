"use client";

import { useEffect, useState } from "react";
import { clienteNavegador } from "@/lib/auth-navegador";
import { TEXTOS_VERSION } from "@/lib/cuentas";
import { MENSAJES } from "@/lib/cuentas-mensajes";
import { PARAMETRO_VOLVER } from "@/lib/entrada";
import { PARAMETRO_ACEPTO } from "@/lib/google";
import { googleDisponible } from "@/lib/sesion";

// «Continuar con Google» (ADR-0438, Felipe 2026-10-17). Sirve para entrar y para crear la cuenta: si es la primera vez, la cuenta se crea
// sola con el nombre y el correo de Google (sin código: Google ya confirmó el correo), y no se pide nada más hasta que separe. Desde el
// navegador, contra el proyecto de clientes (que pone sus topes a la ip de cada persona); Google vuelve a `/auth/google`
// (`app/auth/google/route.ts`), que canjea el código y sigue a `volver`. No sale hasta que el proveedor esté encendido (`googleDisponible`).
// Con `aceptacion` («Crear cuenta», revisión legal 2026-11-18, H3): la casilla de aceptar es la ÚNICA del formulario, arriba de los dos
// caminos (Felipe 2026-11-25: antes había una para Google y otra para el correo, con el mismo texto), y el botón manda la versión aceptada
// en la vuelta (`?acepto=`). Sin marcarla no se va a Google: se dice aquí y el cursor va a la casilla. Sin ella («Entrar»), quien ya tiene cuenta entra;
// quien no, vuelve a «Crear cuenta» con `?google=acepta` y este mismo bloque le dice qué falta: ninguna cuenta nace sin aceptar.

/** La «G» de Google, en sus cuatro colores (la marca de Google no se tiñe con los tokens). */
function LogoGoogle() {
  return (
    <svg className="en-google-g" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.3a12 12 0 0 0 0 11l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 12 0 12 12 0 0 0 1.3 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

/** `abajo`: va después del formulario (en «Entrar»: primero el correo y «Entrar», y Google como otra manera, tras una raya «o»).
 *  `aceptacion`: crea la cuenta, así que exige la casilla de aceptar del formulario (`idCasilla`) antes de ir a Google. */
export function BotonGoogle({
  volver,
  texto = "Continuar con Google",
  abajo = false,
  aceptacion,
}: {
  volver: string | null;
  texto?: string;
  abajo?: boolean;
  aceptacion?: { acepta: boolean; idCasilla: string };
}) {
  const casilla = Boolean(aceptacion);
  const acepta = aceptacion?.acepta ?? false;
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Volvió de Google sin haber aceptado (`?google=acepta`, la ruta de Google): se dice aquí, junto a la casilla, y se limpia la dirección.
  useEffect(() => {
    if (!casilla) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("google") !== "acepta") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el aviso vive en la dirección, que solo existe en el navegador
    setError(MENSAJES.googleFaltaAceptar);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url);
  }, [casilla]);
  // Marcó la casilla después del aviso: el aviso ya no corre.
  const errorVisible = error === MENSAJES.googleFaltaAceptar && acepta ? null : error;
  if (!googleDisponible()) return null;

  async function ir() {
    if (yendo) return;
    if (casilla && !acepta) {
      setError(MENSAJES.googleFaltaAceptar);
      if (aceptacion) document.getElementById(aceptacion.idCasilla)?.focus();
      return;
    }
    const cliente = clienteNavegador();
    if (!cliente) {
      setError(MENSAJES.googleNoDisponible);
      return;
    }
    setError(null);
    setYendo(true);
    const destino = new URL("/auth/google", window.location.origin);
    if (volver) destino.searchParams.set(PARAMETRO_VOLVER, volver);
    if (casilla && acepta) destino.searchParams.set(PARAMETRO_ACEPTO, TEXTOS_VERSION);
    // Si todo sale bien, el navegador se va a Google y esta página termina aquí.
    const { error: fallo } = await cliente.auth.signInWithOAuth({ provider: "google", options: { redirectTo: destino.toString() } });
    if (fallo) {
      setYendo(false);
      setError(MENSAJES.googleNoDisponible);
    }
  }

  return (
    <div className="en-google">
      {abajo && (
        <p className="en-o" aria-hidden="true">
          <span>o</span>
        </p>
      )}
      <button type="button" className="t-btn t-btn-sec t-btn-ancho en-google-btn" onClick={ir} disabled={yendo} aria-busy={yendo || undefined}>
        <LogoGoogle />
        {yendo ? "Abriendo Google…" : texto}
      </button>
      {errorVisible && (
        <div className="w-res" role="alert">
          <span className="w-res-error">{errorVisible}</span>
        </div>
      )}
      {!abajo && (
        <p className="en-o" aria-hidden="true">
          <span>o con tu correo</span>
        </p>
      )}
    </div>
  );
}
