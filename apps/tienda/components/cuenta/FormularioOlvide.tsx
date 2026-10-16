"use client";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import Link from "next/link";
import { useState, useTransition } from "react";
import { clienteNavegador } from "@/lib/auth-navegador";
import { correoValido, MENSAJES, normalizarCorreo } from "@/lib/cuentas";
import { buzonDelCorreo } from "@/lib/panel-entrada";
import { Icono } from "../Icono";
import { usePasoDelPanel } from "./EntradaViva";

// «Olvidé mi contraseña» (maqueta, `vOlvide`): el correo, y después «Revisa tu correo». Dice LO MISMO exista o no una cuenta con
// ese correo (decisión de la maqueta): así nadie averigua desde aquí quién tiene cuenta. El enlace vence en 30 minutos y lleva a
// /nueva-contrasena. Se pide desde el navegador: el proyecto de clientes ve la ip de cada persona y le pone sus topes.
export function FormularioOlvide({ enlaceVencido = false }: { enlaceVencido?: boolean }) {
  const [correo, setCorreo] = useState("");
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  // El panel de al lado enciende el segundo paso («Abre el enlace que te llega») apenas sale el enlace.
  usePasoDelPanel(enviadoA ? 1 : null);

  function enviar() {
    if (!correoValido(correo) || enviando) return;
    setError("");
    const destino = normalizarCorreo(correo);
    iniciar(async () => {
      const cliente = clienteNavegador();
      if (!cliente) {
        setError(MENSAJES.olvideNoDisponible);
        return;
      }
      const { error: fallo } = await cliente.auth.resetPasswordForEmail(destino, { redirectTo: `${window.location.origin}/nueva-contrasena` });
      // Solo si el proyecto no contestó se dice que no se pudo. Cualquier otra respuesta (también «espera un momento», que solo
      // sale si la cuenta existe) lleva a la misma pantalla.
      if (fallo && isAuthRetryableFetchError(fallo)) {
        setError(MENSAJES.olvideNoDisponible);
        return;
      }
      setEnviadoA(destino);
    });
  }

  if (enviadoA) {
    const buzon = buzonDelCorreo(enviadoA);
    return (
      <div className="w-ficha w-ficha-centro">
        <span className="w-sobre">
          <Icono nombre="sobre" />
        </span>
        <div>
          <span className="t-ceja">Olvidé mi contraseña</span>
          <h1 className="w-titulo">
            Revisa <em>tu correo.</em>
          </h1>
        </div>
        <p className="w-texto-sec">
          Si hay una cuenta con <b className="w-correo">{enviadoA}</b>, te llega un enlace para crear una contraseña nueva. Vence en 30 minutos.
        </p>
        {/* Lo que sigue está en su correo: con un buzón conocido, un botón la lleva (aparte, sin perder esta página). */}
        {buzon && (
          <a className="t-btn t-btn-ancho" href={buzon.href} target="_blank" rel="noopener noreferrer">
            <Icono nombre="sobre" />
            Abrir {buzon.nombre}
          </a>
        )}
        {/* Lo que más se pregunta cuando el correo no llega (el código de «Crear cuenta» dice lo mismo). */}
        <p className="w-ayuda">Si en unos minutos no lo ves, revisa también tu carpeta de spam o de promociones.</p>
        <span className="w-res-acc w-acc-centro">
          <button
            type="button"
            className="w-enlace"
            onClick={() => {
              setEnviadoA(null);
              setCorreo("");
            }}
          >
            Usar otro correo
          </button>
          {/* Si mientras tanto se acordó de su contraseña, no tiene que buscar «Entrar» arriba. */}
          <Link className="w-enlace" href="/entrar">
            Volver a entrar
          </Link>
        </span>
      </div>
    );
  }

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <div>
        <span className="t-ceja">Olvidé mi contraseña</span>
        <h1 className="w-titulo">
          Te mandamos un enlace <em>a tu correo.</em>
        </h1>
        <p className="w-texto-sec">Escribe el correo con el que creaste tu cuenta.</p>
      </div>
      {/* Volvió de un enlace que ya no sirve: el porqué, en su nota (con el reloj), antes de la caja. */}
      {enlaceVencido && (
        <p className="en-aviso" role="status">
          <Icono nombre="reloj" />
          <span>{MENSAJES.enlaceVencido}</span>
        </p>
      )}
      <div className="w-campo">
        <label htmlFor="olvide-correo">Correo</label>
        <input
          id="olvide-correo"
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
          aria-describedby={error ? "olvide-error" : undefined}
        />
      </div>
      {error && (
        <div className="w-res" id="olvide-error" role="alert">
          <span className="w-res-error">{error}</span>
        </div>
      )}
      <button className="t-btn t-btn-ancho" type="submit" disabled={!correoValido(correo) || enviando} aria-busy={enviando || undefined}>
        {enviando ? "Enviando…" : "Enviarme el enlace"}
      </button>
      <Link className="w-enlace" href="/entrar">
        Volver a entrar
      </Link>
      {/* Quien ya no tiene ese correo no recibe el enlace: lo restablece una tienda (Felipe 2026-10-15). */}
      <p className="w-nota">
        ¿Ya no usas ese correo? En cualquier tienda CAYLA, con tu DNI, te ayudamos a cambiarlo. Si ya lo pediste en tienda,{" "}
        <Link className="w-enlace" href="/restablecer-acceso">
          escribe aquí tu código
        </Link>
        .
      </p>
    </form>
  );
}
