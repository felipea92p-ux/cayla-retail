import type { Metadata } from "next";
import { FormularioRegistro } from "@/components/cuenta/FormularioRegistro";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDelClub, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import { leerCasillaDeAvisosGuardada } from "@/lib/cuentas-servidor";
import { hoyDeLima } from "@/lib/hoy-servidor";
import "../estilos/entrada.css";

export const metadata: Metadata = { title: "Crea tu cuenta · CAYLA" };

/**
 * «Crear cuenta»: la pantalla partida, con la tarjeta del Club del panel que lleva el nombre de quien la crea apenas el formulario lo
 * sabe (con DNI, el del padrón a medias; con carné o pasaporte, el que escribe).
 */
export default async function CrearCuenta() {
  // El texto aprobado de la casilla de los avisos por WhatsApp (el mismo del cartel del Club). Si la base no lo da, no se ofrecen;
  // si cambió en estos 5 minutos, el servidor lo nota al mandar el código y muestra el nuevo.
  const casilla = await leerCasillaDeAvisosGuardada();
  const hoy = await hoyDeLima();
  return (
    <MarcoCuenta enPagina="crear-cuenta">
      <PantallaDeEntrada alto="largo" ancho="ancho" panel={<PanelDelClub desde={hoy.anio} nombreVivo />}>
        {/* El día de Lima, para la regla de los 18 años en pantalla (el servidor la vuelve a revisar al crear). */}
        <FormularioRegistro hoy={hoy} casilla={casilla} />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
