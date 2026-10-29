import { Check, Package, PackageCheck, PackageOpen, Tag, Truck } from "lucide-react";
import { ETAPAS_ENVIO, type EtapaDelEnvio } from "@/lib/trayecto-envio-reglas";

// El Trayecto (rediseño «B» de Recibir, Felipe 2026-10-29): el camino del envío con sus cinco paradas y una bola en la actual, que lleva su
// ícono y un anillo con lo que lleva (lo contado mientras se cuenta). Reemplaza al chip de estado en la cabecera del envío y en la tabla de
// envíos por recibir. Entra una vez —el camino se llena, las paradas aparecen, la bola viaja y suelta un halo— sin rebote ni bucle (ADR-0136).
// `completa`: la cabecera, con el nombre de las paradas. `compacta`: una celda de tabla, con el nombre de la actual debajo.

const ICONOS = [Package, Truck, PackageOpen, Tag, PackageCheck];

export function Trayecto({ etapa, forma = "completa" }: { etapa: EtapaDelEnvio; forma?: "completa" | "compacta" }) {
  const k = etapa.indice;
  const Icono = ICONOS[k];
  const x = `${(k / 4) * 100}%`;
  const texto = (
    <span className="rc-tray-texto">
      <b>{etapa.nombre}</b>
      {etapa.detalle && <small>{etapa.detalle}</small>}
    </span>
  );
  return (
    <div className="rc-tray" data-forma={forma} data-tono={etapa.tono} role="img" aria-label={[etapa.nombre, etapa.detalle].filter(Boolean).join(": ")}>
      <div className="rc-tray-camino">
        <div className="rc-tray-via">
          <span className="rc-tray-lleno" style={{ width: x }} />
        </div>
        {ETAPAS_ENVIO.map((n, j) =>
          j === k ? null : (
            <span key={n} className="rc-tray-parada" data-hecha={j < k ? "" : undefined} data-extremo={j === 0 || j === 4 ? "" : undefined} style={{ left: `${(j / 4) * 100}%`, "--j": j } as React.CSSProperties}>
              {j < k && <Check aria-hidden />}
              {forma === "completa" && <em>{n}</em>}
            </span>
          ),
        )}
        <span className="rc-tray-marca" style={{ left: x }}>
          <span className="rc-tray-halo" />
          <span className="rc-tray-bola" style={{ "--pp": etapa.avance } as React.CSSProperties}>
            <Icono aria-hidden />
          </span>
          {forma === "completa" && texto}
        </span>
      </div>
      {forma === "compacta" && texto}
    </div>
  );
}
