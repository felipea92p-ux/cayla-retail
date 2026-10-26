import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

// Una respuesta a «¿Qué hiciste?» (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-24): «Compré ropa» es la grande, a
// todo el ancho y en tinta (pasa a rojo profundo al pasar el mouse, como todo botón negro); «Me dieron plata» y «Gasté en otra cosa» van
// debajo, de a dos, con su ícono, su nombre en serif y un ejemplo. Lleva a otra pantalla (`href`) o abre
// una hoja (`onClick`). Sin estado propio: la usan el servidor (el enlace) y las hojas (el botón). `ancha`: sola en su fila (sin ronda
// abierta, «Me dieron plata» es la única), a todo el ancho y en una línea; a media columna dejaba un hueco al lado.
export function AccionDelDia({
  titulo,
  detalle,
  icono,
  grande = false,
  ancha = false,
  href,
  onClick,
  guia,
}: {
  titulo: string;
  detalle: string;
  icono: ReactNode;
  grande?: boolean;
  ancha?: boolean;
  href?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  guia?: string;
}) {
  const cara = grande
    ? "col-span-2 flex-row items-center gap-4 border-tinta bg-tinta text-crema hover:border-rojo-profundo hover:bg-rojo-profundo"
    : ancha
      ? "col-span-2 flex-row items-center gap-3"
      : "flex-col items-start gap-2.5";
  const contenido = (
    <>
      <span
        className={`grid shrink-0 place-items-center rounded-full ${grande ? "h-[46px] w-[46px] bg-crema text-tinta" : "h-[38px] w-[38px] bg-hueso text-tinta"}`}
      >
        {icono}
      </span>
      <span className="min-w-0">
        <span className={`block font-serif leading-tight ${grande ? "text-2xl" : "text-xl text-tinta"}`}>{titulo}</span>
        <span className={`mt-0.5 block text-xs ${grande ? "text-crema/75" : "text-taupe"}`}>{detalle}</span>
      </span>
    </>
  );
  const clase = `card-cayla mov-boton flex w-full rounded-[18px] p-3.5 text-left ${cara}`;
  return href ? (
    <Link href={href} data-guia={guia} className={clase}>
      {contenido}
    </Link>
  ) : (
    <button type="button" data-guia={guia} onClick={onClick} className={clase}>
      {contenido}
    </button>
  );
}
