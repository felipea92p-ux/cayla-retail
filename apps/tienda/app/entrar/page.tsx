import type { Metadata } from "next";
import { FormularioEntrar } from "@/components/cuenta/FormularioEntrar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";

export const metadata: Metadata = { title: "Entrar · CAYLA" };

// Como la portada: la franja lee la campaña de la base y la página se guarda 5 minutos. Con sesión, el proxy lleva a «Mi cuenta».
export const revalidate = 300;

export default function Entrar() {
  return (
    <MarcoCuenta enPagina="entrar">
      <div className="t-ancho t-angosto w-pagina-form">
        <FormularioEntrar />
      </div>
    </MarcoCuenta>
  );
}
