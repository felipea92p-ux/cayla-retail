import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";
import { MarcaDeEspera } from "@/components/Vistas";

// Mientras llega la bolsa: la franja de arriba y la cabecera que ya se veían (`Anuncio`, `CabeceraConCuenta deEspera`), y la bolsa con
// tantas filas como decía la cabecera, su título y su resumen; vacía, lo que dice vacía. Esta página arma su marco ella misma
// (`MarcoCuenta`), por eso el esqueleto pone su propia caja `.tienda`. El pedido separado tiene su esqueleto propio (una lista).
export default function CargandoBolsa() {
  return (
    <>
      {/* Otra vista: el fundido al esqueleto. Antes de la caja, sin elementos encima (components/Vistas.tsx). */}
      <MarcaDeEspera />
      <div className="tienda">
      <Anuncio frases={[]} />
      <EsqueletoDePagina forma="bolsa" />
      </div>
    </>
  );
}
