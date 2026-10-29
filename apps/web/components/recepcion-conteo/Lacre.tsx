// El lacre del envío cerrado (rediseño «B» de Recibir, Felipe 2026-10-29): un sello de cera roja con la C de CAYLA que cae una vez sobre la
// tarjeta al llegar, como el lacre que cierra un sobre. Sin rebote ni bucle (ADR-0136); con «reducir movimiento», ya está puesto.

const BORDE =
  "M96.0 50.0 L90.6 60.9 L89.8 73.0 L79.7 79.7 L73.0 89.8 L60.9 90.6 L50.0 96.0 L39.1 90.6 L27.0 89.8 L20.3 79.7 L10.2 73.0 L9.4 60.9 L4.0 50.0 L9.4 39.1 L10.2 27.0 L20.3 20.3 L27.0 10.2 L39.1 9.4 L50.0 4.0 L60.9 9.4 L73.0 10.2 L79.7 20.3 L89.8 27.0 L90.6 39.1Z";

export function Lacre() {
  return (
    <svg className="rc-lacre-sello" viewBox="0 0 100 100" aria-hidden>
      <path className="rc-lacre-cera" d={BORDE} />
      <circle className="rc-lacre-aro" cx="50" cy="50" r="31" />
      <text className="rc-lacre-letra" x="50" y="62" textAnchor="middle">
        C
      </text>
    </svg>
  );
}
