import { Anuncio } from "@/components/Anuncio";
import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega «Recomendaciones»: la franja de arriba vacía (su alto, para que nada salte al llegar), la cabecera de siempre y una
// lista que brilla. Esta página arma su marco ella misma (`MarcoCuenta`), por eso el esqueleto pone su propia caja `.tienda`.
export default function CargandoRecomendaciones() {
  return (
    <div className="tienda">
      <Anuncio frases={[]} />
      <EsqueletoDePagina forma="lista" />
    </div>
  );
}
