// La barra apilada de CAYLA (ADR-0358, Felipe 2026-10-09, «P»): una barra que reparte un total en partes (la deuda por vencimiento, las
// unidades del piso por estado). Una sola pieza para el ERP, que se migra módulo por módulo: lo que falta, en docs/unificar/grafico.barra.md.
//
//   · La PISTA es de arena: dice «esto es el 100 %» y, vacía, «no hay nada». Los tramos son de un solo color de token (la clase la
//     pone quien la usa: `bg-verde`, `bg-tinta/25`…, nunca un hex) y se separan con un hilo de la misma arena.
//   · Tres altos en múltiplos de 4: 12 (un panel), 8 (dentro de una tarjeta de cifra) y 4 (un hilo junto a un número).
//   · Movimiento: entra creciendo de izquierda a derecha, un tramo tras otro (`anim-crece-x`) y, si una cifra cambia, los tramos se
//     reacomodan (700 ms): los dos vienen de «Deuda por vencimiento» de Compras (ADR-0128). Si RESPONDE, el tramo apuntado se estira a
//     1,35× (también de Compras) y los demás bajan al 35 % (ya lo hacía «Concentración» de Proveedores; a «Deuda por vencimiento» se le
//     suma). Sin rebote ni bucle; con «reducir movimiento» queda quieta (CSS: barra-apilada.css).
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

export type SegmentoBarra = {
  clave: string;
  /** Para el resumen del lector de pantalla y el título al pasar el mouse. */
  nombre: string;
  valor: number;
  /** La clase del color del token (`bg-verde`, `bg-ambar`, `bg-tinta`, `bg-tinta/25`…). */
  clase: string;
};

/** Lo que hace falta para que la barra RESPONDA: sus tramos pasan a ser botones. Sin esto, la barra solo se lee. */
export type RespuestaBarra = {
  /** Se apunta a un tramo (mouse o foco del teclado: su clave) o se suelta (`null`). */
  onApuntar?: (clave: string | null) => void;
  /** Se toca un tramo. */
  onElegir?: (clave: string) => void;
  /** La clave del tramo ya elegido (un filtro puesto): los demás bajan al 35 %. `null` o nada si no hay filtro. */
  elegida?: string | null;
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
  className = "",
}: {
  segmentos: readonly SegmentoBarra[];
  /** Lo que se cuenta, para el resumen: «unidades», «prendas», «soles». */
  unidad?: string;
  /** El resumen entero para el lector, si la pantalla lo dice mejor que el automático («Deuda por vencimiento: Vencida S/ 5,133.60, …»). */
  etiqueta?: string;
  /** Cómo se dice una cifra en el resumen (por ejemplo, `soles`). Por defecto, el número tal cual. */
  formato?: (valor: number) => string;
  /** 12 (un panel), 8 (dentro de una tarjeta de cifra) o 4 (un hilo junto a un número). */
  alto?: 12 | 8 | 4;
  respuesta?: RespuestaBarra;
  className?: string;
}) {
  const dice = formato ?? String;
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const conValor = segmentos.filter((s) => s.valor > 0);
  const resumen = total > 0 ? conValor.map((s) => `${s.nombre}: ${dice(s.valor)}`).join(" · ") : `sin ${unidad}`;
  const dichoTodo = etiqueta ?? `${dice(total)} ${unidad}. ${resumen}`;
  const responde = !!respuesta && (!!respuesta.onApuntar || !!respuesta.onElegir);
  const elegida = respuesta?.elegida ?? null;

  return (
    <div role={responde ? "group" : "img"} aria-label={dichoTodo} data-alto={alto} className={["barra-apilada", className].filter(Boolean).join(" ")}>
      {total > 0 &&
        conValor.map((s, i) => {
          // Cada tramo crece por su PARTE del total (suma 100): así llena la pista aunque las cifras sumen menos de 1.
          const estilo = { flexGrow: (s.valor / total) * 100, ["--i" as string]: i };
          const color = <i aria-hidden className={`barra-tramo-color ${s.clase}`} />;
          if (!responde) {
            return (
              <span key={s.clave} title={`${s.nombre}: ${dice(s.valor)}`} className="barra-tramo anim-crece-x" style={estilo}>
                {color}
              </span>
            );
          }
          return (
            <button
              key={s.clave}
              type="button"
              aria-pressed={elegida === s.clave}
              aria-label={`${s.nombre}: ${dice(s.valor)}${respuesta?.accion ? `. ${respuesta.accion}` : ""}`}
              data-apagado={elegida !== null && elegida !== s.clave ? "" : undefined}
              onMouseEnter={() => respuesta?.onApuntar?.(s.clave)}
              onMouseLeave={() => respuesta?.onApuntar?.(null)}
              onFocus={() => respuesta?.onApuntar?.(s.clave)}
              onBlur={() => respuesta?.onApuntar?.(null)}
              onClick={() => respuesta?.onElegir?.(s.clave)}
              className="barra-tramo anim-crece-x"
              style={estilo}
            >
              {color}
            </button>
          );
        })}
    </div>
  );
}

/** El cuadrito de color de una leyenda: sobre la misma base de arena que el tramo, para que los dos se vean del mismo tono. */
export function MuestraTramo({ clase, className = "" }: { clase: string; className?: string }) {
  return (
    <span aria-hidden className={["barra-muestra", className].filter(Boolean).join(" ")}>
      <i className={`barra-tramo-color ${clase}`} />
    </span>
  );
}
