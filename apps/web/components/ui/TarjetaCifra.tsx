import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/* ====================================================================
   TarjetaCifra · una etiqueta, un número grande, una línea de contexto
   (2026-09-17, ADR-0101; extendida 2026-09-18, ADR-0111)

   Es la tarjeta de resumen que Existencias, Traslados, Conteo y
   Movimientos dibujan cada uno con su copia local de `Tarjeta`
   (InventarioPanel.tsx:453 y compañía). Se extrae acá, con la misma
   receta (card-cayla p-5, label en versalitas, serif text-3xl, contexto
   en text-xs), para que Resumen no sea la quinta copia — y para que las
   otras cuatro puedan migrar sin cambiar de aspecto.

   `valor` acepta texto: un "—" o "98.4%" es tan válido como un número.
   `accion` dibuja el enlace al pie ("Ver detalle →"), en tinta y subrayado.
   Antes iba en rojo; con el borde `acento` ya visible (ADR-0105) Resumen mostraba
   5 rojos y MAX_ROJO_POR_PANTALLA es 2. El rojo de la tarjeta es el borde: lo
   que "pide algo" se ve por el borde, no por cuatro enlaces iguales.

   ADR-0111 (Compras): el módulo tenía CINCO copias de esta tarjeta
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

   `acentoTrazo` y `puntoPulsa` (2026-09-19, Por pagar): la misma tarjeta que «pide algo», pero el
   filete rojo se DIBUJA al llegar (crece desde arriba, ya sin ocupar el borde) y el puntito emite dos
   ondas y se queda quieto. Es la entrada de la pantalla, no un adorno: pasa una vez y no se repite.

   `fila` + `icono` (2026-09-18, Traslados): la misma tarjeta en una fila
   baja — ícono a la izquierda, cifra más chica, contexto en una línea y una
   flecha si se puede tocar. Para pantallas donde la fila de tarjetas es una
   franja de estado y no puede comerse la altura que le toca a la lista. Sin
   `fila` la tarjeta se dibuja exactamente igual que antes.
   (En Traslados esta variante se llamó `compacta`; al unir las dos ramas se
   renombró `fila`, porque `compacta` ya significaba «p-4» en las ~30
   tarjetas de Compras.)
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
  acentoTrazo = false,
  puntoPulsa = false,
  activa = false,
  href,
  onClick,
  accion,
  punto,
  vivo = false,
  detalleTono,
  icono,
  compacta = false,
  fila = false,
  vacia = false,
  className = "",
  style,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  unidad?: string;
  /** Clase de color del número (`text-rojo`, `text-ambar-profundo`…); por defecto tinta. */
  tono?: string;
  /** Borde izquierdo en rojo: la tarjeta que pide algo. */
  acento?: boolean;
  /** Como `acento`, pero el filete se dibuja al llegar la tarjeta (crece desde arriba). Excluyente con `acento`. */
  acentoTrazo?: boolean;
  /** El puntito emite dos ondas al llegar la tarjeta. Solo con `punto`. */
  puntoPulsa?: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  accion?: Accion;
  /** Puntito de color junto a la etiqueta. Sin esta prop no se dibuja. */
  punto?: PuntoCifra;
  /** El puntito late (`punto-vivo`): lo que pide atención ahora. Solo con `punto`. */
  vivo?: boolean;
  /** Clase de color de la línea de contexto (`text-rojo`, `text-ambar-profundo`, `text-verde-profundo`). */
  detalleTono?: string;
  /** Solo con `fila`: el ícono (ya con su disco y colores) a la izquierda. */
  icono?: ReactNode;
  /** p-4 en lugar de p-5: las franjas de 4 indicadores de Compras. */
  compacta?: boolean;
  /** Fila baja, con ícono y flecha (ver arriba). */
  fila?: boolean;
  /** Borde punteado y número apagado: «todavía no hay datos». */
  vacia?: boolean;
  /** Clases extra (típico: `anim-entra` de la entrada escalonada). */
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const clase = `card-cayla block ${compacta || fila ? "p-4" : "p-5"} text-left transition-colors ${acento ? "border-l-2 border-l-rojo" : ""} ${acentoTrazo ? "relative overflow-hidden" : ""} ${
    vacia ? "border-dashed bg-transparent" : ""
  } ${onClick || href ? "hover:bg-sand/30" : ""} ${activa ? "bg-sand/40" : ""} ${className}`;

  const contenido = fila ? (
    <span className="flex items-center gap-3">
      {icono}
      <span className="min-w-0 flex-1">
        <span className="label-cayla block text-[11px] text-tinta/65">{etiqueta}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className={`font-display text-2xl tabular-nums ${tono ?? "text-tinta"}`}>{valor}</span>
          {unidad && <span className="text-sm text-tinta/55">{unidad}</span>}
        </span>
        {children && <span className="mt-0.5 block text-xs text-tinta/65">{children}</span>}
      </span>
      {(onClick || href) && <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/40" />}
    </span>
  ) : (
    <>
      {acentoTrazo && <span aria-hidden className="anim-crece-y absolute bottom-3.5 left-0 top-3.5 w-0.5 origin-top rounded-sm bg-rojo" style={{ ["--i" as string]: 10 }} />}
      <p className="label-cayla flex items-center gap-[7px] text-[11px] text-tinta/65">
        {punto && (
          <span aria-hidden className={`relative h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[punto]} ${vivo ? "punto-vivo" : ""}`}>
            {puntoPulsa && <span className={`anim-vivo-onda pointer-events-none absolute inset-0 rounded-full ${PUNTO[punto]}`} style={{ animationDelay: "1400ms" }} />}
          </span>
        )}
        {etiqueta}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${vacia ? "text-tinta/45" : (tono ?? "text-tinta")}`}>{valor}</span>
        {unidad && <span className="text-sm text-tinta/55">{unidad}</span>}
      </p>
      {/* `div` y no `p`: el contexto puede llevar una barra dentro (Concentración de Por pagar) y un bloque no cabe en un párrafo. */}
      {children && <div className={`mt-1 text-xs ${detalleTono ?? "text-tinta/65"}`}>{children}</div>}
      {accion &&
        ("href" in accion ? (
          <Link href={accion.href} className="label-cayla mt-3 inline-block text-[11px] text-tinta underline underline-offset-2 hover:no-underline">
            {accion.texto} →
          </Link>
        ) : (
          <button
            type="button"
            onClick={accion.onClick}
            className="label-cayla mt-3 inline-block text-[11px] text-tinta underline underline-offset-2 hover:no-underline"
          >
            {accion.texto} →
          </button>
        ))}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={clase} style={style}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clase} w-full`} aria-pressed={activa} style={style}>
        {contenido}
      </button>
    );
  }
  return (
    <div className={clase} style={style}>
      {contenido}
    </div>
  );
}
