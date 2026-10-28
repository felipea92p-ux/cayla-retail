import type { Metadata } from "next";
import { FormularioRestablecerAcceso } from "@/components/cuenta/FormularioRestablecerAcceso";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { PanelDeAcceso, PantallaDeEntrada } from "@/components/cuenta/PanelDeEntrada";
import "../estilos/entrada.css";
import "../estilos/mi-cuenta.css";

export const metadata: Metadata = { title: "Restablecer mi acceso · CAYLA", robots: { index: false, follow: false } };

/**
 * «Restablecer mi acceso» (Felipe 2026-10-15): quien ya no podía entrar lo pidió en una tienda CAYLA (el ERP, ficha del cliente ▸
 * «Restablecer acceso a la tienda web») y le llegó un código a su correo nuevo. A esta página lleva el enlace de ese correo. Pública: no
 * hace falta sesión. Sin nada en la dirección (ni el correo ni el código: se escriben). La pantalla partida, con sus tres pasos: el de
 * la tienda ya está hecho.
 */
export default function RestablecerMiAcceso() {
  return (
    <MarcoCuenta>
      <PantallaDeEntrada alto="largo" panel={<PanelDeAcceso camino="restablecer" actual={1} />}>
        <FormularioRestablecerAcceso />
      </PantallaDeEntrada>
    </MarcoCuenta>
  );
}
