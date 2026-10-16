import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoAyuda } from "@/components/ayuda/EncabezadoAyuda";
import { NotaAyuda } from "@/components/ayuda/NotaAyuda";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { puntosDeCambios } from "@/lib/ayuda";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/ayuda.css";

export const metadata: Metadata = {
  title: "Cambios y devoluciones · CAYLA",
  description: "Lo que separas en la web se cambia o se devuelve igual que en tienda, en cualquier tienda CAYLA.",
};

/**
 * «Cambios y devoluciones» (ADR-0408, actividad 5; maqueta v4, `vCambios`): igual que en tienda, con el MISMO plazo que imprime la
 * boleta (`fn_dias_plazo_cambio`, leído por `retail.tienda_ayuda()`): la web y la boleta nunca dicen dos números distintos. Sin base, sin
 * número: «mira el plazo en tu boleta». La regla va en tres puntos que se leen de un vistazo (cuánto tiempo, dónde, qué llevar;
 * `puntosDeCambios`, que promete lo mismo que la frase de la ficha). Revisión «a nivel mundial» (2026-10-16): el título grande, los tres
 * puntos en fila y, debajo, las tiendas mismas, con su WhatsApp para una duda y «Cómo llegar» (antes había que ir a otra página a
 * buscarlas). Sin tiendas (o sin base), el punto «dónde» lleva a /tiendas, como antes.
 */
export default async function CambiosYDevoluciones() {
  const [plazos, sedes] = await Promise.all([leerAyuda(), leerSedes()]);
  const { plazo, donde, llevar } = puntosDeCambios(plazos);
  const conTiendas = sedes.length > 0;
  return (
    <MarcoCuenta segunSesion conPie>
      <div className="t-ancho ay-pagina">
        <EncabezadoAyuda
          ceja="Ayuda"
          titulo={
            <>
              Cambios <em>y devoluciones.</em>
            </>
          }
          bajada="Lo que separas en la web se cambia o se devuelve igual que lo que compras en tienda."
        />
        <div className="ay-puntos">
          <NotaAyuda icono="reloj" nivel="h2" {...plazo} />
          <NotaAyuda icono="tienda" nivel="h2" {...donde}>
            <Link className="ay-enlace" href={conTiendas ? "#nuestras-tiendas" : "/tiendas"}>
              Ver nuestras tiendas y su WhatsApp <Icono nombre="flecha" />
            </Link>
          </NotaAyuda>
          <NotaAyuda icono="ticket" nivel="h2" {...llevar} />
        </div>
      </div>
      {conTiendas && <NuestrasTiendas sedes={sedes} ceja="Cambia tu prenda en la que te quede cerca" reintentar="/cambios-y-devoluciones" />}
    </MarcoCuenta>
  );
}
