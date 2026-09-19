/* ====================================================================
   Insignia · el número junto a un ítem del menú (2026-09-18)

   Existe para una sola cosa: decir «esto te pide algo» sin entrar a la
   pantalla — hoy, cuántos traslados esperan a quien mira. No cuenta
   «cuántas cosas hay»; cuenta cuántas piden acción, y con 0 no se dibuja
   (un «0» al lado de cada ítem sería ruido, y una insignia que siempre
   está ahí deja de significar).

   Es ámbar y no rojo a propósito: el rojo es el acento de marca
   (globals.css: «máximo 2 por pantalla») y el riel del lateral ya lo usa.
   Crema sobre ámbar aprueba contraste AA.

   La cifra se oculta a los lectores de pantalla y en su lugar va una frase
   («2 por atender»): «Traslados 2» suena a que hay dos traslados, no a que
   dos esperan a quien lo lee.
   ==================================================================== */

// `compacta` es para las pestañas y el ícono del celular. Es una variante con clases PROPIAS y no un
// `className` que pise a las de `normal`: en Tailwind v4 dos utilidades de la misma propiedad (h-5 y h-4)
// las gana la que salga después en la hoja de estilos, no la que se escribe después en el atributo — y
// la de tamaño chico perdía.
const TAMANO = {
  normal: "h-5 min-w-5 px-1.5 text-[11px]",
  compacta: "h-4 min-w-4 px-1 text-[10px]",
} as const;

export function Insignia({
  n,
  etiqueta,
  tamano = "normal",
  className = "",
}: {
  n: number;
  etiqueta: string;
  tamano?: keyof typeof TAMANO;
  /** Solo posición (absolute, márgenes) — nunca tamaño. */
  className?: string;
}) {
  if (!Number.isFinite(n) || n <= 0) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ambar font-medium leading-none tabular-nums text-crema ${TAMANO[tamano]} ${className}`}
    >
      <span aria-hidden>{n > 99 ? "99+" : n}</span>
      <span className="sr-only">
        {n} {etiqueta}
      </span>
    </span>
  );
}
