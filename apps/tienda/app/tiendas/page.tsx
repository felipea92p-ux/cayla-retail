import type { Metadata } from "next";
import { Anuncio } from "@/components/Anuncio";
import { Cabecera } from "@/components/Cabecera";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { Pie } from "@/components/Pie";
import { leerPortada } from "@/lib/portada-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import { anioLima, anuncios } from "@/lib/portada";
import "../estilos/tiendas.css";

// Nuestras tiendas (ADR-0408, actividad 6): la página del pie «Nuestras tiendas», sin cuenta. Lo que el ERP cambia en
// Configuración ▸ Tienda web aparece solo, como en la portada (la página se guarda 5 minutos); sin base, lo dice en una línea.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Nuestras tiendas · CAYLA",
  description: "Dónde recoger lo que separas en la web: la dirección, el horario y el WhatsApp de cada tienda CAYLA.",
};

export default async function Tiendas() {
  const [{ campana }, sedes] = await Promise.all([leerPortada(), leerSedes()]);
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera />
      <main className="t-pagina t-pagina-corta">
        <NuestrasTiendas sedes={sedes} enPagina />
        <Pie anio={anioLima()} />
      </main>
    </div>
  );
}
