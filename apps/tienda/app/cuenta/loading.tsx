import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega «Mi perfil» o una de sus páginas (sus pedidos, el correo, eliminar la cuenta): la franja de arriba y la cabecera que ya
// se veían y, según la dirección, el saludo con sus cuadros («Mi perfil») o una lista que brilla. Al pasar de «Mi perfil» a sus pedidos
// (un segmento adentro), el esqueleto es el de `pedidos/loading.tsx`.
// Esta página arma su marco ella misma (`MarcoCuenta`), por eso el esqueleto pone su propia caja `.tienda`.
export default function CargandoCuenta() {
  return (
    <>
      {/* Otra vista: el fundido al esqueleto. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeEspera />
      <div className="tienda">
      <Anuncio frases={[]} />
      <EsqueletoDePagina />
      </div>
    </>
  );
}
