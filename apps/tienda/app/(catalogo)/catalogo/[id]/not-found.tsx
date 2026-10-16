import Link from "next/link";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";

/** Una prenda que ya no se ve en la web (la ocultaron, se descontinuó o el enlace está mal): lo dice y lleva a toda la ropa. */
export default async function PrendaQueNoEsta() {
  const catalogo = await leerCatalogo(null);
  return (
    <MarcoCatalogo prendas={catalogo?.prendas ?? []} sede={null}>
      <div className="t-ancho">
        <div className="t-vacio">
          <Icono nombre="tienda" />
          <h3>Esta prenda ya no está en la tienda</h3>
          <p>Puede que se haya agotado o que el enlace esté mal escrito. Mira lo que hay ahora.</p>
          <Link className="t-btn" href="/catalogo">
            Ver toda la ropa
          </Link>
        </div>
      </div>
    </MarcoCatalogo>
  );
}
