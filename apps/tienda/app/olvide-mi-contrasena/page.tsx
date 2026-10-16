import type { Metadata } from "next";
import { FormularioOlvide } from "@/components/cuenta/FormularioOlvide";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDeAcceso, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import "../estilos/entrada.css";

export const metadata: Metadata = { title: "Olvidé mi contraseña · CAYLA" };

/**
 * `?enlace=vencido`: vuelve de un enlace del correo que ya se usó o venció, y lo dice arriba. La pantalla partida, con los tres pasos
 * para volver a entrar (el formulario enciende el segundo cuando manda el enlace).
 */
export default async function OlvideMiContrasena({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { enlace } = await searchParams;
  return (
    <MarcoCuenta>
      <PantallaDeEntrada panel={<PanelDeAcceso camino="olvide" actual={0} />}>
        <FormularioOlvide enlaceVencido={enlace === "vencido"} />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
