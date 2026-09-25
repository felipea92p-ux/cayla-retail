import Link from "next/link";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

// Las piezas de las pantallas de Finanzas (ADR-0195), tal como las dibuja el spike aprobado
// (docs/maquetas/finanzas-2026-09/). Solo presentación: reciben valores y avisan cambios; la lógica vive en lib/*-reglas.ts.
// Los estilos, en app/estilos/finanzas.css (clases `fin-*`). Sin estado propio: se pueden dibujar desde el servidor.

// ---- Pestañas -----------------------------------------------------------------------------------------------------------

export type PestanaFin = { clave: string; etiqueta: string; conteo?: number | null; href?: string };

/** Pestañas con subrayado en tinta y el conteo en una píldora. Con `href` son enlaces (la vista vive en la URL);
 *  sin él, botones que avisan `onCambio`. */
export function PestanasFin({ items, valor, onCambio, etiqueta }: { items: PestanaFin[]; valor: string; onCambio?: (clave: string) => void; etiqueta: string }) {
  return (
    <div role="tablist" aria-label={etiqueta} className="fin-pestanas">
      {items.map((p) => {
        const contenido = (
          <>
            {p.etiqueta}
            {p.conteo ? <span className="fin-cuenta-tab">{p.conteo}</span> : null}
          </>
        );
        return p.href ? (
          <Link key={p.clave} href={p.href} role="tab" aria-selected={valor === p.clave} className="fin-pestana" scroll={false}>
            {contenido}
          </Link>
        ) : (
          <button key={p.clave} type="button" role="tab" aria-selected={valor === p.clave} className="fin-pestana" onClick={() => onCambio?.(p.clave)}>
            {contenido}
          </button>
        );
      })}
    </div>
  );
}

// ---- Superficie, herramientas y pie ---------------------------------------------------------------------------------------

export function Superficie({ children, className = "", pad = false }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`fin-superficie ${pad ? "fin-pad" : ""} ${className}`}>{children}</div>;
}

export function Herramientas({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`fin-herramientas ${className}`}>{children}</div>;
}

/** La franja de arriba de una tarjeta cuando lleva un título (Configuración): título y bajada; a la derecha, la acción. */
export function TituloDeTarjeta({ titulo, bajada, children }: { titulo: ReactNode; bajada?: ReactNode; children?: ReactNode }) {
  return (
    <div className="fin-herramientas justify-between">
      <div className="fin-herramientas-titulo min-w-0">
        <b>{titulo}</b>
        {bajada && <p>{bajada}</p>}
      </div>
      {children}
    </div>
  );
}

export function PieTabla({ children }: { children: ReactNode }) {
  return <div className="fin-pie">{children}</div>;
}

/** Cabecera de un bloque dentro de una superficie con aire (`pad`): título serif y bajada; a la derecha, su acción. */
export function CabeceraBloque({ titulo, bajada, children }: { titulo: ReactNode; bajada?: ReactNode; children?: ReactNode }) {
  return (
    <div className="fin-bloque-cab">
      <div className="min-w-0">
        <h2>{titulo}</h2>
        {bajada && <p>{bajada}</p>}
      </div>
      {children}
    </div>
  );
}

// ---- Controles ------------------------------------------------------------------------------------------------------------

export function Buscador({ valor, onValor, placeholder }: { valor: string; onValor: (v: string) => void; placeholder: string }) {
  return (
    <div className="fin-buscar">
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <input className="fin-control" type="search" value={valor} onChange={(e) => onValor(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function SelectFin({ className = "", children, ...resto }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`fin-control ${className}`} {...resto}>
      {children}
    </select>
  );
}

export function InputFin({ className = "", ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`fin-control ${className}`} {...resto} />;
}

/** Un campo: etiqueta chica, el control y (si hay) una ayuda debajo. `tono="aviso"` pinta la ayuda en ámbar. */
export function CampoFin({ etiqueta, htmlFor, ayuda, tono, children, className = "" }: { etiqueta: ReactNode; htmlFor?: string; ayuda?: ReactNode; tono?: "aviso"; children: ReactNode; className?: string }) {
  return (
    <div className={`fin-campo ${className}`}>
      {htmlFor ? <label htmlFor={htmlFor}>{etiqueta}</label> : <span className="fin-etiqueta">{etiqueta}</span>}
      {children}
      {ayuda && (
        <span className="fin-ayuda" data-tono={tono}>
          {ayuda}
        </span>
      )}
    </div>
  );
}

/** Un valor calculado que se muestra con la forma de un campo (el IGV de la factura). */
export function SalidaFin({ children }: { children: ReactNode }) {
  return <output className="fin-control flex items-center tabular-nums">{children}</output>;
}

/** Opciones en tarjetas de una línea («Factura · Boleta · …», «Ya se pagó · A crédito»). */
export function RadiosFin<T extends string>({
  nombre,
  valor,
  onValor,
  opciones,
  etiqueta,
}: {
  nombre: string;
  valor: T;
  onValor: (v: T) => void;
  opciones: { valor: T; texto: ReactNode; deshabilitada?: boolean }[];
  etiqueta: string;
}) {
  return (
    <div className="fin-radios" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <label key={o.valor}>
          <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} disabled={o.deshabilitada} onChange={() => onValor(o.valor)} />
          {o.texto}
        </label>
      ))}
    </div>
  );
}

