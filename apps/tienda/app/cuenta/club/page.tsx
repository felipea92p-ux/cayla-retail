import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CuentaNoDisponible } from "@/components/cuenta/CuentaNoDisponible";
import { FormularioUnirseAlClub } from "@/components/cuenta/FormularioUnirseAlClub";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { leerCasillaDeAvisos, leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { PARAMETRO_VOLVER, rutaParaVolver } from "@/lib/entrada";
import { hoyDeLima } from "@/lib/hoy-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../../estilos/entrada.css";
import "../../estilos/mi-cuenta.css";

export const metadata: Metadata = { title: "Unirme al Club · CAYLA", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * «Completa tus datos y entra al Club» (ADR-0438, Felipe 2026-10-17): la cuenta se crea con lo mínimo y el Club empieza cuando la persona
 * da su documento y su celular. La bolsa lleva aquí al tocar «Separar» sin ser del Club (`?volver=/bolsa`); «Mi perfil» también, para
 * quien quiere unirse antes. Quien ya es del Club vuelve a donde estaba: aquí no hay nada que hacer.
 */
export default async function UnirseAlClub({ searchParams }: Props) {
  const sp = await searchParams;
  const volver = rutaParaVolver(typeof sp[PARAMETRO_VOLVER] === "string" ? sp[PARAMETRO_VOLVER] : null);
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const lectura = sesion.estado === "con_sesion" ? await leerMiCuentaEnBase(sesion.usuarioId) : null;
  if (lectura?.estado === "sin_cuenta") redirect("/cuenta");
  if (lectura?.estado === "cuenta" && lectura.cuenta.esDelClub) redirect(volver ?? "/cuenta");
  const [casilla, hoy] = await Promise.all([leerCasillaDeAvisos(), hoyDeLima()]);
  return (
    <MarcoCuenta conCuenta enPagina="cuenta">
      <div className="t-ancho t-angosto w-pagina-form en-form en-sola">
        {lectura?.estado === "cuenta" ? (
          <FormularioUnirseAlClub hoy={hoy} casilla={casilla} nombre={lectura.cuenta.nombreCorto} />
        ) : (
          <CuentaNoDisponible texto="No pudimos cargar tu cuenta ahora. Vuelve a intentarlo en unos minutos." volverA="/cuenta/club" />
        )}
      </div>
    </MarcoCuenta>
  );
}
