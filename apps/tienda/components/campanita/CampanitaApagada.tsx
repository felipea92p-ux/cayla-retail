import { Icono } from "../Icono";
import "@/app/estilos/campanita.css";

/**
 * La campanita sin números ni panel: ocupa su lugar en la fila de la cabecera mientras la de verdad llega por detrás (`Campanita`, de
 * servidor, lee la sesión y la base) o cuando la cabecera se arma sin datos (el esqueleto de la página). Así los íconos de al lado
 * (la persona, la bolsa) no se corren cuando aparece. Es solo un dibujo: no es un botón y el lector de pantalla no la lee.
 */
export function CampanitaApagada() {
  return (
    <span className="t-avisos" data-apagada="">
      <span className="t-ico" aria-hidden="true">
        <Icono nombre="campana" />
      </span>
    </span>
  );
}
