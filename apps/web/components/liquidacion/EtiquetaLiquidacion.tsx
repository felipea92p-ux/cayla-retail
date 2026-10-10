import { CodigoQR } from "@/components/CodigoQR";
import { soles } from "@/lib/liquidacion-reglas";

/** El mismo QR que la etiqueta de precio: 19 mm, leído por la pistola Zebra (ADR-0180). */
const LADO_QR_MM = 19;

/**
 * La etiqueta de una pieza de liquidación (ADR-0371): el mismo papel de 40,1 × 62 mm que la de precio, con CAYLA arriba, la franja
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
        {/* El colibrí en vector, igual que la etiqueta de precio (EtiquetaPrecio.tsx). */}
        <svg viewBox="0 0 223 150" aria-hidden fill="none" stroke="#000" strokeWidth={9} strokeLinejoin="round">
          <path d="M3,6 C45,14 95,28 118,50 C134,64 136,96 124,112 C110,130 80,138 47,146 L68,102" />
          <path d="M3,6 C10,40 40,70 70,80 C85,85 100,87 112,87" />
          <path d="M104,40 C102,22 118,6 140,5 C155,4 165,10 172,16 L220,12" />
          <path d="M172,16 C156,22 144,38 134,62" />
        </svg>
        <b>CAYLA</b>
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
          <small>cayla.pe</small>
        </div>
        <div className="etq-qr">
          <CodigoQR texto={codigo} ladoMm={LADO_QR_MM} />
        </div>
      </footer>
    </article>
  );
}
