import type { Metadata } from "next";
import { FormularioEntrar } from "@/components/cuenta/FormularioEntrar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import "../estilos/entrada.css";
import "../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

/** «Entrar» («A · Mostrador», 2026-11-25): la foto a la izquierda y entrar a la derecha; «¿Primera vez en CAYLA? Crear cuenta», una línea bajo el formulario. */
export default function Entrar() {
  return (
    <MarcoCuenta enPagina="entrar">
      <PantallaDeCuenta forma="entrar" foto>
        <FormularioEntrar />
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}
