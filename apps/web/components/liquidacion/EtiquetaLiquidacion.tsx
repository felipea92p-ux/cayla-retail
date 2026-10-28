import { CodigoQR } from "@/components/CodigoQR";
import { LogoCayla } from "@/components/ui/LogoCayla";
import { soles } from "@/lib/liquidacion-reglas";
import { WEB_DE_LA_ETIQUETA } from "@/lib/etiqueta-precio-reglas";

/** El mismo QR que la etiqueta de precio: 19 mm, leído por la pistola Zebra (ADR-0180). */
const LADO_QR_MM = 19;

/**
 * La etiqueta de una pieza de liquidación (ADR-0379): el mismo papel de 40,1 × 62 mm que la de precio, con CAYLA arriba, la franja
 * «LIQUIDACIÓN», la categoría, el precio y, al pie, el código escrito y el QR que lee la caja. Cada cambio de precio imprime una
 * nueva con otro código: la vieja ya no se cobra. Lo dice al pie («Venta final»): no tiene cambio ni devolución.
 */
export function EtiquetaLiquidacion({
  codigo,
  categoria,
  descripcion = null,
  precio,
  impreso,
}: {
  codigo: string;
  categoria: string;
  /** Lo que la reconoce («Blusa beige, manga globo»), si se escribió: va bajo la categoría. */
  descripcion?: string | null;
  precio: number;
  impreso: string;
}) {
  const cifra = soles(precio);
  return (
    <article data-papel className="etiqueta-precio" aria-label={`Etiqueta de liquidación ${codigo}`}>
      <header className="etq-cab">
        {/* El logo oficial en negro, igual que la etiqueta de precio (EtiquetaPrecio.tsx). */}
        <LogoCayla tinta="negro" className="etq-logo" />
        <span className="sr-only">CAYLA</span>
      </header>
      <p className="etq-liq-banda">LIQUIDACIÓN</p>
      <p className="etq-liq-categoria">{categoria}</p>
      {descripcion && <p className="etq-liq-descripcion">{descripcion}</p>}
      <p className="etq-liq-final">Venta final · sin cambio ni devolución</p>
      <p className={cifra.length >= 8 ? "etq-precio etq-precio-largo" : "etq-precio"}>
        <small>S/</small>
        {cifra}
      </p>
      <div className="etq-liq-empuje" aria-hidden />
      <footer className="etq-pie">
        <div className="etq-datos">
          <span className="etq-cod">{codigo}</span>
          <small>Impreso {impreso}</small>
          <small className="etq-web">{WEB_DE_LA_ETIQUETA}</small>
        </div>
        <div className="etq-qr">
          <CodigoQR texto={codigo} ladoMm={LADO_QR_MM} />
        </div>
      </footer>
    </article>
  );
}
