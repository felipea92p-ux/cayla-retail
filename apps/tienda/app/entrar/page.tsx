import type { Metadata } from "next";
import { FormularioEntrar } from "@/components/cuenta/FormularioEntrar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { LadoPrimeraVez, PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import "../estilos/entrada.css";
import "../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

/** «Entrar» («A · Mostrador», 2026-11-25): entrar a la izquierda y «¿Primera vez en CAYLA?» a la derecha; en el celular, uno debajo del otro. */
export default function Entrar() {
  return (
    <MarcoCuenta enPagina="entrar">
      <PantallaDeCuenta forma="entrar" lado={<LadoPrimeraVez />}>
        <FormularioEntrar />
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}
