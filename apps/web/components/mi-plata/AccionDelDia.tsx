import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

// Una respuesta a «¿Qué hiciste?» (maqueta docs/maquetas/compras-formidable-2026-10/): «Compré ropa» es la grande, a todo el ancho, con
// su borde y su círculo en tinta; «Me dieron plata» y «Gasté en otra cosa» van a su lado, de a dos. Lleva a otra pantalla (`href`) o abre
// una hoja (`onClick`). Sin estado propio: la usan el servidor (el enlace) y las hojas (el botón).
export function AccionDelDia({
  titulo,
  detalle,
  icono,
  grande = false,
  href,
  onClick,
  guia,
}: {
  titulo: string;
  detalle: string;
  icono: ReactNode;
  grande?: boolean;
  href?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  guia?: string;
}) {
  const cara = grande
    ? "col-span-2 flex-row items-center gap-4 border-tinta"
    : "flex-col items-start gap-2.5";
  const contenido = (
    <>
      <span
        className={`grid shrink-0 place-items-center rounded-full ${grande ? "h-[52px] w-[52px] bg-tinta text-crema" : "h-10 w-10 bg-hueso text-tinta"}`}
      >
        {icono}
      </span>
      <span className="min-w-0">
        <span className={`block font-serif leading-tight text-tinta ${grande ? "text-2xl" : "text-xl"}`}>{titulo}</span>
        <span className="mt-0.5 block text-xs text-taupe">{detalle}</span>
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
