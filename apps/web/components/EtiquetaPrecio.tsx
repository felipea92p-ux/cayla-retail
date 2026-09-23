import Image from "next/image";
import { CodigoQR } from "@/components/CodigoQR";
import { esTallaUnica, fechaVigencia, precioEtiqueta, type EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";

/** 25 mm (Felipe, 2026-09-23). Más grande que los 18 mm verificados con la pistola Zebra el 2026-09-10: un módulo más
 *  grande se lee más fácil, nunca más difícil. El lado incluye la zona muda (`lib/qr.ts`). */
const LADO_QR_ETIQUETA_MM = 25;

/**
 * La etiqueta de precio impresa, diseño «D · Editorial, corregida» (ADR-0180). Las medidas viven en `globals.css`
 * (`.etiqueta-precio`) y son milímetros: esto es papel, no pantalla.
 *
 * Para la clienta: marca, en qué tallas viene el modelo con la suya marcada, prenda, color y precio. Con una campaña
 * vigente (paso 2), el precio de lista tachado, el que cobra la caja con su «−20 %» en negro, y el porqué: el nombre de
 * la campaña y hasta cuándo vale. Para la colaboradora: el código escrito (si la pistola falla se teclea), la fecha de
 * impresión (si conviven dos etiquetas de la misma prenda, la más nueva manda) y el QR que lee la caja.
 */
export function EtiquetaPrecio({ etiqueta: e, impreso }: { etiqueta: DatosEtiqueta; impreso: string }) {
  const unica = e.tallasDelModelo.length === 1 && esTallaUnica(e.tallasDelModelo[0]);
  const cobra = precioEtiqueta(e.campana ? e.precio - e.campana.descuento : e.precio);
  // «1,136.90» (8 caracteres) con su % no entra a tamaño completo en 53 mm: un punto menos de letra.
  const claseCobra = cobra.length >= 8 ? "etq-precio etq-precio-largo" : "etq-precio";
  return (
    <article className="etiqueta-precio" aria-label={`Etiqueta de precio de ${e.prenda}`}>
      <header className="etq-cab">
        {/* `unoptimized` + `eager`: el PNG original (la térmica no gana nada con WebP) y cargado aunque la hoja de
            impresión esté oculta — una imagen perezosa dentro de un `display:none` puede no llegar al papel. */}
        <Image src="/cayla-isotipo.png" alt="" width={223} height={150} unoptimized loading="eager" />
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
          <CodigoQR texto={e.codigo} ladoMm={LADO_QR_ETIQUETA_MM} />
        </div>
      </footer>
    </article>
  );
}
