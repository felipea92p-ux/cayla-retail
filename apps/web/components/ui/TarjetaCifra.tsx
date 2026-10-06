import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/* ====================================================================
   TarjetaCifra · LA tarjeta de cifra del ERP: un nombre, un número grande y una línea de contexto
   (nació el 2026-09-17, ADR-0101; ADR-0111 la hizo la única de Compras; ADR-0169 le dio la cara oficial).

   Desde el 2026-10-06 es la ÚNICA pieza de la familia «Tarjetas de cifra» (/unificar, ADR-0358: «una función, una
   pieza»). Felipe eligió «la de Compras, una marca por función» (docs/unificar/propuestas/cifra.html, ronda 1). La cara
   no cambia; lo que cambia es que cada cosa que hace una cifra se ve antes de tocarla:

   - INFORMA (sin `href` ni `onClick`): un <div>, sin marca, no reacciona al mouse.
   - LLEVA a otra pantalla, pestaña, vista u hoja (`href`, u `onClick` sin `activa`): un <a> o un <button> SIN
     aria-pressed, y la flecha ArrowRight de lucide que pone ESTA pieza a la derecha del último renglón con texto (el
     pie; si no hay, el contexto; si no, el del número), en una fila flex para que nunca baje sola de renglón. Las
     pantallas ya no escriben «→» a mano: el subconjunto de DM Sans que sirve el ERP no trae U+2192 y la dibujaba la
     fuente del aparato. Encima: fondo arena al 30 %, como la B, sin moverse.
   - FILTRA la lista de la misma pantalla (`onClick` + `activa`, aunque sea `false`): <button aria-pressed>; puesta, fondo
     arena al 40 % (la cara de la B). Sin flecha: la flecha dice «te lleva a otro lado». aria-pressed va SOLO aquí (antes
     `activa` valía `false` por defecto y Gastos, Notas de crédito, Activos y Recibir se anunciaban como un interruptor
     apagado). El 2026-10-06 la pieza escribía «Toca para filtrar» y ponía un contorno de tinta; al verlo, Felipe eligió
     la B tal cual (2026-10-06) y se quitaron.
   - SIN DATO (`valor={null}`): una sola forma. Borde punteado, sin fondo, «—» en tinta/65 (5,14:1 sobre crema; el
     tinta/45 de antes daba 2,86:1) y su motivo OBLIGATORIO en `children` (los tipos lo exigen). Un cero es un dato y se
     ve normal. Reemplaza `vacia`, el «—» suelto, el «Sin meta» en el lugar del número y las copias en tinta/45.
   - NO SE PUDO LEER (`valor={null}` + `noSePudoLeer`): borde entero, el mismo «—» y la frase en tinta. No falta un
     dato: falló la lectura (principio 9: se degrada con gracia, y la persona sabe cuál de las dos cosas pasó).

   La receta (de la B, la de Compras): card-cayla (papel, filo sand, radio 16, sin sombra), relleno de 16 px arriba y
   abajo y 20 a los lados (bajo 640 px, 16 en todo: el nombre cae en la misma vertical que los títulos de la `Tabla`,
   px-5). El nombre en label-cayla de 11 px 700 taupe con su punto de 6 px; el número en serif 600 de 28 px, lining y
   tabular, que no se parte y baja a 22 px solo cuando el contenido de SU tarjeta mide menos de 148 px (container
   query: «S/ 42,586.80» a 28 px mide 144). La unidad en taupe (la tinta/55 de antes daba 3,83:1, bajo AA). El contexto
   en 12 px taupe, con `detalleTono`; el delta («2.ª mitad ↑ 18%», «▲ 12% vs. martes pasado») es su primera línea, con
   su tono, nunca en rojo (ADR-0169: máximo 2 rojos por pantalla). Foco: el anillo único de ADR-0351 (no se escribe aquí).

   Lo que se sumó para que migraran la G (TarjetaIndicador, la tarjeta del Inicio, Comercial y Calidad) y la C
   (TarjetaCifraAnalisis de Análisis), que se fueron: `ayuda` (el (!) de <Ayuda>, pegado a la ÚLTIMA palabra del nombre
   para que nunca quede solo en un renglón; reemplaza la ayuda por `title`, que con el dedo no aparecía), `antes`
   («A → B» de Comparar: A chica en taupe) y `pie` (la última línea, pegada abajo: en una fila de cuatro queda a la
   misma altura). `accion` es un btn-enlace de 24 px de alto con la flecha (el enlace de 11 px de antes medía 16).
   Una cifra que se toca entera no lleva adentro ni (!) ni acción: un control dentro de otro no es HTML válido.

   Se fueron `compacta` (el relleno es uno solo), `fila` + `icono` (nadie las usaba), `vacia` (es `valor={null}`) y el
   `activa` en sand/40 (no se distinguía del encima: 1,02:1).

   Quedan como estaban, opt-in, hasta que Felipe decida (la propuesta las deja fuera): `viva` (se alza y la cruza un
   barrido de luz al pasar el mouse; la flecha de la pieza se corre 4 px, ADR-0136), `acentoTrazo` y `puntoPulsa` (Por
   pagar, 2026-09-19), `acento` (el filete rojo, ADR-0105) y `vivo` (el punto que late). `reparto` dibuja bajo el contexto
   una barra fina que se llena una vez (qué parte del total es lo urgente); es lectura, va `aria-hidden`.
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

type PropsComunes = {
  etiqueta: string;
  unidad?: string;
  /** Clase de color del número (`text-rojo`, `text-ambar-profundo`…); por defecto tinta. */
  tono?: string;
  /** Solo en Comparar: la cifra de A, que va chica y en taupe delante de la de B («A → B»). */
  antes?: ReactNode;
  /** Puntito de color junto al nombre. Sin esta prop no se dibuja. */
  punto?: PuntoCifra;
  /** Clase de color de la línea de contexto (`text-rojo`, `text-ambar-profundo`, `text-verde-profundo`). */
  detalleTono?: string;
  /** El (!) de <Ayuda> (la de siempre), pegado a la última palabra del nombre. Solo en la cifra que informa. */
  ayuda?: ReactNode;
  /** La última línea, pegada abajo: el desglose, la base de la cifra. No en la que filtra (su pie lo pone la pieza). */
  pie?: ReactNode;
  /** El siguiente paso al pie, como btn-enlace con flecha. Solo en la cifra que informa. */
  accion?: Accion;
  /** La cifra LLEVA a otra pantalla. */
  href?: string;
  /** Sin `activa`: la cifra LLEVA (cambia la pestaña, la vista, abre una hoja). Con `activa`: la cifra FILTRA la lista. */
  onClick?: () => void;
  /** Solo con `onClick`: la cifra es un filtro, y `true` = está puesto. Sin `onClick` no significa nada. */
  activa?: boolean;
  /** Barra fina bajo el contexto: `fraccion` (0–1) es lo urgente del total; se llena una vez al aparecer. */
  reparto?: { fraccion: number; tono: "rojo" | "ambar" };
  /** Borde izquierdo en rojo: la tarjeta que pide algo (opt-in por decidir, ADR-0105). */
  acento?: boolean;
  /** Como `acento`, pero el filete se dibuja al llegar la tarjeta (crece desde arriba). Excluyente con `acento`. */
  acentoTrazo?: boolean;
  /** El puntito emite dos ondas al llegar la tarjeta. Solo con `punto`. */
  puntoPulsa?: boolean;
  /** El puntito late (`punto-vivo`). Solo con `punto`. */
  vivo?: boolean;
  /** Tarjeta que se toca: se levanta y recibe un barrido de luz al pasar el mouse. Sin `href`/`onClick` no hace nada. */
  viva?: boolean;
  id?: string;
  /** Clases extra (típico: `anim-entra` de la entrada escalonada, `col-span-2`). */
  className?: string;
  style?: CSSProperties;
};

