"use client";

import { MessageCircle } from "lucide-react";
import { BotonAncla } from "@/components/ui/campos";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { enlaceDeWhatsapp, mensajeParaLaTienda, type EnvioSalido } from "@/lib/mis-envios-reglas";

// Mis envíos (maqueta docs/maquetas/mis-compras-envios-2026-10/): el código del envío, grande, con lo que hace falta para avisar a la
// tienda: copiarlo y mandarlo por WhatsApp con el mensaje ya armado. Lo usan la hoja «Salió el envío» (apenas se manda) y el detalle de
// cualquier envío. La tienda lo busca en Recibir con ese mismo código.

/** El código en su tarjeta, con una línea debajo («8 prendas · 1 fardo · ronda RC-000612»). */
export function CodigoDeEnvio({ numero, linea, guia }: { numero: string; linea?: string; guia?: string }) {
  return (
    <div className="envio-codigo" data-guia={guia}>
      <span className="label-cayla">Código del envío</span>
      <span className="envio-codigo-numero">{numero}</span>
      {linea && <span className="text-sm text-taupe">{linea}</span>}
    </div>
  );
}

/**
 * «Copiar el código» y «Por WhatsApp» (el mensaje sale armado; abre WhatsApp en otra pestaña). «Compartir por WhatsApp» no cabía en la mitad
 * de la hoja (205 px de texto en un botón de 189, auditoría 2026-11-12): se ve «Por WhatsApp» y el lector oye la acción completa.
 */
export function AccionesDelCodigo({ envio, guia }: { envio: EnvioSalido; guia?: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row" data-guia={guia}>
      <BotonCopiar texto={envio.numero} que="el código del envío" className="sm:flex-1">
        Copiar el código
      </BotonCopiar>
      <BotonAncla
        href={enlaceDeWhatsapp(mensajeParaLaTienda(envio))}
        target="_blank"
        rel="noopener noreferrer"
        peso="fantasma"
        className="sm:flex-1"
        aria-label="Compartir el código por WhatsApp"
        title="Compartir el código por WhatsApp"
      >
        <span className="flex items-center justify-center gap-2">
          <MessageCircle aria-hidden className="-my-1 h-4 w-4 shrink-0" />
          Por WhatsApp
        </span>
      </BotonAncla>
    </div>
  );
}
