import { QRCodeSVG } from "qrcode.react";
import type { FormatoGuia, GuiaTraslado } from "@/lib/traslados-guia-reglas";

/**
 * El papel de la guía (ADR-0242 D-3): el mismo dibujo en la vista previa y en la impresora, en la térmica de 80 mm o en A4
 * (`app/estilos/traslados-guia.css`). Solo pintura: todo lo que dice sale de `guiaDelTraslado`, que no trae ni una cantidad.
 * `urlQr` llega `null` mientras el navegador no dice su dirección (al pintar en el servidor): queda el hueco del QR, del mismo tamaño.
 */
export function HojaGuia({ guia, formato, urlQr }: { guia: GuiaTraslado; formato: FormatoGuia; urlQr: string | null }) {
  return (
    <article className="guia-traslado papel-fijo" data-formato={formato} aria-label={`Guía de la caja Nº ${guia.numero}`}>
      <header className="gt-cab">
        <p className="gt-marca">CAYLA</p>
        <p className="gt-titulo">Guía de traslado</p>
        <p className="gt-numero">Nº {guia.numero}</p>
      </header>
      <dl className="gt-datos">
        <div>
          <dt>De</dt>
          <dd>{guia.de}</dd>
        </div>
        <div>
          <dt>A</dt>
          <dd>{guia.a}</dd>
        </div>
        <div>
          <dt>Salió</dt>
          <dd>{guia.salio}</dd>
        </div>
        <div>
          <dt>Llega</dt>
          <dd>{guia.llega}</dd>
        </div>
        {guia.envia && (
          <div>
            <dt>Envía</dt>
            <dd>{guia.envia}</dd>
          </div>
        )}
      </dl>
      <section className="gt-prendas">
        <p className="gt-instruccion">Busca en la caja · anota cuántas llegaron</p>
        <ol>
          {guia.prendas.map((p) => (
            <li key={p.varianteId} className="gt-prenda">
              <span>
                <span className="gt-nombre">{p.nombre}</span>
                {p.detalle && <span>{p.detalle}</span>}
                {p.codigo && <span className="gt-codigo">{p.codigo}</span>}
              </span>
              <span className="gt-casilla" aria-label={`Casilla para anotar cuántas ${p.nombre} llegaron`} />
            </li>
          ))}
        </ol>
      </section>
      <footer className="gt-qr">
        {urlQr ? <QRCodeSVG value={urlQr} size={256} level="M" marginSize={0} role="img" aria-label="QR que abre el conteo de esta caja" /> : <span className="gt-qr-hueco" aria-hidden />}
        <p>Al recibir, escanéalo con el celular: abre el conteo de esta caja.</p>
      </footer>
    </article>
  );
}
