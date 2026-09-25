import { CodigoQR } from "@/components/CodigoQR";
import { esTallaUnica, fechaVigencia, precioEtiqueta, type EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";

/** El QR, lo más grande que entra en 40,1 × 62 mm: 19 mm con o sin campaña (el lado incluye la zona muda, `lib/qr.ts`).
 *  Lo limita el ancho: el código de 16 caracteres tiene que caber ENTERO a su lado (con 22 mm salía «CMS-0011-NAR…»), y
 *  con campaña también el alto (el «−20 %» y el motivo encima). Supera los 18 mm verificados con la pistola Zebra el
 *  2026-09-10: 7,7 puntos de la Brother por módulo, el mínimo práctico son 4 (ADR-0180, «Legibilidad en la térmica»). */
const LADO_QR_MM = 19;

/**
 * La etiqueta de precio impresa: 40,1 × 62 mm, para el cartón de 5 × 8 cm (ADR-0180). Diseño «D · Editorial», arreglo
 * «QR abajo». Las medidas viven en `globals.css` (`.etiqueta-precio`) y son milímetros: esto es papel, no pantalla.
 *
 * Para la clienta: marca, en qué tallas viene el modelo con la suya marcada, prenda, color y precio. Con una campaña
 * vigente (paso 2), el precio de lista tachado, el que cobra la caja con su «−20 %» en negro, y el porqué: el nombre de
 * la campaña y hasta cuándo vale. Para la colaboradora: el código escrito (si la pistola falla se teclea), la fecha de
 * impresión (si conviven dos etiquetas de la misma prenda, la más nueva manda) y el QR que lee la caja.
 */
export function EtiquetaPrecio({ etiqueta: e, impreso }: { etiqueta: DatosEtiqueta; impreso: string }) {
  const unica = e.tallasDelModelo.length === 1 && esTallaUnica(e.tallasDelModelo[0]);
  const cobra = precioEtiqueta(e.campana ? e.precio - e.campana.descuento : e.precio);
  // «1,136.90» (8 caracteres) con su % no entra a tamaño completo en 34 mm: un punto menos de letra.
  const claseCobra = cobra.length >= 8 ? "etq-precio etq-precio-largo" : "etq-precio";
  return (
    <article className={e.campana ? "etiqueta-precio etq-con-campana" : "etiqueta-precio"} aria-label={`Etiqueta de precio de ${e.prenda}`}>
      <header className="etq-cab">
        {/* El colibrí en vector (calcado de /cayla-isotipo.png, 223 × 150): el PNG de 223 px, ennegrecido con filtro,
            salía serruchado en la Brother (Felipe, 2026-09-25). En vector la térmica lo dibuja nítido a su resolución.
            Trazo 9 de 223 en 6,2 mm = 0,25 mm (3 puntos): con 7 quedaba en 2,3, bajo el mínimo de globals.css. */}
        <svg viewBox="0 0 223 150" aria-hidden fill="none" stroke="#000" strokeWidth={9} strokeLinejoin="round">
          <path d="M3,6 C45,14 95,28 118,50 C134,64 136,96 124,112 C110,130 80,138 47,146 L68,102" />
          <path d="M3,6 C10,40 40,70 70,80 C85,85 100,87 112,87" />
          <path d="M104,40 C102,22 118,6 140,5 C155,4 165,10 172,16 L220,12" />
          <path d="M172,16 C156,22 144,38 134,62" />
        </svg>
        <b>CAYLA</b>
      </header>

      {e.tallasDelModelo.length > 0 && (
        <>
          <p className="etq-rot">{unica ? "Talla" : e.tallasDelModelo.length === 1 ? "Talla del modelo" : "Tallas del modelo"}</p>
          {/* Desde 8 tallas (XXS…XXXL, 24…38) la fila baja un punto de letra para caber en 53 mm sin pegarse. */}
          <div className={unica ? "etq-tallas etq-unica" : e.tallasDelModelo.length >= 8 ? "etq-tallas etq-muchas" : "etq-tallas"}>
            {unica ? (
              <span className="etq-si">Talla única</span>
            ) : (
              e.tallasDelModelo.map((t) => (
                <span key={t} className={t === e.talla ? "etq-si" : undefined}>
                  {t}
                </span>
              ))
            )}
          </div>
        </>
      )}

      <p className="etq-prenda">{e.prenda}</p>
      {e.color && <p className="etq-color">{e.color}</p>}
      {e.campana ? (
        <>
          <p className="etq-antes">
            <s>S/ {precioEtiqueta(e.precio)}</s>
          </p>
          <div className="etq-ahora">
            {/* El mismo descuento que cobra la caja (bajado al .90, ADR-0182): el papel nunca dice otro precio. */}
            <p className={claseCobra}>
              <small>S/</small>
              {cobra}
            </p>
            <span className="etq-pct">−{e.campana.pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%</span>
          </div>
          <div className="etq-motivo">
            <b>{e.campana.nombre}</b>
            {e.campana.hasta && <span>Precio válido hasta el {fechaVigencia(e.campana.hasta)}</span>}
          </div>
        </>
      ) : (
        <p className={claseCobra}>
          <small>S/</small>
          {cobra}
        </p>
      )}

      <footer className="etq-pie">
        <div className="etq-datos">
          <span className="etq-cod">{e.codigo}</span>
          <small>Impreso {impreso}</small>
          <small>cayla.pe</small>
        </div>
        <div className="etq-qr">
          <CodigoQR texto={e.codigo} ladoMm={LADO_QR_MM} />
        </div>
      </footer>
    </article>
  );
}
