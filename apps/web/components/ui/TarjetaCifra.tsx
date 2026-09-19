import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/* ====================================================================
   TarjetaCifra · una etiqueta, un número grande, una línea de contexto
   (2026-09-17, ADR-0101)

   Es la tarjeta de resumen que Existencias, Traslados, Conteo y
   Movimientos dibujan cada uno con su copia local de `Tarjeta`
   (InventarioPanel.tsx:453 y compañía). Se extrae acá, con la misma
   receta (card-cayla p-5, label en versalitas, serif text-3xl, contexto
   en text-xs), para que Resumen no sea la quinta copia — y para que las
   otras cuatro puedan migrar sin cambiar de aspecto.

   `valor` acepta texto: un "—" o "98.4%" es tan válido como un número.
   `accion` dibuja el enlace rojo al pie ("Ver detalle →") — el único
   rojo permitido en una tarjeta que pide algo.

   `compacta` + `icono` (2026-09-18, Traslados): la misma tarjeta en una
   fila baja — ícono a la izquierda, cifra más chica, contexto en una línea
   y una flecha si se puede tocar. Para pantallas donde la fila de tarjetas
   es una franja de estado y no puede comerse la altura que le toca a la
   lista. Sin esas dos props la tarjeta se dibuja exactamente igual que
   antes.
   ==================================================================== */

type Accion = { texto: string } & ({ href: string } | { onClick: () => void });

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
  icono,
  compacta = false,
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
  /** Solo con `compacta`: el ícono (ya con su disco y colores) a la izquierda. */
  icono?: ReactNode;
  /** Fila baja, con ícono y flecha (ver arriba). */
  compacta?: boolean;
  children?: ReactNode;
}) {
  const clase = `card-cayla block ${compacta ? "p-4" : "p-5"} text-left transition-colors ${acento ? "border-l-2 border-l-rojo" : ""} ${
    onClick || href ? "hover:bg-sand/30" : ""
  } ${activa ? "bg-sand/40" : ""}`;

  const contenido = compacta ? (
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
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor}</span>
        {unidad && <span className="text-sm text-tinta/55">{unidad}</span>}
      </p>
      {children && <p className="mt-1 text-xs text-tinta/65">{children}</p>}
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
