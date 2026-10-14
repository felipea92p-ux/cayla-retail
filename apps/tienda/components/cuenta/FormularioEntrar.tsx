"use client";

import { isAuthApiError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clienteNavegador } from "@/lib/auth-navegador";
import { CLAVE_MINIMA, correoValido, MENSAJES, normalizarCorreo } from "@/lib/cuentas";
import { CajaClave } from "./CajaClave";

// «Entra para ver el catálogo» (maqueta, `vEntrar`). Entra desde el navegador, contra el proyecto de inicio de sesión de los
// clientes: así ese proyecto ve la ip de cada persona y le pone sus topes a cada una. Con la sesión abierta, va a «Mi cuenta».
export function FormularioEntrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  const listo = correoValido(correo) && clave.length >= CLAVE_MINIMA;

  function entrar() {
    if (!listo || enviando) return;
    setError("");
    iniciar(async () => {
      const cliente = clienteNavegador();
      if (!cliente) {
        setError(MENSAJES.entrarNoDisponible);
        return;
      }
      const { error: fallo } = await cliente.auth.signInWithPassword({ email: normalizarCorreo(correo), password: clave });
      if (!fallo) {
        router.replace("/cuenta");
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
