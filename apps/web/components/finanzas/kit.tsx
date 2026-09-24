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
