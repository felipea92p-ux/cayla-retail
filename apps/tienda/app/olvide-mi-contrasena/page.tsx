import type { Metadata } from "next";
import { Suspense } from "react";
import { FormularioOlvide } from "@/components/cuenta/FormularioOlvide";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { LadoDeAcceso, PantallaDeCuenta } from "@/components/cuenta/PantallaDeCuenta";
import "../estilos/entrada.css";
import "../estilos/cuenta-mostrador.css";

export const metadata: Metadata = { title: "Olvidé mi contraseña", robots: { index: false, follow: false } };

/**
 * `?enlace=vencido`: vuelve de un enlace del correo que ya se usó o venció, y lo dice arriba. La pantalla marfil («A · Mostrador»), con los tres pasos
 * para volver a entrar (el formulario enciende el segundo cuando manda el enlace). La página sale armada por adelantado, igual para
 * todos; solo el aviso del enlace vencido espera a leer la dirección (ADR-0432).
 */
export default function OlvideMiContrasena({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <MarcoCuenta>
      <PantallaDeCuenta forma="acceso" lado={<LadoDeAcceso camino="olvide" actual={0} />}>
        <Suspense fallback={<FormularioOlvide enlaceVencido={false} />}>
          <ConEnlace searchParams={searchParams} />
        </Suspense>
      </PantallaDeCuenta>
    </MarcoCuenta>
  );
}

async function ConEnlace({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { enlace } = await searchParams;
  return <FormularioOlvide enlaceVencido={enlace === "vencido"} />;
}
