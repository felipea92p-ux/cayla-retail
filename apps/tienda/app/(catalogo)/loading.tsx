import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega una página del catálogo (Inicio, Catálogo, una ficha, Looks…), al instante: la grilla que brilla o, si lo que viene es
// la ficha de una prenda (tocada desde el Inicio, un look o el buscador), su foto y sus datos (la forma sale de la dirección). La franja
// de arriba ya la pone el marco del catálogo (`layout.tsx`).
export default function CargandoCatalogo() {
  return <EsqueletoDePagina />;
}
