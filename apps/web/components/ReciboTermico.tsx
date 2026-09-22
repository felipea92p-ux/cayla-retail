import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { DIAS_PLAZO_CAMBIO } from "@/lib/cambios-reglas";
import { EMISOR, type Emisor } from "@/lib/emisor";
import {
  fechaHoraLima,
  montoEnLetras,
  NOMBRE_METODO,
  textoNumeroRecibo,
  textoQrSunat,
  TITULO_DOCUMENTO,
  desglosaIgv,
  type ReciboVenta,
} from "@/lib/recibo-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * El comprobante como sale de la térmica de 80 mm: la «representación impresa» de la boleta o
 * factura electrónica. Solo pintura — todo número viene armado de `lib/recibo-reglas.ts`.
 *
 * En pantalla NO se ve (`#comprobante-print` es `display:none` en `globals.css`); solo existe
 * para `window.print()` o Ctrl+P mientras el modal de «Venta registrada» está abierto. Va
 * pegado a `<body>` (portal, lo pone el modal): el CSS de impresión oculta a los hermanos.
 *
 * DISEÑO, pensado para una térmica (203 dpi, un solo tono):
 *  · Solo NEGRO sobre blanco. Nada de grises ni fondos: una térmica no tiene escala de grises
 *    (tramaría o borraría el texto tenue) y Chrome no imprime fondos salvo que se lo pidan.
 *    La jerarquía sale de tamaño, peso y reglas, no de color.
 *  · Lo que la clienta busca —el TOTAL— va enmarcado entre dos reglas gruesas y es lo más grande;
 *    lo que necesita SUNAT (serie-número, QR) va aparte y no compite con eso.
 *  · El logo es el isotipo del colibrí en negro (`filter: brightness(0)`), no el PNG terracota.
 *  · Ancho útil 72 mm (papel de 80 con los márgenes del cabezal).
 */
export function ReciboTermico({ recibo, emisor = EMISOR }: { recibo: ReciboVenta; emisor?: Emisor }) {
  const { fecha, hora } = fechaHoraLima(recibo.emitidoEn);
  const cli = recibo.cliente;
  const tieneDoc = cli.tipoDoc !== "sin_documento" && !!cli.numDoc;
  const fiscal = desglosaIgv(recibo.tipo);
  const qr = fiscal && emisor.ruc ? textoQrSunat(recibo, emisor.ruc) : null;
  const contacto = [emisor.telefono, emisor.email].filter(Boolean);

  return (
    <div id="comprobante-print" data-testid="recibo-termico">
      <header className="rt-centro">
        {/* `priority`: la imagen tiene que estar cargada ANTES de imprimir; el recibo está
            `display:none` en pantalla y un `lazy` no la traería hasta tarde. */}
        <Image src="/cayla-isotipo.png" alt="" width={221} height={150} priority unoptimized className="rt-logo" />
        <p className="rt-marca">{emisor.nombreComercial}</p>
        <p className="rt-negrita">
          {emisor.razonSocial} · RUC {emisor.ruc}
        </p>
        {emisor.direccion.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {contacto.length > 0 && <p>{contacto.join(" · ")}</p>}
        {(emisor.web || emisor.regimen) && <p>{[emisor.web, emisor.regimen].filter(Boolean).join(" · ")}</p>}
        <p className="rt-tienda">{recibo.sede}</p>
      </header>

      <div className="rt-doble" />
      <p className="rt-centro rt-titulo">{TITULO_DOCUMENTO[recibo.tipo]}</p>
      <p className="rt-centro rt-numero">{textoNumeroRecibo(recibo)}</p>
      <div className="rt-doble" />

      <dl className="rt-datos">
        <dt>Fecha</dt>
        <dd>
          {fecha} · {hora}
        </dd>
        <dt>Cliente</dt>
        <dd>{cli.nombre?.trim() || "CLIENTE VARIOS"}</dd>
        {tieneDoc && (
          <>
            <dt>{cli.tipoDoc === "ruc" ? "RUC" : "DNI"}</dt>
            <dd>{cli.numDoc}</dd>
          </>
        )}
        {recibo.atendio && (
          <>
            <dt>Atendió</dt>
            <dd>{recibo.atendio}</dd>
          </>
        )}
      </dl>

      <div className="rt-tabla-cab">
        <span>Cant</span>
        <span>Descripción</span>
        <span>Importe</span>
      </div>
      {recibo.lineas.map((l, i) => (
        <div key={i} className="rt-item">
          <span className="rt-cant">{l.cantidad}</span>
          <span className="rt-desc">
            {l.descripcion}
            {l.codigo && <span className="rt-detalle">{l.codigo}</span>}
            <span className="rt-detalle">
              P.U. {l.precioUnitario.toFixed(2)}
              {l.descuentoUnitario > 0 && ` · Dscto. -${l.descuentoUnitario.toFixed(2)} c/u`}
            </span>
          </span>
          <span className="rt-imp">{l.importe.toFixed(2)}</span>
        </div>
      ))}

      <div className="rt-linea" />
      {fiscal && (
        <>
          <div className="rt-fila">
            <span>Subtotal (sin IGV)</span>
            <span>{s(recibo.subtotal)}</span>
          </div>
          <div className="rt-fila">
            <span>IGV 18%</span>
            <span>{s(recibo.igv)}</span>
          </div>
        </>
      )}
      <div className="rt-fila rt-total">
        <span>TOTAL</span>
        <span>{s(recibo.total)}</span>
      </div>
      <p className="rt-son">SON: {montoEnLetras(recibo.total)}</p>

      <div className="rt-linea" />
      <p className="rt-subtitulo">Forma de pago</p>
      {recibo.pagos.map((p) => (
        <div key={p.metodo}>
          <div className="rt-fila">
            <span>{NOMBRE_METODO[p.metodo]}</span>
            <span>{s(p.monto)}</span>
          </div>
          {p.recibido !== null && p.metodo === "efectivo" && (
            <div className="rt-fila rt-detalle">
              <span>Recibido {s(p.recibido)}</span>
              <span>Vuelto {s(p.vuelto)}</span>
            </div>
          )}
        </div>
      ))}

      {qr && (
        <div className="rt-centro rt-qr">
          {/* Nivel M y 32 mm: a esa medida los módulos aguantan una térmica de 203 dpi. */}
          <QRCodeSVG value={qr} size={256} level="M" marginSize={0} style={{ width: "32mm", height: "32mm", margin: "0 auto" }} />
        </div>
      )}

      <div className="rt-linea" />
      <footer className="rt-centro rt-pie">
        {fiscal ? (
          <>
            <p>Representación impresa de la {recibo.tipo === "factura" ? "factura" : "boleta de venta"} electrónica.</p>
            {emisor.resolucion && <p>Autorizado mediante resolución N° {emisor.resolucion}</p>}
          </>
        ) : (
          <p>Documento sin valor tributario. No es un comprobante de pago.</p>
        )}
        <p>
          Cambios dentro de {DIAS_PLAZO_CAMBIO} días con este {fiscal ? "comprobante" : "documento"}.
          {emisor.web && ` Más en ${emisor.web}`}
        </p>
        <p className="rt-lema">{emisor.lema}</p>
        <p className="rt-negrita">¡Gracias por tu compra!</p>
      </footer>
    </div>
  );
}
