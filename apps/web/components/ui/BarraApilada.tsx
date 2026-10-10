// La barra apilada de CAYLA (ADR-0358, Felipe 2026-10-09, «P»): una barra que reparte un total en partes (la deuda por vencimiento, las
// unidades del piso por estado). Una sola pieza para todo el ERP (ya no queda ninguna barra apilada a mano: la vigila lib/unificar.test.ts); el registro, en docs/unificar/grafico.barra.md.
//
//   · La PISTA es de arena: dice «esto es el 100 %» y, vacía, «no hay nada». Los tramos son de un solo color de token (la clase la
//     pone quien la usa: `bg-verde`, `bg-tinta/25`…, nunca un hex) y se separan con un hilo de la misma arena.
//   · Tres altos en múltiplos de 4: 12 (un panel), 8 (dentro de una tarjeta de cifra) y 4 (un hilo junto a un número).
//   · Movimiento: entra creciendo de izquierda a derecha, un tramo tras otro (`anim-crece-x`) y, si una cifra cambia, los tramos se
//     reacomodan (700 ms): los dos vienen de «Deuda por vencimiento» de Compras (ADR-0128). Si RESPONDE, el tramo apuntado se estira
//     (1,35× para todas; las de 8 px de Compras lo hacían a 1,7×) y los demás bajan al 35 % (ya lo hacían «Concentración» de Proveedores y
//     Notas de crédito; a «Deuda por vencimiento» se le suma). Sin rebote ni bucle; con «reducir movimiento» queda quieta (CSS: barra-apilada.css).
//     Una barra que cambia mientras la persona escribe o marca (`viva`) deja todos sus tramos montados y solo los reacomoda; dentro de una
//     hoja (`sinEntrada`) no entra creciendo (ADR-0136).
//   · Dos voces para el lector de pantalla. Si solo se lee, es UNA imagen con su resumen y los números van al lado, en texto. Si
//     responde (se apunta, se toca para filtrar), el grupo lleva su resumen y cada tramo es un botón con su nombre. El área que siente
//     el mouse mide 24 px o más aunque la barra pinte 12, 8 o 4; con el dedo, el blanco de 44 px es la leyenda de al lado, que hace lo mismo.
//   · Un tramo de color translúcido (`bg-tinta/25`) se dibuja sobre SU PROPIA base de arena, no sobre lo que haya detrás: al estirarse
//     no se parte en franjas. Por eso el color va en una capa interna y las leyendas dibujan su cuadrito con `<MuestraTramo>`, que
//     hace lo mismo y así el cuadrito y el tramo tienen el mismo tono. Debajo de `/50`, un tinta no llega a 3:1 contra el hilo de arena
//     (WCAG 1.4.11): lo que dice la barra tiene que decirse también en texto (la leyenda, el resumen), como lo hacen todas.
//
// Sin JavaScript propio (ni hooks): sirve igual en un Server Component, y quien responde le pasa sus funciones desde un componente
// cliente. Qué cuenta cada tramo y qué pasa al tocarlo es de la pantalla, no de la barra.

import Link from "next/link";

export type SegmentoBarra = {
  clave: string;
  /** Para el resumen del lector de pantalla y el título al pasar el mouse. */
  nombre: string;
  valor: number;
  /** La clase del color del token (`bg-verde`, `bg-ambar`, `bg-tinta`, `bg-tinta/25`…). */
  clase?: string;
  /** El color como valor de CSS, cuando no cabe en una clase (un token por método de pago: `var(--color-metodo-efectivo)`). Nunca un hex. */
  color?: string;
  /** Lo que oye el lector de este tramo, si la pantalla lo dice mejor que «nombre: valor» («Textiles Sur: S/ 5,000, 62 % de la deuda»). */
  etiqueta?: string;
  /** El texto al pasar el mouse. Un tramo que solo se lee ya trae «nombre: valor»; uno que responde, ninguno si no se le da. */
  titulo?: string;
  /** El tramo lleva a otra pantalla: se dibuja como enlace (con `respuesta`, también apunta). */
  href?: string;
  /** En una barra que responde, este tramo no (el «Resto», «Otros»): se dibuja pero no apunta ni se toca. */
  inerte?: boolean;
  /** Este tramo no lo oye el lector (su valor ya está dicho en otro lado). */
  oculto?: boolean;
};

