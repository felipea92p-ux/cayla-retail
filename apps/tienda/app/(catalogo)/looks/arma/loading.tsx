import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega «Arma el tuyo» desde la lista de looks (un segmento adentro): el arco del probador y su tira. Cambiar algo en el
// probador cambia la dirección, no el segmento: este esqueleto no tapa el probador mientras se usa.
export default function CargandoProbador() {
  return <EsqueletoDePagina forma="probador" />;
}
