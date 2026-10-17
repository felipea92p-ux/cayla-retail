import type { Metadata } from "next";
import { FormularioEntrar } from "@/components/cuenta/FormularioEntrar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDelClub, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import { anioActual } from "@/lib/hoy-servidor";
import "../estilos/entrada.css";

export const metadata: Metadata = { title: "Entrar · CAYLA" };

/** «Entrar»: desde 960 px, la pantalla partida con el panel del Club a la izquierda; en el celular, el panel debajo del formulario. */
export default async function Entrar() {
  const anio = await anioActual();
  return (
    <MarcoCuenta enPagina="entrar">
      <PantallaDeEntrada panel={<PanelDelClub desde={anio} />}>
        <FormularioEntrar />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
