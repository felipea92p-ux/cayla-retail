import type { ReactNode } from "react";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Globito } from "@/components/ui/Globito";

/**
 * Lo que una pantalla tiene pendiente, como un botón más de su cabecera (Felipe 2026-11-17, Catálogo ▸ Productos): antes cada pendiente
 * era una tarjeta de aviso bajo la cabecera y, en el celular, tres de ellas dejaban la primera prenda dos pantallas más abajo.
 *
 * Es un botón secundario como sus vecinos (ícono en el celular, con su palabra desde 640 px) y dos cosas lo hacen verse:
 * · su número en ámbar en la esquina (`Globito esquina pide`, la pieza de la campana de Cuentas y dinero), que se ve quieto;
 * · el latido del sistema detrás del número (`.punto-vivo`, el del chip «Vencida»; ADR-0136 act. 2026-11-17). Late solo en el aparato
 *   que encendió las animaciones: quieto es quieto (ADR-0625), por eso la señal de verdad es el número.
 *
 * El número y su latido van FUERA del botón: el botón recorta lo que sobresale (la luz que lo cruza). Por eso suben con él al pasar el
 * mouse (los 2 px de todo botón): si no, el botón se despegaría de su número.
 */
export function PendienteDeCabecera({
  icono,
  palabra,
  titulo,
  n,
  queCuenta = "pendientes",
  guia,
  href,
  onClick,
}: {
  /** El ícono de lucide, de 16 px (`h-4 w-4`) y `aria-hidden`. */
  icono: ReactNode;
  /** Lo que dice el botón desde 640 px y lo que oye el lector («Fichas repetidas»). */
  palabra: string;
  /** La frase completa, al pasar el mouse («8 posibles fichas repetidas»). */
  titulo: string;
  n: number;
  /** Lo que oye el lector junto al número, si no son «pendientes» («1 aviso» en Existencias). */
  queCuenta?: string;
  /** Ancla de la guía interactiva (ADR-0389). */
  guia?: string;
  /** Si lleva a otra pantalla. */
  href?: string;
  /** Si abre una hoja aquí mismo. */
  onClick?: () => void;
}) {
  if (n <= 0) return null;
  const contenido = (
    <span className="flex items-center gap-1.5">
      {icono}
      <span className="max-sm:sr-only">{palabra}</span>
    </span>
  );
  return (
    <span className="group relative inline-flex" data-guia={guia}>
      {href ? (
        <BotonEnlace href={href} peso="fantasma" title={titulo} className="max-sm:min-w-11 max-sm:!px-3">
          {contenido}
        </BotonEnlace>
      ) : (
        <Boton peso="fantasma" title={titulo} className="max-sm:min-w-11 max-sm:!px-3" onClick={onClick}>
          {contenido}
        </Boton>
      )}
      <span className="pointer-events-none absolute -right-1 -top-1 inline-flex transition-[translate] duration-200 group-hover:-translate-y-0.5">
        {/* El latido: un punto ámbar del tamaño del número, detrás de él; lo que se ve es su onda. */}
        <span aria-hidden className="punto-vivo absolute inset-0 rounded-full bg-ambar" />
        <Globito n={n} pide esquina late etiqueta={queCuenta} className="relative" />
      </span>
    </span>
  );
}
