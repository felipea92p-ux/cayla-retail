"use client";

import { isAuthApiError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { anotarEntrada } from "@/app/acciones/entrada";
import { INICIO_CON_CUENTA } from "@/lib/sesion";
import { clienteNavegador } from "@/lib/auth-navegador";
import { CLAVE_MINIMA, correoValido, MENSAJES, normalizarCorreo } from "@/lib/cuentas";
import { CajaClave } from "./CajaClave";

// «Entra para ver el catálogo» (maqueta, `vEntrar`). Entra desde el navegador, contra el proyecto de inicio de sesión de los
// clientes: así ese proyecto ve la ip de cada persona y le pone sus topes a cada una. Con la sesión abierta, el servidor anota la
// entrada (entrar a la web cuenta como actividad del Club, `anotarEntrada`) y va al Inicio. Si su cuenta se cerró (su ficha se
// anonimizó: 3 años sin comprar ni entrar, o lo pidió en tienda), el servidor borra su usuario y lo dice aquí, sin dejarla entrar.
export function FormularioEntrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  // La cuenta que se cerró: aquí al intentar entrar, o con `?aviso=cuenta-cerrada` cuando la sesión abierta lo descubrió sola.
  const [cerrada, setCerrada] = useState(false);
  const [enviando, iniciar] = useTransition();
  const listo = correoValido(correo) && clave.length >= CLAVE_MINIMA;

  useEffect(() => {
    // La dirección solo la sabe el navegador (esta página se guarda en caché): leerla al iniciar el estado rompería la hidratación.
    if (new URLSearchParams(window.location.search).get("aviso") !== "cuenta-cerrada") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la marca vive en la dirección, que solo existe en el navegador
    setCerrada(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("aviso");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  function entrar() {
    if (!listo || enviando) return;
    setError("");
    setCerrada(false);
    iniciar(async () => {
      const cliente = clienteNavegador();
      if (!cliente) {
        setError(MENSAJES.entrarNoDisponible);
        return;
      }
      const { error: fallo } = await cliente.auth.signInWithPassword({ email: normalizarCorreo(correo), password: clave });
      if (!fallo) {
        // Si el servidor no contesta, se entra igual: la entrada se vuelve a anotar en la primera página del día.
        const entrada = await anotarEntrada().catch(() => "sin_respuesta" as const);
        if (entrada === "cerrada") {
          setClave("");
          setCerrada(true);
          return;
        }
        router.replace(INICIO_CON_CUENTA);
        router.refresh();
        return;
      }
      if (isAuthApiError(fallo) && fallo.code === "invalid_credentials") {
        setError(MENSAJES.entrarMal);
        setClave("");
      } else if (fallo.status === 429 || (isAuthApiError(fallo) && fallo.code === "over_request_rate_limit")) {
        setError(MENSAJES.entrarLimite);
      } else {
        // El proyecto de clientes no contestó (o contestó algo que no es de la persona): que lo intente en un rato.
        setError(MENSAJES.entrarNoDisponible);
      }
    });
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        entrar();
      }}
    >
      <div>
        <span className="t-ceja">Tu cuenta</span>
        <h1 className="w-titulo">
          Entra para ver <em>el catálogo.</em>
        </h1>
      </div>
      <div className="w-campo">
        <label htmlFor="entrar-correo">Correo</label>
        <input
          id="entrar-correo"
          className="w-caja"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={correo}
          onChange={(e) => {
            setCorreo(e.target.value);
            setError("");
          }}
          aria-describedby={error ? "entrar-error" : undefined}
        />
      </div>
      <div className="w-campo">
        <label htmlFor="entrar-clave">Contraseña</label>
        <CajaClave
          id="entrar-clave"
          valor={clave}
          onCambio={(v) => {
            setClave(v);
            setError("");
          }}
          autoComplete="current-password"
          describedBy={error ? "entrar-error" : undefined}
        />
      </div>
      {error && (
        <div className="w-res" id="entrar-error" role="alert">
          <span className="w-res-error">{error}</span>
        </div>
      )}
      {cerrada && (
        // No es un error de ella: es lo que dicen la Política de privacidad (6) y los Términos del Club (7). Se queda a la vista.
        <p className="w-nota" role="status">
          {MENSAJES.cuentaCerrada}{" "}
          <Link className="w-enlace" href="/crear-cuenta">
            Crear una cuenta nueva
          </Link>
        </p>
      )}
      <Link className="w-enlace w-enlace-izq" href="/olvide-mi-contrasena">
        Olvidé mi contraseña
      </Link>
      <p className="w-texto-sec">
        ¿Primera vez?{" "}
        <Link className="w-enlace" href="/crear-cuenta">
          Crea tu cuenta
        </Link>
      </p>
      <div className="w-pie-form">
        <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || enviando} aria-busy={enviando || undefined}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </form>
  );
}
