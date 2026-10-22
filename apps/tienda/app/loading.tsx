import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega una página que no tiene su propio `loading.tsx` (Nuestras tiendas, Entrar, Crear cuenta, «Cómo separar», Cambios y
// devoluciones, Privacidad, los Términos del Club, recuperar el acceso, Tu look): antes, al tocar un enlace a ellas, la pantalla se
// quedaba quieta hasta que llegaban (Felipe 2026-10-21: «todo cambio al presionar un botón tiene que dar la sensación de carga»). Es la
// red de todas: la forma de una lista que brilla bajo la cabecera de siempre. Las de más arriba tienen el suyo (el catálogo, la
// cuenta, la bolsa, las notificaciones, Recomendaciones) y mandan sobre este. Esta página arma su marco ella misma (`MarcoCuenta`), por
// eso el esqueleto pone su propia caja `.tienda`, como el de la cuenta.
export default function Cargando() {
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
