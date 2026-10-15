import type { Metadata } from "next";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { hrefDelInicio } from "@/lib/inicio";
import { claveDeSede } from "@/lib/sede-elegida";
import { haySesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/tiendas.css";
// «Ver solo lo que hay aquí» (`.t-tienda-ver`) vive con el Inicio, que es donde se estrenó.
import "../estilos/inicio.css";

// Nuestras tiendas (ADR-0408, actividad 6): la página del pie «Nuestras tiendas», con y sin cuenta. Sin cuenta, la cabecera de la portada;
// con cuenta, la de la tienda (el menú, los favoritos, «Mi cuenta» y la bolsa) y, en cada tienda, «Ver solo lo que hay aquí», que lleva al
// Inicio con esa tienda elegida (maqueta v4, `seccionTiendas` con cuenta). Se arma en cada visita porque la cabecera depende de la sesión
// (antes se guardaba 5 minutos): lo que el ERP cambia en Configuración ▸ Tienda web se ve al recargar; sin base, lo dice en una línea.

export const metadata: Metadata = {
  title: "Nuestras tiendas · CAYLA",
  description: "Dónde recoger lo que separas en la web: la dirección, el horario y el WhatsApp de cada tienda CAYLA.",
};

export default async function Tiendas() {
  const [conCuenta, sedes] = await Promise.all([haySesion(), leerSedes()]);
  const ver = conCuenta
    ? Object.fromEntries(sedes.map((s) => [s.id, { href: hrefDelInicio(claveDeSede(s.nombre)), actual: false }]))
    : undefined;
  return (
    <MarcoCuenta conCuenta={conCuenta} conPie corta>
      <NuestrasTiendas sedes={sedes} enPagina ver={ver} />
    </MarcoCuenta>
  );
}
