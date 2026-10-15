import type { Metadata } from "next";
import Link from "next/link";
import { FormularioClaveNueva } from "@/components/cuenta/FormularioClaveNueva";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";

// La dirección trae el código de un solo uso del correo: que no la guarde ningún buscador.
export const metadata: Metadata = { title: "Crea tu contraseña nueva · CAYLA", robots: { index: false, follow: false } };

/**
 * A donde lleva el enlace de «Olvidé mi contraseña» (`?token_hash=…&type=recovery`, plantilla
 * `apps/tienda/supabase/plantillas/recuperar.html`). Abrirla no gasta el código: se canjea al guardar la contraseña nueva.
 */
export default async function NuevaContrasena({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token_hash: codigo, type: tipo } = await searchParams;
  const valido = typeof codigo === "string" && tipo === "recovery" && /^[A-Za-z0-9_-]{10,200}$/.test(codigo);
  return (
    <MarcoCuenta>
      <div className="t-ancho t-angosto w-pagina-form">
        {valido ? (
          <FormularioClaveNueva codigo={codigo} />
        ) : (
          <div className="w-ficha w-ficha-centro">
            <span className="w-sobre">
              <Icono nombre="sobre" />
            </span>
            <h1 className="w-titulo">Abre el enlace de tu correo</h1>
            <p className="w-texto-sec">Para crear una contraseña nueva, toca el enlace que te mandamos. Si ya no lo tienes o venció, pide otro.</p>
            <Link className="t-btn t-btn-ancho" href="/olvide-mi-contrasena">
              Pedir un enlace
            </Link>
          </div>
        )}
      </div>
    </MarcoCuenta>
  );
}
