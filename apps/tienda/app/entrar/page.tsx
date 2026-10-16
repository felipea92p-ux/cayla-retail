import type { Metadata } from "next";
import { FormularioEntrar } from "@/components/cuenta/FormularioEntrar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDelClub, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import { anioLima } from "@/lib/portada";
import "../estilos/entrada.css";

export const metadata: Metadata = { title: "Entrar · CAYLA" };

// Como la portada: la franja lee la campaña de la base y la página se guarda 5 minutos. Con sesión, el proxy lleva a «Mi cuenta».
export const revalidate = 300;

/** «Entrar»: desde 960 px, la pantalla partida con el panel del Club a la izquierda; en el celular, el panel debajo del formulario. */
export default function Entrar() {
  return (
    <MarcoCuenta enPagina="entrar">
      <PantallaDeEntrada panel={<PanelDelClub desde={anioLima()} />}>
        <FormularioEntrar />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
