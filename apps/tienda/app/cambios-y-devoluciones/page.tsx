import type { Metadata } from "next";
import Link from "next/link";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { puntosDeCambios } from "@/lib/ayuda";
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
 * número: «mira el plazo en tu boleta». Desde la revisión 2026-10-15 la regla va partida en tres cosas que se leen de un vistazo (cuánto
 * tiempo, dónde, qué llevar; `puntosDeCambios`, que promete lo mismo que la frase de la ficha) y lleva a las tiendas, con su WhatsApp para
 * una duda: era un solo párrafo y la página parecía a medio hacer.
 */
export default async function CambiosYDevoluciones() {
  const [conCuenta, plazos] = await Promise.all([haySesion(), leerAyuda()]);
  const { plazo, donde, llevar } = puntosDeCambios(plazos);
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie>
      <div className="t-ancho t-angosto w-pagina-form">
        <article className="w-ficha w-pagina-ayuda">
          <div>
            <span className="t-ceja">Ayuda</span>
            <h1 className="w-titulo">
              Cambios <em>y devoluciones.</em>
            </h1>
            <p className="w-texto-sec">Lo que separas en la web se cambia o se devuelve igual que lo que compras en tienda.</p>
          </div>
          <div className="w-ayuda-notas">
            <NotaAyuda icono="reloj" {...plazo} />
            <NotaAyuda icono="tienda" {...donde}>
              <Link className="t-enlace w-ayuda-enlace" href="/tiendas">
                Ver nuestras tiendas y su WhatsApp
              </Link>
            </NotaAyuda>
            <NotaAyuda icono="ticket" {...llevar} />
          </div>
        </article>
      </div>
    </MarcoCuenta>
  );
}
