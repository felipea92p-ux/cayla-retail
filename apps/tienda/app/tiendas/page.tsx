import type { Metadata } from "next";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { SegunSesion } from "@/components/cuenta/SegunSesion";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { hrefDelInicio } from "@/lib/inicio";
import { claveDeSede } from "@/lib/sede-elegida";
import { leerSedes } from "@/lib/tiendas-servidor";

// Nuestras tiendas (ADR-0408, actividad 6): la página del pie «Nuestras tiendas», con y sin cuenta. Sin cuenta, la cabecera de la portada;
// con cuenta, la de la tienda (el menú, los favoritos, «Mi perfil» y la bolsa) y, en cada tienda, «Ver solo lo que hay aquí», que lleva al
// Inicio con esa tienda elegida (maqueta v4, `seccionTiendas` con cuenta). Sale armada por adelantado, igual para todos, y lo que cambia
// con la cuenta (la cabecera, el pie y esos enlaces) llega por detrás (`SegunSesion`, ADR-0432): lo que el ERP cambia en Configuración ▸
// Tienda web se ve en un minuto; sin base, lo dice y deja volver a intentar. Desde la revisión «a nivel mundial» (2026-10-16) lleva el título grande de las páginas de ayuda y las tarjetas parejas con
// cualquier cantidad de tiendas (sus estilos los trae `NuestrasTiendas`).

export const metadata: Metadata = {
  title: "Nuestras tiendas · CAYLA",
  description: "Dónde recoger lo que separas en la web: la dirección, el horario, el WhatsApp y cómo llegar a cada tienda CAYLA.",
};

export default async function Tiendas() {
  const sedes = await leerSedes();
  const ver = Object.fromEntries(sedes.map((s) => [s.id, { href: hrefDelInicio(claveDeSede(s.nombre)), actual: false }]));
  return (
    <MarcoCuenta segunSesion conPie>
      <SegunSesion visitante={<NuestrasTiendas sedes={sedes} enPagina />} conCuenta={<NuestrasTiendas sedes={sedes} enPagina ver={ver} />} />
    </MarcoCuenta>
  );
}
