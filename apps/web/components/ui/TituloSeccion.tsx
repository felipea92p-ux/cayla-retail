import type { CSSProperties, ReactNode } from "react";

/* ====================================================================
   Títulos de sección (ADR-0358, ronda 7: Felipe los eligió tocándolos el 2026-10-13). Tres piezas, una por pregunta:

   · <TituloSeccion>: el título de un BLOQUE de una pantalla («Ventas de esta semana», «Lo que falta reponer»), sobre su tarjeta o dentro
     de ella. Un solo tamaño —serif de 21 px, peso normal— y, en la misma línea a la derecha, lo que resume el bloque (`dato`: dinero,
     unidades, «S/ 1,987.50 · 14 ventas») o su acción (`accion`: un <EnlaceVer>, «VER LAS 9 →»). Antes había serif en ocho tamaños,
     versalitas en seis y sans seminegrita en cinco.
   · <TituloGrupo>: el título de un GRUPO dentro de una hoja o un cajón que se lee de arriba abajo («Prendas», «Pago», «Comprobante»):
     VERSALITAS de 11 px y una raya fina que se DIBUJA hasta el borde al abrir la hoja (`retraso` para escalonarlas).
   · CUÁNTOS HAY en el bloque o el grupo (`cuenta`, ronda 9: Felipe lo eligió tocándolo el 2026-10-13) va PEGADO al nombre, en el globito
     de las pestañas («PRENDAS DEL ENVÍO 110»): la misma función con la misma pieza. A la derecha queda solo lo que resume.
   · <SeparadorDia>: el «Hoy», «Ayer», «Sábado 10» de una lista larga por fecha (ventas del mostrador, Actividad, Conteos, Movimientos):
     VERSALITAS con el total del día a la derecha; al bajar, el día se QUEDA PEGADO arriba sobre un velo de papel mientras pasan sus
     filas. «Hoy» lleva un punto rojo.

   La cabecera de una pantalla NO es esto: es la de su módulo (ADR-0220). Estilos: `app/estilos/titulos.css`. Movimiento de ADR-0136
   (la raya se dibuja una vez, sin bucle; quieta con «reducir movimiento»).
   ==================================================================== */

type Nivel = 2 | 3 | 4;
const Etiqueta = ({ nivel, className, id, children }: { nivel: Nivel; className: string; id?: string; children: ReactNode }) => {
  if (nivel === 3) return <h3 id={id} className={className}>{children}</h3>;
  if (nivel === 4) return <h4 id={id} className={className}>{children}</h4>;
  return <h2 id={id} className={className}>{children}</h2>;
};

/** El globito de cuántos hay, pegado al nombre (el mismo de las pestañas). Entra con su título, una vez. */
function Cuenta({ n }: { n: number }) {
  return <span className="titulo-cuenta">{n.toLocaleString("es-PE")}</span>;
}

export function TituloSeccion({
  children,
  cuenta,
  dato,
  accion,
  nivel = 2,
  id,
  className = "",
  guia,
}: {
  children: ReactNode;
  /** Cuántos hay en el bloque: el globito pegado al nombre («Pendientes 3»). */
  cuenta?: number;
  /** Lo que resume el bloque, en taupe a la derecha («<b>S/ 1,987.50</b> · 14 ventas»). Un conteo va en `cuenta`. */
  dato?: ReactNode;
  /** Su acción a la derecha: un <EnlaceVer>. */
  accion?: ReactNode;
  nivel?: Nivel;
  id?: string;
  /** Su lugar en la pantalla (márgenes), nunca su letra. */
  className?: string;
  /** Ancla de la guía (ADR-0389). */
  guia?: string;
}) {
  return (
    <div className={`titulo-seccion ${className}`} data-guia={guia}>
      <Etiqueta nivel={nivel} id={id} className="titulo-seccion-texto">
        {children}
        {cuenta !== undefined && <Cuenta n={cuenta} />}
      </Etiqueta>
      {(dato || accion) && (
        <span className="titulo-seccion-lado">
          {dato && <span className="titulo-seccion-dato">{dato}</span>}
          {accion}
        </span>
      )}
    </div>
  );
}

export function TituloGrupo({
  children,
  cuenta,
  nota,
  nivel = 3,
  retraso,
  className = "",
}: {
  children: ReactNode;
  /** Cuántos tiene el grupo: el globito pegado al nombre («GENERADAS 3»). */
  cuenta?: number;
  /** Una aclaración que no es un número («no se edita ni se borra»): al lado, en minúscula y con el tono del título (más tenue no se lee). */
  nota?: ReactNode;
  nivel?: Nivel;
  /** Cuándo empieza a dibujarse la raya (ms), para escalonar los grupos de una hoja. Por defecto, 120. */
  retraso?: number;
  className?: string;
}) {
  return (
    <Etiqueta nivel={nivel} className={`titulo-grupo ${className}`}>
      <span className="titulo-grupo-texto" style={retraso !== undefined ? ({ ["--retraso" as string]: `${retraso}ms` } as CSSProperties) : undefined}>
        {children}
        {cuenta !== undefined && <Cuenta n={cuenta} />}
        {nota !== undefined && nota !== null && <span className="titulo-grupo-cuenta"> · {nota}</span>}
      </span>
    </Etiqueta>
  );
}

export function SeparadorDia({
  children,
  total,
  hoy = false,
  nivel = 3,
  className = "",
}: {
  /** El día: «Hoy · lunes 12 de octubre», «Ayer», «Sábado 10 de octubre». */
  children: ReactNode;
  /** El total del día a la derecha («<b>S/ 514.50</b> · 7 ventas»). */
  total?: ReactNode;
  hoy?: boolean;
  nivel?: Nivel;
  className?: string;
}) {
  return (
    <Etiqueta nivel={nivel} className={`separador-dia ${hoy ? "separador-dia-hoy" : ""} ${className}`}>
      <span className="separador-dia-texto">{children}</span>
      {total !== undefined && total !== null && <span className="separador-dia-total">{total}</span>}
    </Etiqueta>
  );
}
