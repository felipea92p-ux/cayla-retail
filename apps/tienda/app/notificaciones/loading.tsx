import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llegan «Tus notificaciones» desde la campanita («Ver todas»): la franja y la cabecera que ya se veían y una lista que brilla.
// Esta página arma su marco ella misma (`MarcoCuenta`); sin este archivo, el build la pre-renderiza y falla (Cache Components).
export default function CargandoNotificaciones() {
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
