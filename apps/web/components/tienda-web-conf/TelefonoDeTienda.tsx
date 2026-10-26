import { CheckCircle2, Clock, MapPin, MessageCircle, Navigation } from "lucide-react";
import { Fachada } from "@/components/tienda-web-conf/Fachada";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import { celularValido } from "@/lib/club-reglas";
import { colorDeSede, errorDeMapa, limpiarTexto, type BorradorSede } from "@/lib/tienda-web-reglas";

/**
 * Así lo ve el cliente (maqueta de Conf. Tienda, ADR-0518): la tarjeta de esta tienda dentro de un teléfono, con lo que está escrito AHORA
 * en el taller. Apagada, se ve atenuada (el cliente no la ve). Solo dibuja: no guarda nada.
 */
export function TelefonoDeTienda({ nombreSede, borrador, enWeb, fotoUrl }: { nombreSede: string; borrador: BorradorSede; enWeb: boolean; fotoUrl?: string | null }) {
  const nombre = limpiarTexto(borrador.nombreWeb) ?? "Sin nombre en la web";
  const direccion = limpiarTexto(borrador.direccion);
  const horario = limpiarTexto(borrador.horario);
  const conWhatsapp = celularValido(borrador.whatsapp);
  // «Cómo llegar» existe con el mapa pegado o, sin él, buscando la dirección (la tienda online lo hace así hoy).
  const conMapa = (borrador.mapa.trim() !== "" && errorDeMapa(borrador.mapa) === null) || direccion !== null;

  return (
    <aside className="twc-lado" data-guia="config.tienda-web-telefono" aria-label={`Así ve el cliente la tienda ${limpiarTexto(borrador.nombreWeb) ?? nombreCorto(nombreSede)}`}>
      <div className="twc-cel">
        <div className="twc-pant">
          <div className="twc-barra" aria-hidden>
            Cayla
          </div>
          <div className="twc-tarjeta" data-oculta={enWeb ? undefined : ""}>
            <Fachada color={colorDeSede(nombreSede)} fotoUrl={fotoUrl} />
            <div className="twc-tarjeta-c">
              <h3>{nombre}</h3>
              <div className="twc-dato" data-falta={direccion ? undefined : ""}>
                <MapPin aria-hidden />
                <span>{direccion ?? "Falta dónde recoger"}</span>
              </div>
              <div className="twc-dato" data-falta={horario ? undefined : ""}>
                <Clock aria-hidden />
                <span>{horario ?? "Sin horario"}</span>
              </div>
              <div className="twc-botones">
                <span className="twc-boton twc-boton-claro" data-apagado={conMapa ? undefined : ""}>
                  <Navigation aria-hidden />
                  Cómo llegar
                </span>
                <span className="twc-boton" data-apagado={conWhatsapp ? undefined : ""}>
                  <MessageCircle aria-hidden />
                  {conWhatsapp ? "WhatsApp" : "Sin WhatsApp"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="twc-nota-en-vivo">
        <CheckCircle2 aria-hidden />
        {enWeb ? "Así lo ve el cliente · en vivo" : "Apagada: el cliente no la ve"}
      </span>
    </aside>
  );
}
