import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega la constancia de una hoja del Libro de Reclamaciones (ADR-0679): la franja y la cabecera que ya se veían y una lista que
// brilla, como el pedido recién separado.
export default function CargandoHoja() {
  return (
    <>
      {/* Otra vista: el fundido al esqueleto. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeEspera />
      <div className="tienda">
        <Anuncio frases={[]} />
        <EsqueletoDePagina forma="lista" />
      </div>
    </>
  );
}
