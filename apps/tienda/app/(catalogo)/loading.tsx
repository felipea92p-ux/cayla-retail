import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega una página del catálogo (Inicio, Catálogo, una ficha, Looks…): la grilla que brilla, al instante. La franja de arriba
// ya la pone el marco del catálogo (`layout.tsx`).
export default function CargandoCatalogo() {
  return <EsqueletoDePagina forma="grilla" />;
}
