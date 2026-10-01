"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { NIVEL_QR } from "@/lib/qr";

// El cartel del club (ADR-0288 tanda 1b): la vista previa en pantalla y la hoja que va a la impresora. La hoja
// (`#cartel-club-print`) va pegada a <body> con un portal, como las etiquetas de precio y la boleta A4: al imprimir,
// `app/estilos/cartel-club.css` oculta todo lo demás y cada tienda sale en su propia página A4. Todo el cartel se mide en
// `em`: la vista previa y la hoja son el MISMO dibujo, solo cambia el tamaño de letra de la hoja que lo contiene.

export type CartelDeTienda = { id: string; tienda: string; numero: string; enlace: string };

const sinSuscripcion = () => () => {};

/** «987 654 321»: como se lee en voz alta y como lo busca quien lo quiera escribir a mano. */
function numeroLegible(n: string): string {
  return n.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

export function CartelClub({
  carteles,
  sinNumero,
  sinMensaje,
  falla,
  volver,
}: {
  carteles: CartelDeTienda[];
  /** Las tiendas activas sin número de WhatsApp: no llevan cartel. */
  sinNumero: string[];
  /** No hay `mensaje_generico` vigente en `club_textos`: sin él no hay QR. */
  sinMensaje: boolean;
  falla: string | null;
  volver: ReactNode;
}) {
  // El portal necesita `document`: en el servidor no hay hoja; en el navegador queda montada siempre, así Ctrl+P también
  // imprime los carteles y no la pantalla.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const hay = carteles.length > 0;

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Cartel del club"
        subtitulo="Una hoja A4 por tienda para el mostrador: la clienta escanea el QR y le envía a la tienda el mensaje para unirse al club."
        pie={volver}
        acciones={
          <button type="button" className="btn-cayla btn-primario" disabled={!hay} onClick={() => window.print()}>
            {hay ? `Imprimir ${carteles.length === 1 ? "el cartel" : `${carteles.length} carteles`}` : "Nada que imprimir"}
          </button>
        }
      />

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      {sinMensaje ? (
        <p className="nota-cayla">
          El club todavía no tiene su <b>mensaje para el cartel</b> vigente. Sin él no se puede armar el QR: avisa al líder.
        </p>
      ) : !hay ? (
        <p className="nota-cayla">
          Ninguna tienda tiene cargado su <b>número de WhatsApp</b>, y sin número no hay QR. El líder lo carga en{" "}
          <Link href="/configuracion?tab=tiendas" className="btn-enlace">
            Configuración ▸ Tiendas y caja
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {carteles.map((c) => (
              <figure key={c.id} className="space-y-2">
                <div className="cartel-club-previa card-cayla overflow-hidden">
                  <Cartel cartel={c} />
                </div>
                <figcaption className="text-xs text-tinta/65">
                  {c.tienda} · WhatsApp {numeroLegible(c.numero)}
                </figcaption>
              </figure>
            ))}
          </div>
          {sinNumero.length > 0 && (
            <p className="nota-cayla">
              Sin cartel porque no tienen número de WhatsApp: <b>{sinNumero.join(", ")}</b>. El líder lo carga en{" "}
              <Link href="/configuracion?tab=tiendas" className="btn-enlace">
                Configuración ▸ Tiendas y caja
              </Link>
              .
            </p>
          )}
          <p className="nota-cayla">
            Antes de pegarlo, escanéalo con un celular: tiene que abrir el WhatsApp <b>de esa tienda</b> con el mensaje listo. Cuando
            llegue un mensaje, regístralo en Clientas con <b>«Llegó un mensaje de WhatsApp»</b>.
          </p>
        </>
      )}

      {montado &&
        hay &&
        createPortal(
          <div id="cartel-club-print" aria-hidden>
            {carteles.map((c) => (
              <div key={c.id} className="cartel-club-hoja">
                <Cartel cartel={c} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** El cartel mismo, medido en `em` (ver arriba): el que lo contiene decide su tamaño. */
function Cartel({ cartel }: { cartel: CartelDeTienda }) {
  return (
    <div className="cartel-club">
      <div className="cartel-club-marca">
        <IsotipoCayla className="cartel-club-isotipo" color="currentColor" />
        <span>CAYLA</span>
      </div>
      <p className="cartel-club-titulo">Únete al Club CAYLA</p>
      <p className="cartel-club-bajada">Escanea y envía el mensaje</p>
      <QRCodeSVG value={cartel.enlace} size={512} level={NIVEL_QR} marginSize={4} className="cartel-club-qr" role="img" aria-label={`QR del club de ${cartel.tienda}`} />
      <ol className="cartel-club-pasos">
        <li>Escanea el código con la cámara de tu celular.</li>
        <li>Se abre WhatsApp con el mensaje listo: envíalo.</li>
        <li>Te respondemos por ese chat y te pedimos tu DNI para registrarte.</li>
      </ol>
      <p className="cartel-club-letra-chica">Te llegan novedades, rebajas y tu saludo de cumpleaños. Para salir, escribe BAJA.</p>
      <p className="cartel-club-tienda">
        {cartel.tienda} · WhatsApp {numeroLegible(cartel.numero)}
      </p>
    </div>
  );
}
