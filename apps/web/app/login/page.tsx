"use client";

import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { PanelVuelo } from "@/components/login/PanelVuelo";
import { saludoDelDia } from "@/lib/login-vuelo";
import { entradaEnCurso, iniciarEntrada, ponerNombreDelSaludo } from "@/lib/entrada-estado";
import { TOPE_DE_ESPERA } from "@/lib/login-entrada";
import { DESTINO_SI_NO_SE, MS_TOPE_DEL_ATERRIZAJE, destinoDeLaRespuesta } from "@/lib/login-aterrizaje";
import { cuentaParaSaludar } from "@/lib/login-saludo";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Boton } from "@/components/ui/campos";

const MENSAJES_ERROR: Record<string, string> = {
  sin_persona:
    // D-70: el mismo aviso cubre "nadie te dio de alta todavía" y "ya te dieron de alta, pero
    // falta que un líder la apruebe" — retail no distingue los dos casos acá para no revelar
    // el estado interno de un alta a quien todavía no puede entrar; en los dos casos el
    // siguiente paso es el mismo: hablar con un líder.
    "Tu cuenta existe pero todavía no puede entrar a retail. Pide a un Líder que te dé de alta o que apruebe tu acceso.",
  // ADR-0162: la cuenta de un APARATO (terminal de tienda) que un líder desactivó en Colaboradores ▸ Terminales.
  terminal_desactivada: "Esta terminal está desactivada. Pide a un Líder que la reactive en Colaboradores ▸ Terminales.",
};

const sinSuscripcion = () => () => {};

/** Quién acaba de entrar, para saludarla: la fila de la persona (o del aparato) y si es una terminal. Cualquier fallo es «no sé». */
async function leerCuentaParaSaludar(supabase: ReturnType<typeof createClient>) {
  try {
    const [resumen, miTerminal] = await Promise.all([supabase.rpc("fn_persona_actual_resumen"), supabase.rpc("fn_mi_terminal")]);
    return cuentaParaSaludar(resumen.data, miTerminal.data);
  } catch {
    return null;
  }
}

/** El resultado de `promesa` o null si pasan `ms` sin respuesta: el saludo no espera a la base más de lo que dura el vuelo. */
function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promesa, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * A qué pantalla entra la cuenta recién abierta: `/api/aterrizaje`, la misma regla del Inicio (`aterrizajeDe`). Cualquier fallo, o una respuesta
 * que no llega a tiempo, es «no sé»: el Inicio, el camino de siempre (`lib/login-aterrizaje.ts`).
 */
