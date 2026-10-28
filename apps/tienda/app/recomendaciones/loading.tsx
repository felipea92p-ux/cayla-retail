import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega «Recomendaciones»: la franja de arriba y la cabecera que ya se veían, y la página con su título y su frase (son fijos),
// el formulario y, al lado, lo ya escrito, que brillan. Esta página arma su marco ella misma (`MarcoCuenta`), por eso el esqueleto pone
// su propia caja `.tienda`.
export default function CargandoRecomendaciones() {
  return (
    <>
      {/* Otra vista: el fundido al esqueleto. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeEspera />
      <div className="tienda">
      <Anuncio frases={[]} />
      <EsqueletoDePagina forma="recomendaciones" />
      </div>
    </>
  );
}
