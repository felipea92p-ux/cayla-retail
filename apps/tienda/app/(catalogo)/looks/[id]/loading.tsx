import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega un look, desde la lista de looks (un segmento adentro: sin esto la lista se quedaba quieta hasta que llegaba): la ruta,
// la lámina grande y, al lado, sus prendas, el total y el botón. La franja de arriba ya la pone el marco del catálogo.
export default function CargandoLook() {
  return <EsqueletoDePagina forma="look" />;
}
