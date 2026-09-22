import { EsperaPantalla } from "@/components/ui/Espera";

// Suspense boundary automática de Next.js alrededor de cada page.tsx bajo (app) — sin esto, el árbol
// completo (layout + página) se renderizaba como una sola unidad síncrona: el navegador no recibía ni
// un byte de HTML hasta que TODOS los awaits (persona, sedes, catálogo, movimientos...) terminaban.
//
// Mientras este fallback está montado la pantalla destino NO está lista: `EsperaPantalla` enciende el
// loader general (ADR-0149), a pantalla completa y por encima del menú. Acá no se dibuja nada propio:
// una pantalla con esqueleto (compras/, recibir/…) hace lo mismo y deja su silueta detrás del velo.
export default function Loading() {
  return (
    <>
      <EsperaPantalla />
      <div className="min-h-[40vh]" aria-busy="true" />
    </>
  );
}
