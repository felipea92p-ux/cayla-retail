import Link from "next/link";
import type { ReactNode } from "react";

/* ====================================================================
   TarjetaCifra · una etiqueta, un número grande, una línea de contexto
   (2026-09-17, ADR-0101; extendida 2026-09-18, ADR-0104)

   Es la tarjeta de resumen que Existencias, Traslados, Conteo y
   Movimientos dibujan cada uno con su copia local de `Tarjeta`
   (InventarioPanel.tsx:453 y compañía). Se extrae acá, con la misma
   receta (card-cayla p-5, label en versalitas, serif text-3xl, contexto
   en text-xs), para que Resumen no sea la quinta copia — y para que las
   otras cuatro puedan migrar sin cambiar de aspecto.

   `valor` acepta texto: un "—" o "98.4%" es tan válido como un número.
   `accion` dibuja el enlace rojo al pie ("Ver detalle →") — el único
   rojo permitido en una tarjeta que pide algo.

   ADR-0104 (Compras): el módulo tenía CINCO copias de esta tarjeta
   (`Indicador` en /compras, `Cifra` en /compras/por-pagar y en el detalle,
   `TarjetaIndicador`, y esta). Migran a esta; para eso se le suman cuatro
   cosas opcionales, ninguna cambia lo que ya dibujaba:
   - `punto`: el puntito de color junto a la etiqueta que adelanta el estado
     antes de leer la cifra (ámbar = a medias, verde = bien, rojo = actuar).
   - `detalleTono`: el color de la línea de contexto por separado del número
     (típico: número en tinta y «2 vencidas · S/ 6,670.00 →» en rojo).
   - `compacta`: p-4 en lugar de p-5, para las franjas de 4 indicadores.
   - `vacia`: borde punteado y número apagado — «todavía no hay datos», con
     la razón en `children`. Un dato que aún no existe se dice, no se inventa.
   ==================================================================== */

type Accion = { texto: string } & ({ href: string } | { onClick: () => void });

export type PuntoCifra = "neutro" | "ambar" | "verde" | "rojo";

// Mismo vocabulario semántico que `Chip`: verde = va bien, ámbar = a medias,
// rojo = hay que actuar. Nunca un color nuevo.
const PUNTO: Record<PuntoCifra, string> = {
  neutro: "bg-tinta/25",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
};

export function TarjetaCifra({
  etiqueta,
  valor,
  unidad,
  tono,
  acento = false,
  activa = false,
  href,
  onClick,
  accion,
  punto,
  detalleTono,
  compacta = false,
  vacia = false,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  unidad?: string;
  /** Clase de color del número (`text-rojo`, `text-ambar-profundo`…); por defecto tinta. */
  tono?: string;
  /** Borde izquierdo en rojo: la tarjeta que pide algo. */
  acento?: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  accion?: Accion;
  /** Puntito de color junto a la etiqueta. Sin esta prop no se dibuja. */
  punto?: PuntoCifra;
  /** Clase de color de la línea de contexto (`text-rojo`, `text-ambar-profundo`, `text-verde-profundo`). */
  detalleTono?: string;
  /** p-4 en lugar de p-5: las franjas de 4 indicadores de Compras. */
  compacta?: boolean;
  /** Borde punteado y número apagado: «todavía no hay datos». */
  vacia?: boolean;
  children?: ReactNode;
}) {
  const clase = `card-cayla block ${compacta ? "p-4" : "p-5"} text-left transition-colors ${acento ? "border-l-2 border-l-rojo" : ""} ${
    vacia ? "border-dashed !bg-transparent" : ""
  } ${onClick || href ? "hover:bg-sand/30" : ""} ${activa ? "bg-sand/40" : ""}`;

  const contenido = (
    <>
      <p className="label-cayla flex items-center gap-[7px] text-[11px] text-tinta/65">
        {punto && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[punto]}`} />}
        {etiqueta}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${vacia ? "text-tinta/45" : (tono ?? "text-tinta")}`}>{valor}</span>
        {unidad && <span className="text-sm text-tinta/55">{unidad}</span>}
      </p>
      {children && <p className={`mt-1 text-xs ${detalleTono ?? "text-tinta/65"}`}>{children}</p>}
      {accion &&
        ("href" in accion ? (
          <Link href={accion.href} className="label-cayla mt-3 inline-block text-[11px] text-rojo underline-offset-2 hover:underline">
            {accion.texto} →
          </Link>
        ) : (
          <button
            type="button"
            onClick={accion.onClick}
            className="label-cayla mt-3 inline-block text-[11px] text-rojo underline-offset-2 hover:underline"
          >
            {accion.texto} →
          </button>
        ))}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={clase}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clase} w-full`} aria-pressed={activa}>
        {contenido}
      </button>
    );
  }
  return <div className={clase}>{contenido}</div>;
}
