import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { hoyLima } from "@/lib/cuentas";

export const metadata: Metadata = { title: "Crea tu cuenta · CAYLA" };

// Como la portada: la franja lee la campaña de la base y la página se guarda 5 minutos. Con sesión, el proxy lleva a «Mi cuenta».
export const revalidate = 300;

export default function CrearCuenta() {
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <div className="t-ancho t-angosto w-pagina-form">
        {/* El día de Lima, para la regla de los 18 años en pantalla (el servidor la vuelve a revisar al crear). */}
        <FormularioRegistro hoy={hoyLima()} />
      </div>
    </MarcoCuenta>
  );
}