async function pedirAterrizaje(): Promise<string> {
  const leer = async () => {
    // `manual`: sin sesión o sin acceso la ruta responde con su redirección al login; seguirla sería bajar el login entero para nada.
    const res = await fetch("/api/aterrizaje", { cache: "no-store", redirect: "manual" });
    return res.ok ? destinoDeLaRespuesta(await res.json()) : DESTINO_SI_NO_SE;
  };
  try {
    return (await conTope(leer(), MS_TOPE_DEL_ATERRIZAJE)) ?? DESTINO_SI_NO_SE;
  } catch {
    return DESTINO_SI_NO_SE;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorInicial = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Desde que la sesión se abre hasta que la pantalla de destino reemplaza al login, el loader general cubre la espera (ADR-0149): preguntar a
  // dónde entrar es un GET a /api, que no lo abre solo. Si vuela el colibrí, el loader se aparta y el vuelo ocupa su lugar. Se suelta al irse el
  // login (la pantalla de destino ya está) o, si algo lo dejara aquí, al tope de la entrada: el botón vuelve a «Entrar» y se puede reintentar.
  const [entrando, setEntrando] = useState(false);
  useEsperando(entrando);
  useEffect(() => {
    if (!entrando) return;
    const tope = window.setTimeout(() => {
      setEntrando(false);
      setLoading(false);
    }, TOPE_DE_ESPERA);
    return () => window.clearTimeout(tope);
  }, [entrando]);
  // El saludo depende de la hora: lo pone el navegador (en el servidor no se sabe cuándo se abrirá la página).
  const saludo = useSyncExternalStore(sinSuscripcion, () => saludoDelDia(new Date()), () => null);
  // El motivo por el que te mandaron al login (sesión vencida, sin acceso)
  // viene por la URL: se avisa una vez al entrar.
  useEffect(() => {
    const texto = errorInicial ? MENSAJES_ERROR[errorInicial] : null;
    if (texto) avisar.aviso(texto);
  }, [errorInicial]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      avisar.error("Correo o contraseña incorrectos.", { enfocar: "login-email" });
      return;
    }
    // El botón sigue en «Entrando…» hasta que el login se va (no se inicia sesión dos veces) y el loader cubre la espera.
    setEntrando(true);
    // «El colibrí se abre» (Felipe 2026-10-13): el colibrí cruza al centro y se abre sobre la pantalla de destino mientras carga.
    // Si la persona pidió menos movimiento, o no hay colibrí a la vista, el login entra como siempre (con el loader).
    if (iniciarEntrada()) {
      // El saludo de la entrada («Bienvenido(a), Camila»): el nombre llega de la base enseguida, con la sesión recién abierta. Si tarda o falla, el saludo va sin nombre.
      const id = entradaEnCurso()?.id;
      if (id !== undefined) {
        void conTope(leerCuentaParaSaludar(supabase), 4000).then((cuenta) => {
          if (cuenta) ponerNombreDelSaludo(id, cuenta.nombre, cuenta.terminal);
        });
      }
    }
    // UNA navegación, directo a la pantalla de la cuenta (Felipe 2026-10-13: «se ve el inicio»). Antes se navegaba a `/` y el Inicio
    // redirigía, y Next pintaba `/` —la app con «Inicio» marcado— antes del destino. Con el colibrí, la pantalla de destino carga mientras
    // vuela pero no se muestra hasta que su velo tapa todo (`EsperaAlVelo`): solo se ve por la ventana. Sin `router.refresh()`: el destino
    // ya se pide con la sesión abierta, y el refresco era otro viaje a `/` que demoraba la entrada. `replace`: «atrás» no vuelve a un login
    // del que ya se salió.
    router.replace(await pedirAterrizaje());
  }

  // «El vuelo» (Felipe 2026-10-13): la marca a la izquierda y el formulario a la derecha; en el celular, solo el formulario.
  return (
    <div className="login-pagina">
      <PanelVuelo />

      <main className="login-lado">
        <form onSubmit={onSubmit} className="login-form">
          <div className="login-marca-chica">
            <IsotipoCayla className="h-12 w-auto" />
            <p className="font-display mt-4 text-3xl text-tinta" style={{ letterSpacing: "0.24em" }}>
              CAYLA
            </p>
            {/* Dice de qué sistema es (Dynamic es otro) — nunca reemplaza a "CAYLA", solo se agrega debajo. */}
            <p className="label-cayla text-[11px] text-taupe-profundo" style={{ letterSpacing: "0.2em" }}>
              Retail
            </p>
          </div>

          <p className="login-saludo" data-listo={saludo ? "" : undefined}>
            {saludo ?? "\u00a0"}
          </p>
          <h1 className="login-titulo">Entrar</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-tinta/65">
            Con el correo que te dio tu líder, o el de la terminal de tu tienda.
          </p>

          <div className="mt-8 space-y-5">
            <div className="campo space-y-2">
              <label htmlFor="login-email" className="campo-etiqueta">
                Correo
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="caja-campo-input"
              />
            </div>

            <div className="campo space-y-2">
              <label htmlFor="login-clave" className="campo-etiqueta">
                Contraseña
              </label>
              {/* La caja del sistema (ADR-0358, ronda 6), con el ojo adentro. */}
              <div className="caja-cayla caja-campo">
                <input
                  id="login-clave"
                  type={mostrarPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="self-stretch py-0"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="-mr-1 shrink-0 text-tinta/65 transition-colors hover:text-rojo"
                >
                  {mostrarPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.6 5.2A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a15.5 15.5 0 01-3.2 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 004.4-1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <Boton peso="primario" cargando={loading} textoCargando="Entrando…"
              type="submit"
              disabled={loading}
              className="mt-2 w-full"
            >
              Entrar
            </Boton>
          </div>
        </form>

        <p className="login-pie text-[12.5px] text-tinta/65">¿Olvidaste tu contraseña? Avísale a tu líder.</p>
      </main>
    </div>
  );
}
