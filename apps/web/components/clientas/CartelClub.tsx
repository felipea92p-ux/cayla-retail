"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { NIVEL_QR } from "@/lib/qr";
import { UNETE_AL_CLUB, cartelesDelClub, type CartelDeTienda } from "@/lib/club-qr-reglas";

// El cartel del club (ADR-0288 act. g, G-1): la vista previa en pantalla y la hoja que va a la impresora. La hoja
// (`#cartel-club-print`) va pegada a <body> con un portal, como las etiquetas de precio y la boleta A4: al imprimir,
// `app/estilos/cartel-club.css` oculta todo lo demás y cada tienda sale en su propia página A4. Todo el cartel se mide en
// `em`: la vista previa y la hoja son el MISMO dibujo, solo cambia el tamaño de letra de la hoja que lo contiene.
//
// Cada QR abre la página de registro de SU tienda (`/club/<uuid>`), armada con el origen de este navegador: el mismo dominio
// donde vive la página. Antes de montarse en el navegador no hay origen, y el cuadro del QR queda vacío un instante.

const sinSuscripcion = () => () => {};

/** «987 654 321»: como se lee en voz alta y como lo busca quien lo quiera escribir a mano. */
function numeroLegible(n: string): string {
  return n.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

export function CartelClub({
  tiendas,
  falla,
  volver,
}: {
  /** Las tiendas activas, con su WhatsApp si lo tienen cargado. */
  tiendas: { id: string; nombre: string; whatsappNumero: string | null }[];
  falla: string | null;
  volver: ReactNode;
}) {
  // El origen (y el portal, que necesita `document`) solo existen en el navegador: en el servidor no hay hoja ni QR. Montada,
  // la hoja queda siempre, así Ctrl+P también imprime los carteles y no la pantalla.
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null);
  const carteles = origen ? cartelesDelClub(origen, tiendas) : tiendas.map((t) => ({ id: t.id, tienda: t.nombre, numero: null, enlace: "" }));
  const hay = carteles.length > 0;
  const sinNumero = origen ? carteles.filter((c) => c.numero === null).map((c) => c.tienda) : [];

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Cartel del club"
        subtitulo="Una hoja A4 por tienda para el mostrador: la clienta escanea el QR y se registra en el Club CAYLA desde su celular."
        pie={volver}
        acciones={
          <button type="button" className="btn-cayla btn-primario" disabled={!hay || !origen} onClick={() => window.print()}>
            {hay ? `Imprimir ${carteles.length === 1 ? "el cartel" : `${carteles.length} carteles`}` : "Nada que imprimir"}
          </button>
        }
      />

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}

      {!hay ? (
        <p className="nota-cayla">No hay tiendas activas: sin tienda no hay cartel.</p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {carteles.map((c) => (
              <figure key={c.id} className="space-y-2">
                <div className="cartel-club-previa card-cayla overflow-hidden">
                  <Cartel cartel={c} />
                </div>
                <figcaption className="text-xs text-tinta/65">
                  {c.tienda}
                  {c.numero ? ` · WhatsApp ${numeroLegible(c.numero)}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
          {sinNumero.length > 0 && (
            <p className="nota-cayla">
              <b>{sinNumero.join(", ")}</b> {sinNumero.length === 1 ? "no tiene" : "no tienen"} número de WhatsApp: el cartel sirve igual, pero
              quien se una ahí no tiene a quién saludar al final ni de dónde recibir las novedades. El líder lo carga en{" "}
              <Link href="/configuracion?tab=tiendas" className="btn-enlace">
                Configuración ▸ Tiendas y caja
              </Link>
              .
            </p>
          )}
          <p className="nota-cayla">
            Antes de pegarlo, escanéalo con un celular: tiene que abrir la página del Club CAYLA <b>de esa tienda</b>. El ticket impreso
            lleva el mismo QR.
          </p>
        </>
      )}

      {origen &&
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
      <p className="cartel-club-titulo">{UNETE_AL_CLUB.titulo}</p>
      <p className="cartel-club-bajada">{UNETE_AL_CLUB.bajada}</p>
      {cartel.enlace ? (
        <QRCodeSVG value={cartel.enlace} size={512} level={NIVEL_QR} marginSize={4} className="cartel-club-qr" role="img" aria-label={`QR del Club CAYLA de ${cartel.tienda}`} />
      ) : (
        <span aria-hidden className="cartel-club-qr" />
      )}
      <ol className="cartel-club-pasos">
        <li>Escanea el código con la cámara de tu celular.</li>
        <li>Completa tus datos: documento, celular y fecha de nacimiento.</li>
        <li>Recibe tu código de socia y úsalo en caja.</li>
      </ol>
      <p className="cartel-club-letra-chica">Descuento en tu cumpleaños y un vale de compra por cada año con nosotras. Las novedades por WhatsApp, solo si quieres.</p>
      <p className="cartel-club-tienda">
        {cartel.tienda}
        {cartel.numero ? ` · WhatsApp ${numeroLegible(cartel.numero)}` : ""}
      </p>
    </div>
  );
}