/** Hay dato: el contexto es opcional. */
type ConDato = { valor: NonNullable<ReactNode>; noSePudoLeer?: never; children?: ReactNode };
/** Puede no haber dato (`valor={null}`): entonces el motivo (`children`) es obligatorio. */
type SinDato = { valor: ReactNode; noSePudoLeer?: boolean; children: ReactNode };

export type PropsTarjetaCifra = PropsComunes & (ConDato | SinDato);

/** La flecha de «lleva». Con `viva` se corre 4 px al pasar el mouse (`.cmp-flecha`, el opt-in de siempre). */
function Flecha({ viva, className = "" }: { viva: boolean; className?: string }) {
  return <ArrowRight aria-hidden strokeWidth={2} className={`h-3.5 w-3.5 shrink-0 text-tinta ${viva ? "cmp-flecha" : ""} ${className}`} />;
}

/** El nombre con el (!) pegado a su última palabra: el botón nunca queda solo en un renglón. El corte entre la palabra y
 *  el (!) lo decide el `nowrap` de afuera (su ancestro común); el `whitespace-normal` de adentro deja que el globo de la
 *  explicación se parta en renglones como siempre. */
function nombreConAyuda(etiqueta: string, ayuda: ReactNode) {
  const corte = etiqueta.lastIndexOf(" ");
  return (
    <>
      {corte >= 0 ? etiqueta.slice(0, corte + 1) : ""}
      <span className="whitespace-nowrap">
        {corte >= 0 ? etiqueta.slice(corte + 1) : etiqueta}
        <span className="whitespace-normal">{ayuda}</span>
      </span>
    </>
  );
}

