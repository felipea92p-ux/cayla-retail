import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { hoyLima } from "@/lib/cuentas";
import { leerCasillaDeAvisos } from "@/lib/cuentas-servidor";

export const metadata: Metadata = { title: "Crea tu cuenta · CAYLA" };

// Como la portada: la franja lee la campaña de la base y la página se guarda 5 minutos. Con sesión, el proxy lleva a «Mi cuenta».
export const revalidate = 300;

export default async function CrearCuenta() {
  // El texto aprobado de la casilla de los avisos por WhatsApp (el mismo del cartel del Club). Si la base no lo da, no se ofrecen;
  // si cambió en estos 5 minutos, el servidor lo nota al mandar el código y muestra el nuevo.
  const casilla = await leerCasillaDeAvisos();
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <div className="t-ancho t-angosto w-pagina-form">
        {/* El día de Lima, para la regla de los 18 años en pantalla (el servidor la vuelve a revisar al crear). */}
        <FormularioRegistro hoy={hoyLima()} casilla={casilla} />
      </div>
    </MarcoCuenta>
  );
}
