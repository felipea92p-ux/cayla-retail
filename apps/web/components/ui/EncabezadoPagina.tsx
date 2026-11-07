import type { CSSProperties, ReactNode } from "react";
import { AyudaCabecera } from "@/components/ui/AyudaCabecera";
import { FechaHoraLima } from "@/components/ui/FechaHoraLima";

/** La cabecera de Cambios, Devoluciones y Caja (Atelier, 2026-09-19), desde el 2026-09-26 también la
 *  de Inventario (ADR-0220) y desde el 2026-10-14 la de TODO el ERP menos Finanzas (Felipe, `/unificar`,
 *  ADR-0358): Compras, Recibir, Producción, Catálogo, Configuración, Rendimiento, Actividad, Inicio… arriba, dónde y cuándo —la sede que se mira y la hora de Lima, viva—, con
 *  el hilo de CAYLA (taupe) trazándose a su lado; después el título en la serif de la casa y su frase.
 *  A la derecha va UNA cosa: lo que acompañe (el resumen de la sede, el reloj de Caja) o, si la pantalla
 *  no trae nada de eso, sus acciones. El título es de 46 px: más presencia que el 30 de las demás
 *  pantallas, pero sin gritar sobre el menú lateral.
 *
 *  El título es el nombre de la pantalla tal como lo dice el menú («Existencias», «Caja»): la sede
 *  va arriba, nunca de título. Título y frase aceptan más que texto para los detalles (Traslado 12
 *  con su insignia; «Trujillo → Lima» con la flecha en taupe).
 *
 *  La frase ya no se ve siempre (Felipe, 2026-10-30, ronda 18 de `/unificar`): las colaboradoras decían que era chica y nadie
 *  la leía. Vive en el globo de vidrio que abre el «?» junto al título (`AyudaCabecera`), en 16 px; también la que dice un
 *  dato (el turno, el conteo, el proveedor) y lo que la pantalla explicaba aparte con un «!» (`ayuda`). */
export function EncabezadoPagina({
  sede,
  titulo,
  subtitulo,
  ayuda,
  nombre,
  guiaAyuda,
  sinHora = false,
  detalle,
  volver,
  acciones,
  pie,
  children,
}: {
  sede: string;
  titulo: ReactNode;
  /** Qué es la pantalla o el dato que la acompaña: va en el globo del «?» junto al título, no a la vista. Opcional: una ficha
   *  (Editar producto) dice lo suyo con el título. */
  subtitulo?: ReactNode;
  /** Lo que se explicaba aparte con un «!» (cómo se lee una cifra, qué cuenta y qué no): en el mismo globo, un paso más abajo. */
  ayuda?: ReactNode;
  /** El nombre de la pantalla para el globo y el lector («Qué es Gastos») cuando el título no es solo texto. */
  nombre?: string;
  /** El `data-guia` del «?», si la guía interactiva de la pantalla lo enciende. */
  guiaAyuda?: string;
  /** La línea de arriba dice solo el día: la pantalla trae su propio reloj (Caja). */
  sinHora?: boolean;
  /** Algo más que decir en la línea de arriba, tras la hora: desde cuándo está lo que se ve (Facturación) o de dónde se llegó, lo que
   *  antes era un sobretítulo («Productos · Blusa Emma» en Etiquetas, el documento de una factura, el código de una prenda). */
  detalle?: ReactNode;
  /** La vuelta a la pantalla de arriba: `<Volver … />`, una flecha a la izquierda de la línea «sede · fecha»
   *  (Felipe, 2026-10-06, ADR-0220 act.). Antes iba en `pie` como botón con texto y ocupaba una fila entera bajo la frase. */
  volver?: ReactNode;
  /** Lo que se hace desde la pantalla, la principal al final (Existencias: bajar al piso y nuevo traslado).
   *  Van a la derecha, en el espacio libre; si la derecha ya es de las cifras o del reloj (`children`), bajan
   *  bajo la frase, como en Caja. Lo decide esta cabecera, no cada pantalla (ADR-0220, actualización). */
  acciones?: ReactNode;
  /** Bajo la frase, a la izquierda: un estado que no es una acción (el resultado de un conteo, «En curso»). La vuelta ya no va
   *  aquí: va en `volver`. */
  pie?: ReactNode;
  /** A la derecha: las cifras de la sede (`ResumenSede`) o el reloj de Caja. */
  children?: ReactNode;
}) {
  const derechaOcupada = Boolean(children);
  const bajoLaFrase = derechaOcupada && acciones ? <>{pie}{acciones}</> : pie;
  return (
    <header data-voz="cabecera" className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
      <div className="anim-sube min-w-0">
        <div className="flex items-center gap-3">
          {volver}
          <p className="flex min-w-0 items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo">
            <span aria-hidden className="hilo-dibuja block h-px w-8 shrink-0 bg-taupe" />
            <span className="min-w-0">
              {sede} · <FechaHoraLima sinHora={sinHora} />
              {detalle && <> · {detalle}</>}
            </span>
          </p>
        </div>
        <h1 className="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">
          {titulo}
          {(subtitulo || ayuda) && (
            <AyudaCabecera nombre={nombre ?? (typeof titulo === "string" ? titulo : undefined)} mas={ayuda} guia={guiaAyuda}>
              {subtitulo}
            </AyudaCabecera>
          )}
        </h1>
        {bajoLaFrase && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2.5">{bajoLaFrase}</div>}
      </div>
      {derechaOcupada
        ? children
        : acciones && (
            // Entra un paso después del título, como el resumen de la sede. En el celular la fila se parte y
            // las acciones quedan bajo la frase, a la izquierda, donde estaban antes.
            // `min-w-0 max-w-full`: en el celular la fila no pasa del ancho de la cabecera (una acción que se estira, como la campaña
            // del Plan, se corta con «…» en vez de empujar la página hacia la derecha).
            <div className="anim-sube flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2.5" style={{ "--i": 1 } as CSSProperties}>
              {acciones}
            </div>
          )}
    </header>
  );
}
