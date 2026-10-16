import type { Metadata } from "next";
import Link from "next/link";
import { FormularioClaveNueva } from "@/components/cuenta/FormularioClaveNueva";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDeAcceso, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import { Icono } from "@/components/Icono";
import "../estilos/entrada.css";

// La dirección trae el código de un solo uso del correo: que no la guarde ningún buscador.
export const metadata: Metadata = { title: "Crea tu contraseña nueva · CAYLA", robots: { index: false, follow: false } };

/**
 * A donde lleva el enlace de «Olvidé mi contraseña» (`?token_hash=…&type=recovery`, plantilla
 * `apps/tienda/supabase/plantillas/recuperar.html`). Abrirla no gasta el código: se canjea al guardar la contraseña nueva. El panel de
 * al lado dice en qué paso va: con el enlace, el último; sin él, abrir el enlace.
 */
export default async function NuevaContrasena({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token_hash: codigo, type: tipo } = await searchParams;
  const valido = typeof codigo === "string" && tipo === "recovery" && /^[A-Za-z0-9_-]{10,200}$/.test(codigo);
  return (
    <MarcoCuenta>
      <PantallaDeEntrada panel={<PanelDeAcceso camino="olvide" actual={valido ? 2 : 1} />}>
        {valido ? (
          <FormularioClaveNueva codigo={codigo} />
        ) : (
          <div className="w-ficha w-ficha-centro">
            <span className="w-sobre">
              <Icono nombre="sobre" />
            </span>
            <div>
              <span className="t-ceja">Contraseña nueva</span>
              <h1 className="w-titulo">
                Abre el enlace <em>de tu correo.</em>
              </h1>
            </div>
            <p className="w-texto-sec">Para crear una contraseña nueva, toca el enlace que te mandamos. Si ya no lo tienes o venció, pide otro.</p>
            <Link className="t-btn t-btn-ancho" href="/olvide-mi-contrasena">
              Pedir un enlace
            </Link>
          </div>
        )}
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
