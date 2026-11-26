import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import "../estilos/entrada.css";
import "../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Crea tu cuenta", robots: { index: false, follow: false } };

/**
 * «Crear cuenta» («A · Mostrador», 2026-11-25): la foto de campaña a la izquierda y el formulario a la derecha (desde el 2026-11-26; antes,
 * la tarjeta del Club con el nombre). Solo lo necesario (ADR-0438): correo con su código, nombre y contraseña, o Google; el documento y el celular, al separar.
 */
export default function CrearCuenta() {
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <PantallaDeCuenta forma="crear" foto>
        <FormularioRegistro />
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}
