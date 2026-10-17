import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega el pedido recién separado (desde la bolsa, un segmento adentro): la franja y la cabecera que ya se veían y una lista
// que brilla.
export default function CargandoSeparado() {
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
