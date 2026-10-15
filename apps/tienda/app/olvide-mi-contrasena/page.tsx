import type { Metadata } from "next";
import { FormularioOlvide } from "@/components/cuenta/FormularioOlvide";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";

export const metadata: Metadata = { title: "Olvidé mi contraseña · CAYLA" };

/** `?enlace=vencido`: vuelve de un enlace del correo que ya se usó o venció, y lo dice arriba. */
export default async function OlvideMiContrasena({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { enlace } = await searchParams;
  return (
    <MarcoCuenta>
      <div className="t-ancho t-angosto w-pagina-form">
        <FormularioOlvide enlaceVencido={enlace === "vencido"} />
      </div>
    </MarcoCuenta>
  );
}
