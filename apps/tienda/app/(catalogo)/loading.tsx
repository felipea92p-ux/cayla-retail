import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { leerPortada } from "@/lib/portada-servidor";

// Mientras llega una página del catálogo (Inicio, Catálogo, una ficha, Looks…), al instante: la forma de la página que viene, que sale
// de la dirección (`formaDeLaRuta`): el Inicio con su héroe, la lista con su título, la ficha con su foto y sus datos. El héroe lleva la
// campaña de verdad: es la misma lectura guardada de la franja (`leerPortada`, que se arma por adelantado). La franja de arriba ya la pone
// el marco del catálogo (`layout.tsx`).
export default async function CargandoCatalogo() {
  const { campana } = await leerPortada();
  return <EsqueletoDePagina campana={campana} />;
}
