import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega «Mi perfil» o una de sus páginas (sus pedidos, el correo, eliminar la cuenta): la franja de arriba vacía (su alto, para
// que nada salte al llegar), la cabecera de siempre y, según la dirección, el saludo con sus cuadros («Mi perfil») o una lista que brilla.
// Esta página arma su marco ella misma (`MarcoCuenta`), por eso el esqueleto pone su propia caja `.tienda`.
export default function CargandoCuenta() {
  return (
    <div className="tienda">
      <Anuncio frases={[]} />
      <EsqueletoDePagina />
    </div>
  );
}
