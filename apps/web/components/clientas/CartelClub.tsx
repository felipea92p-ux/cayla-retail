"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { NIVEL_QR, ZONA_MUDA_MODULOS } from "@/lib/qr";
import { cartelesDelClub, type CartelDeTienda } from "@/lib/club-qr-reglas";
import { CARTEL_INVITACION, letraChicaDelCartel, type TextosCartel } from "@/lib/club-cartel-reglas";

// El cartel del club «Invitación» (ADR-0288 act. g, G-1; diseño C aprobado por Felipe el 2026-10-01): la vista previa en
// pantalla y la hoja que va a la impresora. La hoja (`#cartel-club-print`) va pegada a <body> con un portal, como las etiquetas
// de precio y la boleta A4: al imprimir, `app/estilos/cartel-club.css` oculta todo lo demás y cada tienda sale en su propia hoja
// A4. Cada medida del cartel es la del diseño (794 × 1123 px) por `--u`: la vista previa y la hoja son el MISMO dibujo, a otra
// escala.
//
// Ninguna cifra está escrita aquí: las tres líneas y la letra chica las arma `lib/club-cartel-reglas.ts` con los beneficios que
// leyó el servidor. Sin ellos no se dibuja ningún cartel (ni en pantalla ni en la impresora): la pantalla dice por qué.
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
  textos,
  fallaTextos,
  fuente,
  volver,
}: {
  /** Las tiendas activas, con su WhatsApp si lo tienen cargado. */
  tiendas: { id: string; nombre: string; whatsappNumero: string | null }[];
  falla: string | null;
  /** Lo que el cartel dice de los beneficios, o null si la base no los dio: entonces no hay cartel. */
  textos: TextosCartel | null;
  fallaTextos: string | null;
  /** La clase de `next/font` que define `--font-eb-garamond-italica` (la itálica del título), para la pantalla y la hoja. */
  fuente: string;
  volver: ReactNode;
}) {
  // El origen (y el portal, que necesita `document`) solo existen en el navegador: en el servidor no hay hoja ni QR. Montada,
  // la hoja queda siempre, así Ctrl+P también imprime los carteles y no la pantalla.
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null);
  const carteles = origen ? cartelesDelClub(origen, tiendas) : tiendas.map((t) => ({ id: t.id, tienda: t.nombre, numero: null, enlace: "" }));
  const hay = carteles.length > 0;
  const sinNumero = origen ? carteles.filter((c) => c.numero === null).map((c) => c.tienda) : [];

  return (
    <div className={`space-y-8 ${fuente}`}>
      <EncabezadoPagina
        sede="Todas las sedes"
        titulo="Cartel del club"
        subtitulo="Una hoja A4 por tienda para el mostrador: la clienta escanea el QR y se registra en el Club CAYLA desde su celular."
        pie={volver}
        acciones={
          <button type="button" className="btn-cayla btn-primario" disabled={!hay || !textos || !origen} onClick={() => window.print()}>
            {hay && textos ? `Imprimir ${carteles.length === 1 ? "el cartel" : `${carteles.length} carteles`}` : "Nada que imprimir"}
          </button>
        }
      />

      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}
      {fallaTextos && (
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {fallaTextos} Sin ellos no se dibuja el cartel: imprimiría un beneficio que quizá ya no es el vigente. Vuelve a abrir esta
          pantalla en un momento.
        </p>
      )}

      {!hay ? (
        <p className="nota-cayla">No hay tiendas activas: sin tienda no hay cartel.</p>
      ) : (
        textos && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {carteles.map((c) => (
                <figure key={c.id} className="space-y-2">
                  <div className="cartel-club-previa card-cayla overflow-hidden">
                    <Cartel cartel={c} textos={textos} />
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
              Antes de pegarlo, escanéalo con un celular: tiene que abrir la página del Club CAYLA <b>de esa tienda</b>. El ticket
              impreso lleva el mismo QR. Al imprimir, papel A4 y, si el navegador pregunta por los márgenes, «Ninguno»: el fondo va hasta
              el borde de la hoja.
            </p>
          </>
        )
      )}

      {origen &&
        hay &&
        textos &&
        createPortal(
          <div id="cartel-club-print" className={fuente} aria-hidden>
            {carteles.map((c) => (
              <div key={c.id} className="cartel-club-hoja">
                <Cartel cartel={c} textos={textos} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** El cartel mismo, con las medidas del diseño por `--u` (ver arriba): el que lo contiene decide su tamaño. */
function Cartel({ cartel, textos }: { cartel: CartelDeTienda; textos: TextosCartel }) {
  return (
    <div className="cartel-club">
      <div className="cartel-club-marco">
        <div className="cartel-club-interior">
          <div className="cartel-club-cabeza">
            {/* eslint-disable-next-line @next/next/no-img-element -- se imprime: una <img> normal se decodifica antes de `print()` */}
            <img src="/cayla-isotipo.png" alt="" className="cartel-club-isotipo" />
            <span className="cartel-club-sello">{CARTEL_INVITACION.sello}</span>
          </div>

          <div className="cartel-club-invitacion">
            <p className="cartel-club-titulo">{CARTEL_INVITACION.titulo}</p>
            <p className="cartel-club-bajada">{CARTEL_INVITACION.bajada}</p>
            <div aria-hidden className="cartel-club-ornamento">
              <span />
              <span className="cartel-club-rombo" />
              <span />
            </div>
          </div>

          <ul className="cartel-club-beneficios">
            {textos.lineas.map((l) => (
              <li key={l.beneficio} className="cartel-club-beneficio">
                <span>{l.beneficio}</span>
                <span aria-hidden className="cartel-club-guia" />
                <span className="cartel-club-valor">{l.valor}</span>
              </li>
            ))}
          </ul>

          <div className="cartel-club-pie">
            {/* La zona muda va DENTRO del cuadro crema (4 módulos, la norma): sin ella el lector no encuentra dónde empieza. */}
            <div className="cartel-club-qr">
              {cartel.enlace && (
                <QRCodeSVG
                  value={cartel.enlace}
                  size={512}
                  level={NIVEL_QR}
                  marginSize={ZONA_MUDA_MODULOS}
                  bgColor="transparent"
                  fgColor="currentColor"
                  role="img"
                  aria-label={`QR del Club CAYLA de ${cartel.tienda}`}
                />
              )}
            </div>
            <p className="cartel-club-escanea">{CARTEL_INVITACION.escanea}</p>
            <p className="cartel-club-letra-chica">{letraChicaDelCartel(cartel.tienda, textos)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
