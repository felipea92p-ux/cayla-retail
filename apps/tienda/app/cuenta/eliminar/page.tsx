import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CuentaNoDisponible } from "@/components/cuenta/CuentaNoDisponible";
import { FormularioEliminarCuenta } from "@/components/cuenta/FormularioEliminarCuenta";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { antesDeEliminarEnBase } from "@/lib/mi-cuenta-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../../estilos/entrada.css";
import "../../estilos/mi-cuenta.css";
import "../../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Eliminar mi cuenta", robots: { index: false, follow: false } };

/**
 * «Eliminar mi cuenta» (Felipe 2026-10-15): borra la cuenta y sus datos de la ficha del Club (la anonimización de siempre; deja de ser
 * miembro). Con un pedido web en curso o un apartado abierto, todavía no: la página dice cuáles y qué hacer.
 */
export default async function EliminarMiCuenta() {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const [lectura, frena] =
    sesion.estado === "con_sesion" ? await Promise.all([leerMiCuentaEnBase(sesion.usuarioId), antesDeEliminarEnBase(sesion.usuarioId)]) : [null, null];
  if (lectura?.estado === "sin_cuenta") redirect("/cuenta");
  return (
    <MarcoCuenta conCuenta enPagina="cuenta">
      {/* La columna marfil de «Entrar» y «Crear cuenta» («A · Mostrador»; antes, la hoja con campos de línea: Felipe 2026-11-26). */}
      <PantallaDeCuenta forma="sola">
        {lectura?.estado === "cuenta" && frena?.estado === "ok" ? (
          <FormularioEliminarCuenta correo={lectura.cuenta.correo} frena={frena.frena} />
        ) : (
          <CuentaNoDisponible texto="No pudimos revisar tu cuenta ahora. Vuelve a intentarlo en unos minutos." volverA="/cuenta/eliminar" />
        )}
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}
