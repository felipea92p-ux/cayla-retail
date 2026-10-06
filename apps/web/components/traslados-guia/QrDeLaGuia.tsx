"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { rutaDeLaGuia, urlDelQrDeLaGuia } from "@/lib/traslados-guia-reglas";

const sinSuscripcion = () => () => {};

/**
 * El QR de la guía en el frente del pase que sale (maqueta D, ADR-0355; ADR-0242 D-3): el mismo QR que lleva el papel, con
 * «va en la caja» debajo. Es un enlace a la guía: tocarlo la abre para imprimirla. El QR es papel (ADR-0336, regla 3): va sobre
 * su cuadro claro también en modo oscuro, y así una cámara lo puede leer de la pantalla. Mientras el navegador no dice su
 * dirección (al pintar en el servidor), queda el cuadro vacío del mismo tamaño.
 */
export function QrDeLaGuia({ id, numero }: { id: string; numero: number }) {
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null);
  return (
    <Link href={rutaDeLaGuia(id)} className="tp-qr" aria-label={`Imprimir la guía de la caja Nº ${numero}, con su QR`}>
      <span className="tp-qr-papel papel-fijo" data-papel>
        {origen ? <QRCodeSVG value={urlDelQrDeLaGuia(origen, id)} size={256} level="M" marginSize={0} aria-hidden /> : null}
      </span>
      <small>va en la caja</small>
    </Link>
  );
}