export function TarjetaCifra(props: PropsTarjetaCifra) {
  const {
    etiqueta,
    valor,
    unidad,
    tono,
    antes,
    punto,
    detalleTono,
    ayuda,
    pie,
    accion,
    href,
    onClick,
    activa,
    reparto,
    acento = false,
    acentoTrazo = false,
    puntoPulsa = false,
    vivo = false,
    viva = false,
    noSePudoLeer = false,
    id,
    className = "",
    style,
    children,
  } = props;

  const filtra = Boolean(onClick) && activa !== undefined;
  const lleva = !filtra && Boolean(href || onClick);
  const tocable = filtra || lleva;
  const puesta = filtra && activa === true;
  const sinDato = valor === null || valor === undefined;
  const fallo = sinDato && noSePudoLeer;
  const esViva = viva && tocable;

  const clase = [
    "card-cayla @container flex flex-col p-4 text-left sm:px-5",
    tocable ? "w-full cursor-pointer" : "",
    // `viva` no lleva la transición de utilidad: le ganaría a la de `.alza-cayla` y la tarjeta no se levantaría con suavidad.
    esViva ? "alza-cayla cmp-viva" : tocable ? "transition-[background-color,border-color] duration-200 ease-cayla motion-reduce:transition-none" : "",
    // El encima y la puesta de la B, la tarjeta de Compras que eligió Felipe (2026-10-06): fondo arena al 30 % al pasar el
    // mouse y al 40 % la que está filtrando.
    tocable && !puesta ? "hover:bg-sand/30" : "",
    puesta ? "bg-sand/40" : "",
    sinDato && !fallo ? "border-dashed bg-transparent" : "",
    acento ? "border-l-2 border-l-rojo" : "",
    acentoTrazo ? "relative overflow-hidden" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const tonoContexto = fallo ? "text-tinta" : (detalleTono ?? "text-taupe");
  const conAyuda = Boolean(ayuda) && !tocable;
  const conAccion = accion && !tocable;
  const piePropio = pie;
  // La flecha de «lleva» va a la derecha del ÚLTIMO renglón con texto: el pie, si no el contexto, si no el del número.
  const flechaEn: "pie" | "contexto" | "valor" | null = !lleva ? null : piePropio ? "pie" : children ? "contexto" : "valor";

  const contenido = (
    <>
      {acentoTrazo && <span aria-hidden className="anim-crece-y absolute bottom-3.5 left-0 top-3.5 w-0.5 origin-top rounded-sm bg-rojo" style={{ ["--i" as string]: 10 }} />}
      {/* 20 px de alto (leading-5): el (!) de 20 px cabe sin empujar el renglón, y las cifras de una fila quedan parejas. */}
      <p className="label-cayla block min-h-5 text-[11px] font-bold leading-5 text-taupe">
        {punto && (
          <span aria-hidden className={`relative -top-px mr-[7px] inline-block h-1.5 w-1.5 rounded-full align-middle ${PUNTO[punto]} ${vivo ? "punto-vivo" : ""}`}>
            {puntoPulsa && <span className={`anim-vivo-onda pointer-events-none absolute inset-0 rounded-full ${PUNTO[punto]}`} style={{ animationDelay: "1400ms" }} />}
          </span>
        )}
        {conAyuda ? nombreConAyuda(etiqueta, ayuda) : etiqueta}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        {antes !== undefined && antes !== null && (
          <span className="font-display inline-flex items-baseline gap-1.5 whitespace-nowrap text-[17px] leading-tight text-taupe lining-nums tabular-nums @max-[148px]:text-[15px]">
            <span className="sr-only">Período A: </span>
            {antes}
            <ArrowRight aria-hidden strokeWidth={2} className="h-[13px] w-[13px] self-center text-tinta/45" />
          </span>
        )}
        <span
          className={`font-display whitespace-nowrap text-[28px] leading-tight lining-nums tabular-nums @max-[148px]:text-[22px] ${
            sinDato ? "text-tinta/65" : (tono ?? "text-tinta")
          }`}
        >
          {sinDato ? (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">{fallo ? "No se pudo leer" : "Sin dato"}</span>
            </>
          ) : (
            <>
              {antes !== undefined && antes !== null && <span className="sr-only">Período B: </span>}
              {valor}
            </>
          )}
        </span>
        {unidad && !sinDato && <span className="whitespace-nowrap text-sm text-taupe">{unidad}</span>}
        {flechaEn === "valor" && <Flecha viva={esViva} className="ml-auto self-center" />}
      </p>
      {/* `div` y no `p`: el contexto puede llevar una barra dentro (Concentración de Por pagar) y un bloque no cabe en un párrafo. */}
      {children &&
        (flechaEn === "contexto" ? (
          <div className={`mt-1 flex items-end gap-1 text-xs ${tonoContexto}`}>
            <div className="min-w-0 flex-1">{children}</div>
            <Flecha viva={esViva} className="mb-px" />
          </div>
        ) : (
          <div className={`mt-1 text-xs ${tonoContexto}`}>{children}</div>
        ))}
      {reparto && (
        <span aria-hidden className="cmp-reparto">
          <i className={reparto.tono === "rojo" ? "cmp-reparto-rojo" : "cmp-reparto-ambar"} style={{ "--p": Math.min(1, Math.max(0, reparto.fraccion)) } as CSSProperties} />
        </span>
      )}
      {(piePropio || conAccion) && (
        <div className={`mt-auto pt-2 text-xs ${puesta ? "font-semibold text-tinta" : "text-taupe"}`}>
          {flechaEn === "pie" ? (
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">{piePropio}</div>
              <Flecha viva={esViva} className="mb-px" />
            </div>
          ) : (
            piePropio
          )}
          {conAccion && (
            <div className={piePropio ? "mt-1" : ""}>
              {"href" in accion ? (
                <Link href={accion.href} className="btn-cayla btn-enlace min-h-6 justify-start gap-1">
                  {accion.texto}
                  <ArrowRight aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <button type="button" onClick={accion.onClick} className="btn-cayla btn-enlace min-h-6 justify-start gap-1">
                  {accion.texto}
                  <ArrowRight aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} id={id} className={clase} style={style}>
        {contenido}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" id={id} onClick={onClick} className={clase} aria-pressed={filtra ? puesta : undefined} style={style}>
        {contenido}
      </button>
    );
  }
  return (
    <div id={id} className={clase} style={style}>
      {contenido}
    </div>
  );
}
