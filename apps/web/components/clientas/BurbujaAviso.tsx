import { Fragment } from "react";
import { LINEA_BAJA, trozosConNegrita } from "@/lib/club-avisos-mensajes";

// El mensaje de un aviso como le llega al miembro por WhatsApp (Clientes ▸ Avisos y su hoja «Editar mensajes»; maqueta
// `docs/maquetas/avisos-club-2026-10/`): una burbuja con un tinte verde suave hecho de tokens (es un mensaje, no la app de WhatsApp),
// lo que va entre asteriscos en negrita, el cierre común separado por una raya punteada y la línea de la BAJA en chico al final.
export function BurbujaAviso({ texto, cierre, hora, className = "" }: { texto: string; cierre?: string; hora?: string; className?: string }) {
  const parrafos = texto.split(/\n{2,}/);
  const cierreLimpio = cierre?.trim() ?? "";
  return (
    <div
      className={`relative whitespace-pre-line break-words rounded-xl rounded-bl-sm bg-[color-mix(in_srgb,var(--color-verde)_13%,var(--color-papel))] px-3 pb-5 pt-2.5 text-[13.5px] leading-snug text-tinta ${className}`}
    >
      {parrafos.map((p, i) => {
        const esBaja = p.trim() === LINEA_BAJA;
        const esCierre = cierreLimpio !== "" && p.trim() === cierreLimpio;
        return (
          <p
            key={i}
            className={
              esBaja
                ? "mt-1.5 text-xs text-tinta/65"
                : esCierre
                  ? "mt-2 border-t border-dashed border-tinta/20 pt-2"
                  : i > 0
                    ? "mt-2"
                    : ""
            }
          >
            {trozosConNegrita(p).map((t, j) => (
              <Fragment key={j}>{t.negrita ? <b className="font-semibold">{t.texto}</b> : t.texto}</Fragment>
            ))}
          </p>
        );
      })}
      {hora && <span className="absolute bottom-1 right-2.5 text-[10.5px] tabular-nums text-tinta/55">{hora}</span>}
    </div>
  );
}
