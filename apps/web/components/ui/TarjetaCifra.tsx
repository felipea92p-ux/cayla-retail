import Link from "next/link";
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
   `accion` dibuja el enlace al pie ("Ver detalle →"), en tinta y subrayado.
   Antes iba en rojo; con el borde `acento` ya visible (ADR-0105) Resumen mostraba
   5 rojos y MAX_ROJO_POR_PANTALLA es 2. El rojo de la tarjeta es el borde: lo
   que "pide algo" se ve por el borde, no por cuatro enlaces iguales.
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
  children?: ReactNode;
}) {
  const clase = `card-cayla block p-5 text-left transition-colors ${acento ? "border-l-2 border-l-rojo" : ""} ${
    onClick || href ? "hover:bg-sand/30" : ""
  } ${activa ? "bg-sand/40" : ""}`;

  const contenido = (
    <>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor}</span>
        {unidad && <span className="text-sm text-tinta/55">{unidad}</span>}
      </p>
      {children && <p className="mt-1 text-xs text-tinta/65">{children}</p>}
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
