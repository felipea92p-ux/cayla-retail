"use client";

import { useLayoutEffect, useRef } from "react";
import { ScanLine } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Vacio } from "@/components/ui/Vacio";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { frasePorTalla, veredictoDeLaTalla, type ColorConsultado, type ExistenciasDeLaPrenda, type ResultadoConsulta, type TallaConsultada } from "@/lib/escaner-existencias";

/* ====================================================================
   ExistenciasEnCamara · lo que responde la cámara de Vender en el modo «Existencias» (2026-10-28, pedido de Felipe)

   Se lee una etiqueta y, en vez de entrar al ticket, la bandeja dice cuántas hay de ESA prenda en cada color y talla,
   en el piso y en el almacén de la sede (`lib/escaner-existencias.ts`). Lo de arriba responde a lo que se escaneó
   («Blusa Emma · Blanco · M — En piso»); la matriz de abajo, a lo que la clienta pregunta después («¿y en L? ¿y en negro?»).

   Una columna por talla, con la que se leyó resaltada; las filas son En piso, En almacén y —solo si hay— Apartadas. Los
   colores son píldoras: tocar uno cambia la matriz sin volver a escanear. No guarda nada ni toca el ticket.
   ==================================================================== */

/** La matriz de un color: una columna por talla. Las cifras son decoración para el ojo; el lector de pantalla oye una frase por talla. */
function MatrizDeTallas({ color, separaPiso }: { color: ColorConsultado; separaPiso: boolean }) {
  const filas: { clave: string; etiqueta: string; valor: (t: TallaConsultada) => number }[] = [
    { clave: "piso", etiqueta: separaPiso ? "En piso" : "Hay aquí", valor: (t) => t.piso },
    ...(separaPiso ? [{ clave: "almacen", etiqueta: "En almacén", valor: (t: TallaConsultada) => t.almacen ?? 0 }] : []),
    ...(color.apartado > 0 ? [{ clave: "apartado", etiqueta: "Apartadas", valor: (t: TallaConsultada) => t.apartado }] : []),
  ];
  // Con muchas tallas (un pantalón 28–38) la fila se desliza: la que se leyó se lleva al centro, para que no quede escondida.
  const lista = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const ul = lista.current;
    const leida = ul?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!ul || !leida || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollLeft = leida.offsetLeft - (ul.clientWidth - leida.offsetWidth) / 2;
  }, [color.clave]);
  return (
    <div className="flex gap-2">
      <div aria-hidden className="flex shrink-0 flex-col">
        <span className="h-7" />
        {filas.map((f) => (
          <span key={f.clave} className="flex h-8 items-center text-xs text-taupe">
            {f.etiqueta}
          </span>
        ))}
      </div>
      <ul ref={lista} className="relative flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {color.tallas.map((t) => (
          <li
            key={t.varianteId}
            aria-label={frasePorTalla(t)}
            aria-current={t.leida ? "true" : undefined}
            className={`flex min-w-10 flex-1 flex-col items-center rounded-xl ${t.leida ? "bg-hueso" : ""}`}
          >
            <span aria-hidden className="flex h-7 items-center">
              <span className={t.leida ? "rounded-full bg-tinta px-2 py-0.5 text-xs font-medium text-crema" : "text-xs text-taupe"}>{t.talla}</span>
            </span>
            {filas.map((f) => {
              const n = f.valor(t);
              return (
                <span key={f.clave} aria-hidden className={`flex h-8 items-center text-[15px] tabular-nums ${n > 0 ? "font-medium text-tinta" : "text-tinta/40"}`}>
                  {n}
                </span>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Prenda({ r, claveColor, onColor }: { r: ExistenciasDeLaPrenda; claveColor: string | null; onColor: (clave: string) => void }) {
  // El de la etiqueta va primero (`consultarExistencias`): arriba se responde a lo que se escaneó, siempre.
  const leido = r.colores[0];
  const tallaLeida = leido.tallas.find((t) => t.leida);
  const veredicto = tallaLeida ? veredictoDeLaTalla(tallaLeida, r.separaPiso) : null;
  const visto = r.colores.find((c) => c.clave === claveColor) ?? leido;
  return (
    <div className="anim-asentar flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <MiniaturaPrenda fotoUrl={leido.fotoUrl} colorHex={leido.colorHex} tamano="md" {...categoriaDe(r.categoria)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-tinta">{r.referencia}</span>
          <span className="block truncate text-xs text-taupe">{[leido.nombre, tallaLeida?.talla].filter(Boolean).join(" · ") || "Sin color ni talla"}</span>
        </span>
        {veredicto && (
          <Chip tono={veredicto.tono} versalitas={false}>
            {veredicto.texto}
          </Chip>
        )}
      </div>
      {r.colores.length > 1 && (
        // En un celular apaisado no cabe todo: primero la matriz (lo que se preguntó) y los colores después.
        <div role="group" aria-label="Color que se muestra" className="flex gap-2 overflow-x-auto [@media(max-height:500px)]:order-last">
          {r.colores.map((c) => {
            const activo = c.clave === visto.clave;
            return (
              <button
                key={c.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => onColor(c.clave)}
                className={`pildora-cayla shrink-0 ${c.sinExistencias && !activo ? "opacity-60" : ""}`}
              >
                <CapsulaColor compacta fondo={c.colorHex} />
                {c.nombre ?? "Sin color"}
              </button>
            );
          })}
        </div>
      )}
      <MatrizDeTallas color={visto} separaPiso={r.separaPiso} />
    </div>
  );
}

export function ExistenciasEnCamara({
  resultado,
  claveColor,
  onColor,
}: {
  /** Lo último que se leyó, ya consultado contra el stock de ahora; `null` si todavía no se leyó nada. */
  resultado: ResultadoConsulta | null;
  /** El color que la persona tocó para esta lectura; `null` = el de la etiqueta. */
  claveColor: string | null;
  onColor: (clave: string) => void;
}) {
  if (!resultado) {
    return (
      <Vacio tamano="chico" icono={<ScanLine />}>
        Escanea una etiqueta para ver cuántas hay de cada talla y color.
      </Vacio>
    );
  }
  if (resultado.tipo === "no-encontrada") {
    return (
      <Aviso tono="atencion" titulo={`No encontramos «${resultado.codigo}» en esta tienda`}>
        Prueba con la etiqueta de otra prenda o búscala por nombre.
      </Aviso>
    );
  }
  return <Prenda r={resultado} claveColor={claveColor} onColor={onColor} />;
}