/** Opciones en tarjetas con título y explicación («¿Qué fue esta salida?»). */
export function OpcionesFin<T extends string>({
  nombre,
  valor,
  onValor,
  opciones,
  etiqueta,
}: {
  nombre: string;
  valor: T;
  onValor: (v: T) => void;
  opciones: { valor: T; titulo: string; detalle: string }[];
  etiqueta: string;
}) {
  return (
    <div className="fin-opciones" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <label key={o.valor}>
          <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => onValor(o.valor)} />
          <b>{o.titulo}</b>
          <span>{o.detalle}</span>
        </label>
      ))}
    </div>
  );
}

/** Lista de pares «dato · valor» (el detalle de un gasto o de un activo). */
export function ListaDatos({ filas }: { filas: { dato: ReactNode; valor: ReactNode; tenue?: boolean }[] }) {
  return (
    <ul className="fin-lista">
      {filas.map((f, i) => (
        <li key={i}>
          <span>{f.dato}</span>
          {f.tenue ? <small>{f.valor}</small> : <b>{f.valor}</b>}
        </li>
      ))}
    </ul>
  );
}

/** Estado vacío de una pestaña: sobretítulo, título serif y una línea de ayuda. */
export function GuiaVacia({ sobre, titulo, children }: { sobre: string; titulo: string; children: ReactNode }) {
  return (
    <div className="fin-guia">
      <p className="label-cayla text-[11px] text-taupe">{sobre}</p>
      <h2>{titulo}</h2>
      <p>{children}</p>
    </div>
  );
}

// ---- F5 · Gráfico de barras de una sola serie (Reportes ▸ Campañas; lo puede usar el Flujo) -------------------------------

export type BarraFin = { nombre: string; valor: number; mala?: boolean; malaTexto?: string; detalle?: string };

/**
 * El gráfico del spike (`barras()` de marco.js): una serie en tinta; el rojo marca SOLO una pérdida o algo bajo el umbral y
 * siempre lleva su etiqueta (nunca el color solo). Etiquetas directas sobre cada barra; el detalle, al pasar el mouse
 * (`<title>`, sin estado: se dibuja desde el servidor). `umbral` dibuja una línea punteada con su leyenda.
 */
export function BarrasFin({
  barras,
  alto = 190,
  ancho = 640,
  umbral,
  umbralTexto,
  etiquetaValor,
  etiqueta,
}: {
  barras: BarraFin[];
  alto?: number;
  /** El ancho del lienzo: en una columna angosta, menos ancho = letras más grandes (el SVG se escala al contenedor). */
  ancho?: number;
  umbral?: number;
  umbralTexto?: string;
  etiquetaValor: (v: number) => string;
  etiqueta: string;
}) {
  const W = ancho;
  const pad = { t: 34, r: 12, b: 46, l: 12 };
  const max = Math.max(0, ...barras.map((b) => b.valor), umbral ?? 0);
  const min = Math.min(0, ...barras.map((b) => b.valor));
  const y = (v: number) => pad.t + ((max - v) / (max - min || 1)) * (alto - pad.t - pad.b);
  const bw = barras.length ? (W - pad.l - pad.r) / barras.length : 0;
  return (
    <div className="fin-grafico">
      <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={`${etiqueta}: ${barras.map((b) => `${b.nombre} ${etiquetaValor(b.valor)}`).join("; ")}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="fin-grafico-base" />
        {umbral != null && <line x1={pad.l} x2={W - pad.r} y1={y(umbral)} y2={y(umbral)} className="fin-grafico-umbral" />}
        {barras.map((b, i) => {
          const x = pad.l + i * bw + bw * 0.2;
          const w = bw * 0.6;
          const y0 = y(0);
          const y1 = y(b.valor);
          const arriba = Math.min(y0, y1);
          const h = Math.max(2, Math.abs(y1 - y0));
          const rr = Math.min(4, w / 2, h);
          // Extremo del dato redondeado, anclado a la línea base.
          const d =
            b.valor >= 0
              ? `M${x},${y0} V${arriba + rr} q0,-${rr} ${rr},-${rr} h${w - 2 * rr} q${rr},0 ${rr},${rr} V${y0} Z`
              : `M${x},${y0} V${arriba + h - rr} q0,${rr} ${rr},${rr} h${w - 2 * rr} q${rr},0 ${rr},-${rr} V${y0} Z`;
          const ly = b.valor >= 0 ? arriba - 7 : arriba + h + 14;
          const ly2 = b.valor >= 0 ? ly - 14 : ly + 13;
          return (
            <g key={`${b.nombre}-${i}`} className={`fin-grafico-barra ${b.mala ? "fin-grafico-mala" : ""}`} tabIndex={0}>
              <title>{b.detalle ?? `${b.nombre}: ${etiquetaValor(b.valor)}`}</title>
              <rect x={pad.l + i * bw} y={pad.t - 10} width={bw} height={alto - pad.t - pad.b + 20} fill="transparent" />
              <path d={d} />
              <text x={x + w / 2} y={ly} textAnchor="middle" className="fin-grafico-valor">
                {etiquetaValor(b.valor)}
              </text>
              {b.mala && b.malaTexto && (
                <text x={x + w / 2} y={ly2} textAnchor="middle" className="fin-grafico-valor">
                  {b.malaTexto}
                </text>
              )}
              <text x={x + w / 2} y={alto - 6} textAnchor="middle" className="fin-grafico-eje">
                {b.nombre}
              </text>
            </g>
          );
        })}
      </svg>
      {umbral != null && umbralTexto && (
        <p className="fin-grafico-leyenda">
          <i />
          {umbralTexto}
        </p>
      )}
    </div>
  );
}