/** Lo que hace falta para que la barra RESPONDA: sus tramos pasan a ser botones (o enlaces). Sin esto, la barra solo se lee. */
export type RespuestaBarra = {
  /** Se apunta a un tramo (mouse o foco del teclado: su clave) o se suelta (`null`). */
  onApuntar?: (clave: string | null) => void;
  /** Se toca un tramo. */
  onElegir?: (clave: string) => void;
  /** La clave del tramo ya elegido (un filtro puesto): queda presionado y los demás bajan al 35 %. `null` si el filtro existe y no hay uno puesto;
   *  sin esta propiedad, los tramos no son interruptores (abren algo) y el lector no los oye como «presionado». */
  elegida?: string | null;
  /** La clave del tramo que la pantalla resalta SIN que sea un filtro (el proveedor apuntado en la lista de abajo): los demás bajan al
   *  35 %, pero ninguno queda «presionado» para el lector. */
  resaltada?: string | null;
  /** Lo que hace tocarlo, dicho para el lector: «Filtrar la lista». */
  accion?: string;
};

export function BarraApilada({
  segmentos,
  unidad = "unidades",
  etiqueta,
  formato,
  alto = 12,
  respuesta,
  retraso = 0,
  total: referencia,
  decorativa = false,
  viva = false,
  sinEntrada = false,
  className = "",
}: {
  segmentos: readonly SegmentoBarra[];
  /** Lo que se cuenta, para el resumen: «unidades», «prendas», «soles». */
  unidad?: string;
  /** El resumen entero para el lector, si la pantalla lo dice mejor que el automático («Deuda por vencimiento: Vencida S/ 5,133.60, …»). */
  etiqueta?: string;
  /** Cómo se dice una cifra en el resumen y en el texto al pasar el mouse (por ejemplo, `soles`). Por defecto, el número tal cual. */
  formato?: (valor: number) => string;
  /** 12 (un panel), 8 (dentro de una tarjeta de cifra) o 4 (un hilo junto a un número). */
  alto?: 12 | 8 | 4;
  respuesta?: RespuestaBarra;
  /** Cuántos pasos de 38 ms espera la entrada de los tramos: la barra de una tarjeta que entra escalonada llega después de su tarjeta. */
  retraso?: number;
  /** Lo que vale el 100 % de la pista, si no es la suma de los tramos (cuánto del monto de una nota está repartido): lo que falte queda
   *  de pista, vacío. Por defecto, la suma: la barra llena la pista. */
  total?: number;
  /** La barra no dice nada que no esté dicho al lado en texto: el lector no la oye (sin rol ni resumen) y no pone texto al pasar el mouse. */
  decorativa?: boolean;
  /** La barra cambia MIENTRAS la persona actúa (escribe un monto, marca una fila): sus tramos siguen montados aunque valgan 0 y solo se
   *  reacomodan, sin entrada ni recorte de esquinas por tramo, para que ninguno aparezca o desaparezca de golpe. */
  viva?: boolean;
  /** Sin la entrada creciendo (dentro de una hoja, donde ADR-0136 no deja agregar movimiento de entrada). Se reacomoda igual. */
  sinEntrada?: boolean;
  className?: string;
}) {
  const dice = formato ?? String;
  // Un valor que no es un número (NaN, Infinity) no cuenta: no borra la barra entera.
  const bueno = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const suma = segmentos.reduce((a, x) => a + bueno(x.valor), 0);
  const conValor = segmentos.filter((s) => bueno(s.valor) > 0);
  const resumen = suma > 0 ? conValor.map((s) => `${s.nombre}: ${dice(s.valor)}`).join(" · ") : `sin ${unidad}`;
  const dichoTodo = etiqueta ?? `${dice(suma)} ${unidad}. ${resumen}`;
  // Responde si la pantalla lo pide o si algún tramo es un enlace; una barra decorativa nunca (sus tramos serían enfocables dentro de algo oculto).
  const responde = !decorativa && (!!(respuesta && (respuesta.onApuntar || respuesta.onElegir)) || segmentos.some((s) => s.href && !s.inerte));
  const elegida = respuesta?.elegida ?? null;
  // Quién baja al 35 %: los que no son el elegido o el resaltado.
  const destacada = respuesta?.resaltada ?? elegida;
  // Cada tramo crece por su PARTE de la pista (suma 100): así la llena aunque las cifras sumen menos de 1. Si la pista vale más que los
  // tramos (`total`), lo que falta es un hueco invisible al final: la pista de arena se ve.
  const pista = Math.max(Number.isFinite(referencia as number) ? (referencia as number) : suma, suma);
  const parte = (v: number) => (pista > 0 ? (bueno(v) / pista) * 100 : 0);
  const resto = pista > suma && suma > 0 ? ((pista - suma) / pista) * 100 : 0;
  const tramos = viva ? segmentos : conValor;
  const entrada = viva || sinEntrada ? "" : " anim-crece-x";
  const raiz = ["barra-apilada", className].filter(Boolean).join(" ");
  const raizProps = decorativa ? { "aria-hidden": true as const } : { role: responde ? "group" : "img", "aria-label": dichoTodo };

  return (
    // Un <span> con `display: flex` (barra-apilada.css): válido dentro de un <span>, un <p> o un <button>, donde un <div> no lo es. Soltar el
    // mouse de la barra entera (no de cada tramo) es lo que suelta el resaltado: cruzar el hilo entre dos tramos no lo apaga un instante.
    <span
      {...raizProps}
      data-alto={alto}
      data-viva={viva ? "" : undefined}
      onMouseLeave={responde && respuesta?.onApuntar ? () => respuesta.onApuntar?.(null) : undefined}
      className={raiz}
    >
      {tramos.map((s, i) => {
        const estilo = { flexGrow: parte(s.valor), ["--i" as string]: retraso + i };
        const capa = <i aria-hidden className={["barra-tramo-color", s.clase].filter(Boolean).join(" ")} style={s.color ? { background: s.color } : undefined} />;
        const apagado = destacada !== null && destacada !== s.clave ? "" : undefined;
        const cero = bueno(s.valor) === 0 ? "" : undefined;
        if (!responde || s.inerte) {
          return (
            <span
              key={s.clave}
              title={s.titulo ?? (responde || decorativa ? undefined : `${s.nombre}: ${dice(s.valor)}`)}
              aria-label={s.etiqueta}
              aria-hidden={s.oculto || undefined}
              data-apagado={apagado}
              data-cero={cero}
              onMouseEnter={responde && respuesta?.onApuntar ? () => respuesta.onApuntar?.(null) : undefined}
              className={`barra-tramo${entrada}`}
              style={estilo}
            >
              {capa}
            </span>
          );
        }
        const comunes = {
          title: s.titulo,
          "aria-label": s.etiqueta ?? `${s.nombre}: ${dice(s.valor)}${respuesta?.accion ? `. ${respuesta.accion}` : ""}`,
          "data-apagado": apagado,
          "data-cero": cero,
          onMouseEnter: () => respuesta?.onApuntar?.(s.clave),
          onFocus: () => respuesta?.onApuntar?.(s.clave),
          onBlur: () => respuesta?.onApuntar?.(null),
          onClick: respuesta?.onElegir ? () => respuesta.onElegir?.(s.clave) : undefined,
          className: `barra-tramo${entrada}`,
          style: estilo,
        };
        if (s.href) {
          return (
            <Link key={s.clave} href={s.href} {...comunes}>
              {capa}
            </Link>
          );
        }
        return (
          // «Presionado» solo existe si la pantalla maneja un filtro (`elegida`, aunque sea `null`): un tramo que abre algo no es un interruptor.
          <button key={s.clave} type="button" aria-pressed={respuesta?.elegida !== undefined ? elegida === s.clave : undefined} {...comunes}>
            {capa}
          </button>
        );
      })}
      {(viva || resto > 0.01) && <span aria-hidden className="barra-resto" style={{ flexGrow: resto }} />}
    </span>
  );
}

/** El cuadrito de color de una leyenda: sobre la misma base de arena que el tramo, para que los dos se vean del mismo tono. */
export function MuestraTramo({ clase, color, className = "" }: { clase?: string; color?: string; className?: string }) {
  return (
    <span aria-hidden className={["barra-muestra", className].filter(Boolean).join(" ")}>
      <i className={["barra-tramo-color", clase].filter(Boolean).join(" ")} style={color ? { background: color } : undefined} />
    </span>
  );
}
