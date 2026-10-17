"use client";

import { isAuthApiError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { anotarEntrada } from "@/app/acciones/entrada";
import { INICIO_CON_CUENTA } from "@/lib/sesion";
import { clienteNavegador } from "@/lib/auth-navegador";
import { MENSAJES, normalizarCorreo } from "@/lib/cuentas";
import { hrefConVolver, PARAMETRO_VOLVER, problemaAlEntrar, rutaParaVolver, type ProblemaAlEntrar } from "@/lib/entrada";
import { BotonGoogle } from "./BotonGoogle";
import { CajaClave } from "./CajaClave";

// «Entra a tu cuenta» (maqueta, `vEntrar`; el catálogo se ve sin entrar desde el 2026-10-17, ADR-0438: aquí entra quien quiere separar o
// guardar). También con Google (`BotonGoogle`, solo cuando el proveedor está encendido). Entra desde el navegador, contra el proyecto de inicio de sesión de los
// clientes: así ese proyecto ve la ip de cada persona y le pone sus topes a cada una. Con la sesión abierta, el servidor anota la
// entrada (entrar a la web cuenta como actividad del Club, `anotarEntrada`) y va al Inicio, o a la página que la persona quería ver
// (`?volver=`: la prenda que le mandaron, su pedido). Si su cuenta se cerró (su ficha se anonimizó: 3 años sin comprar ni entrar, o
// lo pidió en tienda), el servidor borra su usuario y lo dice aquí, sin dejarla entrar.
//
// El botón «Entrar» se toca siempre (2026-10-15): apagado no decía qué faltaba, y con el autocompletar de Chrome, que llena las cajas
// sin avisarle a la página hasta el primer toque, quedaba gris con todo escrito. Al tocarlo se leen las cajas como están (el
// formulario, no solo lo que la página alcanzó a ver) y, si falta algo, se dice bajo su caja y el cursor va ahí.

const ID = { correo: "entrar-correo", clave: "entrar-clave" } as const;

/** Lo que dice «Entrar» según el `?google=` con que vuelve la ruta de Google. Un motivo que no está aquí dice lo más general. */
const MENSAJES_GOOGLE: Record<string, string> = {
  cancelado: MENSAJES.googleCancelado,
  "no-disponible": MENSAJES.googleNoDisponible,
  "correo-repetido": MENSAJES.googleCorreoRepetido,
  "correo-de-otra-persona": MENSAJES.googleCorreoDeOtraPersona,
};

export function FormularioEntrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [problema, setProblema] = useState<ProblemaAlEntrar | null>(null);
  // La cuenta que se cerró: aquí al intentar entrar, o con `?aviso=cuenta-cerrada` cuando la sesión abierta lo descubrió sola.
  const [cerrada, setCerrada] = useState(false);
  // La página con cuenta que quería ver (`?volver=`), ya revisada: solo una de esta tienda.
  const [volver, setVolver] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    // La dirección solo la sabe el navegador (esta página se guarda en caché): leerla al iniciar el estado rompería la hidratación.
    const parametros = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el destino vive en la dirección, que solo existe en el navegador
    setVolver(rutaParaVolver(parametros.get(PARAMETRO_VOLVER)));
    // Google volvió con un problema (`app/auth/google/route.ts`): se dice con palabras y se limpia de la dirección.
    const google = parametros.get("google");
    if (google) {
      setError(MENSAJES_GOOGLE[google] ?? MENSAJES.googleNoDisponible);
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (parametros.get("aviso") !== "cuenta-cerrada") return;
    setCerrada(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("aviso");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  function enfocar(id: string) {
    // Después de pintar: el mensaje de abajo ya está y el lector de pantalla lo lee con la caja.
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  function entrar(formulario: HTMLFormElement) {
    if (enviando) return;
    // Lo que dicen las cajas ahora (el autocompletar pudo llenarlas sin avisar), no solo lo que la página vio escribir.
    const datos = new FormData(formulario);
    const correoEscrito = String(datos.get("correo") ?? correo);
    const claveEscrita = String(datos.get("clave") ?? clave);
    setCorreo(correoEscrito);
    setClave(claveEscrita);
    setError("");
    setCerrada(false);
    const falta = problemaAlEntrar(correoEscrito, claveEscrita);
    setProblema(falta);
    if (falta) {
      enfocar(ID[falta.campo]);
      return;
    }
    iniciar(async () => {
      const cliente = clienteNavegador();
      if (!cliente) {
        setError(MENSAJES.entrarNoDisponible);
        return;
      }
      const { error: fallo } = await cliente.auth.signInWithPassword({ email: normalizarCorreo(correoEscrito), password: claveEscrita });
      if (!fallo) {
        // Si el servidor no contesta, se entra igual: la entrada se vuelve a anotar en la primera página del día.
        const entrada = await anotarEntrada().catch(() => "sin_respuesta" as const);
        if (entrada === "cerrada") {
          setClave("");
          setCerrada(true);
          return;
        }
        router.replace(volver ?? INICIO_CON_CUENTA);
        router.refresh();
        return;
      }
      if (isAuthApiError(fallo) && fallo.code === "invalid_credentials") {
        setError(MENSAJES.entrarMal);
        // La contraseña se borra y el cursor la espera: lo más común es un error al escribirla.
        setClave("");
        enfocar(ID.clave);
      } else if (fallo.status === 429 || (isAuthApiError(fallo) && fallo.code === "over_request_rate_limit")) {
        setError(MENSAJES.entrarLimite);
      } else {
        // El proyecto de clientes no contestó (o contestó algo que no es de la persona): que lo intente en un rato.
        setError(MENSAJES.entrarNoDisponible);
      }
    });
  }

  const describe = (campo: "correo" | "clave") =>
    [problema?.campo === campo ? `${ID[campo]}-res` : null, error ? "entrar-error" : null].filter(Boolean).join(" ") || undefined;

  return (
    <form
      className="w-ficha"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        entrar(e.currentTarget);
      }}
    >
      <div>
        <span className="t-ceja">Tu cuenta</span>
        <h1 className="w-titulo">
          Entra a <em>tu cuenta.</em>
        </h1>
      </div>
      <BotonGoogle volver={volver} />
      <div className="w-campo" data-estado={problema?.campo === "correo" ? "error" : undefined}>
        <label htmlFor={ID.correo}>Correo</label>
        <input
          id={ID.correo}
          name="correo"
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
            if (problema?.campo === "correo") setProblema(null);
          }}
          aria-invalid={problema?.campo === "correo" || undefined}
          aria-describedby={describe("correo")}
        />
        {problema?.campo === "correo" && (
          <div className="w-res" id={`${ID.correo}-res`}>
            <span className="w-res-error">{problema.mensaje}</span>
          </div>
        )}
      </div>
      <div className="w-campo" data-estado={problema?.campo === "clave" ? "error" : undefined}>
        <label htmlFor={ID.clave}>Contraseña</label>
        <CajaClave
          id={ID.clave}
          name="clave"
          valor={clave}
          onCambio={(v) => {
            setClave(v);
            setError("");
            if (problema?.campo === "clave") setProblema(null);
          }}
          autoComplete="current-password"
          describedBy={describe("clave")}
          invalida={problema?.campo === "clave"}
        />
        {problema?.campo === "clave" && (
          <div className="w-res" id={`${ID.clave}-res`}>
            <span className="w-res-error">{problema.mensaje}</span>
          </div>
        )}
        {/* Bajo su caja y a la derecha, donde se busca (2026-10-16): antes iba debajo de «Entrar», en rojo, compitiendo con el botón. */}
        <Link className="en-olvide" href="/olvide-mi-contrasena">
          Olvidé mi contraseña
        </Link>
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
          <Link className="w-enlace" href={hrefConVolver("/crear-cuenta", volver)}>
            Crear una cuenta nueva
          </Link>
        </p>
      )}
      {/* El botón, apenas después de las cajas (antes iba al final, después de dos enlaces rojos que competían con él). */}
      <button className="t-btn t-btn-ancho" type="submit" disabled={enviando} aria-busy={enviando || undefined}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      {/* Quien llega sin cuenta (un enlace que le mandaron) ve el otro camino como un botón, no como un enlace perdido en una frase. La
          pregunta va en la raya que separa los dos caminos; lo que gana con el Club lo dice el panel de al lado (o de abajo). */}
      <div className="w-otro-camino">
        <p className="w-texto-sec">¿Primera vez en CAYLA?</p>
        <Link className="t-btn t-btn-sec t-btn-ancho" href={hrefConVolver("/crear-cuenta", volver)}>
          Crear mi cuenta
        </Link>
      </div>
    </form>
  );
}
