import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { LadoDelClub, PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import { hoyDeLima } from "@/lib/hoy-servidor";
import "../estilos/entrada.css";
import "../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Crea tu cuenta", robots: { index: false, follow: false } };

/**
 * «Crear cuenta» («A · Mostrador», 2026-11-25): el formulario y, al lado, la tarjeta del Club que lleva el nombre de quien la crea apenas el formulario lo
 * sabe. Solo lo necesario (ADR-0438): correo con su código, nombre y contraseña, o Google; el documento y el celular, al separar.
 */
export default async function CrearCuenta() {
  const hoy = await hoyDeLima();
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <PantallaDeCuenta forma="crear" lado={<LadoDelClub desde={hoy.anio} />}>
        <FormularioRegistro />
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}
