import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llegan «Mis pedidos» desde «Mi perfil» (un segmento adentro: sin esto «Mi perfil» se quedaba quieto hasta que llegaban): la
// franja y la cabecera que ya se veían y una lista que brilla. Esta página arma su marco ella misma (`MarcoCuenta`).
export default function CargandoPedidos() {
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
