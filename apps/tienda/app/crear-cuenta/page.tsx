import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDelClub, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import { hoyDeLima } from "@/lib/hoy-servidor";
import "../estilos/entrada.css";

export const metadata: Metadata = { title: "Crea tu cuenta · CAYLA" };

/**
 * «Crear cuenta»: la pantalla partida, con la tarjeta del Club del panel que lleva el nombre de quien la crea apenas el formulario lo
 * sabe. Solo lo necesario (ADR-0438): correo con su código, nombre y contraseña, o Google; el documento y el celular, al separar.
 */
export default async function CrearCuenta() {
  const hoy = await hoyDeLima();
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <PantallaDeEntrada alto="largo" ancho="ancho" panel={<PanelDelClub desde={hoy.anio} nombreVivo />}>
        <FormularioRegistro />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
