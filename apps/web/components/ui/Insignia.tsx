import { Globito } from "@/components/ui/Globito";

/* ====================================================================
   Insignia · el número junto a un ítem del menú (2026-09-18; desde la ronda 15 de /unificar, el globito)

   Existe para una sola cosa: decir «esto te pide algo» sin entrar a la
   pantalla — hoy, cuántos traslados esperan a quien mira. No cuenta
   «cuántas cosas hay»; cuenta cuántas piden acción, y con 0 no se dibuja
   (un «0» al lado de cada ítem sería ruido, y una insignia que siempre
   está ahí deja de significar).

   Es el <Globito pide> (ADR-0358, ronda 15, Felipe 2026-10-15): ámbar suave junto al nombre y, con el lateral plegado (`compacta`),
   lleno en la esquina del ícono. Ámbar y no rojo a propósito: el rojo es el acento de marca y el riel del lateral ya lo usa.

   La cifra se oculta a los lectores de pantalla y en su lugar va una frase
   («2 por atender»): «Traslados 2» suena a que hay dos traslados, no a que
   dos esperan a quien lo lee.
   ==================================================================== */

export function Insignia({
  n,
  etiqueta,
  tamano = "normal",
  className = "",
}: {
  n: number;
  etiqueta: string;
  tamano?: "normal" | "compacta";
  /** Solo posición (absolute, márgenes) — nunca tamaño. */
  className?: string;
}) {
  return <Globito n={n} etiqueta={etiqueta} pide esquina={tamano === "compacta"} className={className} />;
}
