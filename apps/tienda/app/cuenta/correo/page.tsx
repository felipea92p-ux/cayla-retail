import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CuentaNoDisponible } from "@/components/cuenta/CuentaNoDisponible";
import { FormularioCorreoNuevo } from "@/components/cuenta/FormularioCorreoNuevo";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../../estilos/entrada.css";
import "../../estilos/mi-cuenta.css";

export const metadata: Metadata = { title: "Cambiar mi correo · CAYLA", robots: { index: false, follow: false } };

// Todavía no se arma por adelantado (ADR-0432, fase 3): lee la cuenta antes de pintar nada. Sale de aquí cuando su cáscara esté lista.
export const instant = false;

/**
 * «Cambiar mi correo» (Felipe 2026-10-15): el correo con que entra cambia recién cuando escribe el código que le llega al correo NUEVO
 * (y al de antes le llega un aviso). Pide su contraseña. La lógica, en `app/acciones/mi-cuenta.ts`; la forma, la de «Crear cuenta».
 */
export default async function CambiarMiCorreo() {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const lectura = sesion.estado === "con_sesion" ? await leerMiCuentaEnBase(sesion.usuarioId) : null;
  if (lectura?.estado === "sin_cuenta") redirect("/cuenta");
  return (
    <MarcoCuenta conCuenta enPagina="cuenta">
      <div className="t-ancho t-angosto w-pagina-form en-form en-sola">
        {lectura?.estado === "cuenta" ? (
          <FormularioCorreoNuevo correoActual={lectura.cuenta.correo} />
        ) : (
          <CuentaNoDisponible texto="No pudimos cargar tu cuenta ahora. Vuelve a intentarlo en unos minutos." volverA="/cuenta/correo" />
        )}
      </div>
    </MarcoCuenta>
  );
}
