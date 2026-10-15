import type { Metadata } from "next";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { textoCambios } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { haySesion } from "@/lib/sesion-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Cambios y devoluciones · CAYLA",
  description: "Lo que separas en la web se cambia o se devuelve igual que en tienda, en cualquier tienda CAYLA.",
};

/**
 * «Cambios y devoluciones» (ADR-0408, actividad 5; maqueta v4, `vCambios`): igual que en tienda, con el MISMO plazo que imprime la
 * boleta (`fn_dias_plazo_cambio`, leído por `retail.tienda_ayuda()`): la web y la boleta nunca dicen dos números distintos. Sin base, sin
 * número: «el plazo va impreso en tu boleta».
 */
export default async function CambiosYDevoluciones() {
  const [conCuenta, plazos] = await Promise.all([haySesion(), leerAyuda()]);
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-pagina-ayuda">
          <h1 className="w-titulo">
            Cambios <em>y devoluciones.</em>
          </h1>
          <p className="w-texto">{textoCambios(plazos)}</p>
        </article>
      </div>
    </MarcoCuenta>
  );
}
