"use client";

import { memo, startTransition, useEffect, useState } from "react";
import type { GrupoConteo, PrendaConteo } from "@/lib/conteo-reglas";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { FilaConteo } from "@/components/conteo/FilaConteo";
import type { ControlConteo } from "@/components/conteo/control-conteo";

/* ====================================================================
   ListaConteo · la tabla de Contar: por producto y color, con las tallas debajo
   (Inventario ▸ Conteo ▸ Contar, rediseño 2026-09-29; plano §3.1 y §3.5)

   UNA `<table>` con un `<tbody>` por «percha» (modelo + color) y una sola `<colgroup>`: así las cuatro columnas —Talla,
   Debe haber, Contaste, Estado— quedan alineadas al píxel en TODAS las perchas y el lector de pantalla recibe los
   encabezados de columna. No usa `Tabla` de `ui/`: esa apila las celdas en el celular y oculta el encabezado, y aquí
   las cuatro columnas tienen que verse a 375 px.

   Las medidas cambian por CONTENEDOR (`@[36rem]`) y no por ventana: con el menú lateral abierto una ventana de 1024 px
   deja ~670 px al panel, y en 768 px apenas ~416. La tarjeta que la contiene es el `@container`.

   `memo`: solo se vuelve a dibujar cuando cambia el agrupado (una línea aparece o desaparece, o se filtra). Una lectura
   o una respuesta de la base cambian una fila, no la lista.

   El encabezado de la percha usa la miniatura y el nombre UNA vez: repetirlos en cada talla duplicaría el DOM y
   ensuciaría la lectura. El nombre del color va en texto porque quien cuenta busca la percha por color.

   FILTRAR NO DESMONTA. Cuando se busca algo, las perchas y filas que no coinciden se ESCONDEN (`hidden`) y siguen
   montadas: desmontar y volver a montar ~1.100 filas cada vez que se escribe o se borra el buscador cuesta medio
   segundo, y con la pistola pasa en cada lectura (el código se teclea en el campo y Enter lo borra). Una fila
   escondida conserva lo que se escribió en ella, y esconder es cambiar un atributo, no dibujar.

   MONTAJE POR TANDAS. Una sede grande (~1.100 variantes) son ~15.000 nodos. Dibujarlos de un golpe bloquea la pantalla
   varios segundos en un celular. Se dibujan primero las primeras perchas (lo que cabe en pantalla y un poco más) y el
   resto entra por tandas de baja prioridad, sin trabar el teclado: la lista completa está en menos de un segundo.
   Contar no depende de esto: escanear resuelve la variante en el almacén del conteo, no en el DOM.
   ==================================================================== */

/** Perchas que se dibujan al abrir la pantalla (~130 filas: unas tres pantallas de celular), y las que entran en cada tanda. */
const PERCHAS_AL_ABRIR = 24;
const PERCHAS_POR_TANDA = 40;

export const ListaConteo = memo(function ListaConteo({
  grupos,
  coincidencias,
  control,
  alConfirmar,
  alInvalido,
  alEnter,
}: {
  grupos: GrupoConteo<PrendaConteo>[];
  /** Las variantes que coinciden con lo buscado; `null` = no se busca nada y se ven todas. */
  coincidencias: ReadonlySet<string> | null;
  control: ControlConteo;
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  alInvalido: (texto: string) => void;
  alEnter: (campo: HTMLInputElement) => void;
}) {
  const [montadas, setMontadas] = useState(PERCHAS_AL_ABRIR);
  useEffect(() => {
    if (montadas >= grupos.length) return;
    const id = window.setTimeout(() => startTransition(() => setMontadas((m) => m + PERCHAS_POR_TANDA)), 30);
    return () => window.clearTimeout(id);
  }, [montadas, grupos.length]);

  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">Variantes del conteo, por producto y color</caption>
      <colgroup>
        {/* Talla: 64 px alcanza para «Única» y —con letra de 11 px— para «Estándar» (la más larga del catálogo); en ancho, 96 px. */}
        <col className="w-16 @[36rem]:w-24" />
        <col className="w-12 @[36rem]:w-24" />
        <col className="w-[4.25rem] @[36rem]:w-28" />
        <col />
      </colgroup>
      <thead>
        <tr className="encabezado-tabla-cayla">
          <th scope="col" className="py-2 pl-3 pr-1 text-left text-xs font-normal leading-tight text-taupe @[36rem]:pl-5">
            Talla
          </th>
          <th scope="col" className="px-1 py-2 text-center text-xs font-normal leading-tight text-taupe @[36rem]:px-3">
            Debe haber
          </th>
          <th scope="col" className="px-1 py-2 text-center text-xs font-normal leading-tight text-taupe @[36rem]:px-3">
            Contaste
          </th>
          <th scope="col" className="py-2 pl-1.5 pr-3 text-left text-xs font-normal leading-tight text-taupe @[36rem]:pr-5">
            Estado
          </th>
        </tr>
      </thead>
      {grupos.slice(0, montadas).map((g) => {
        const visible = coincidencias === null || g.tallas.some((t) => coincidencias.has(t.varianteId));
        return (
          <tbody key={g.clave} hidden={!visible} className="divide-y divide-sand/60 border-t border-sand">
            <CabeceraPercha grupo={g} />
            {g.tallas.map((t) => (
              <FilaConteo
                key={t.varianteId}
                prenda={t}
                // Solo las filas de una percha visible cambian de `oculta`: las de una percha escondida no se vuelven a dibujar.
                oculta={visible && coincidencias !== null && !coincidencias.has(t.varianteId)}
                control={control}
                alConfirmar={alConfirmar}
                alInvalido={alInvalido}
                alEnter={alEnter}
              />
            ))}
          </tbody>
        );
      })}
    </table>
  );
});

/** El encabezado de una percha: miniatura, «Blusa Emma» y «▬ Beige · 5 tallas». Ocupa las cuatro columnas. */
const CabeceraPercha = memo(function CabeceraPercha({ grupo: g }: { grupo: GrupoConteo<PrendaConteo> }) {
  return (
    <tr>
      <th colSpan={4} scope="rowgroup" className="bg-hueso/40 px-3 py-2.5 text-left font-normal @[36rem]:px-5">
        <span className="flex items-center gap-2.5">
          <MiniaturaPrenda fotoUrl={g.fotoUrl} colorHex={g.colorHex} tamano="md" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-snug text-tinta">{g.referencia}</span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-taupe">
              {g.color ? (
                // `inert`: el nombre ya va en texto; sin esto cada percha sumaría una parada de Tab entre campos de conteo.
                <span inert>
                  <MuestraColor nombre={g.color} hex={g.colorHex} compacta />
                </span>
              ) : null}
              <span className={g.color ? "max-sm:hidden" : undefined}>{g.color ?? "Sin color"}</span>
              <span className="whitespace-nowrap">
                · {g.tallas.length} {g.tallas.length === 1 ? "talla" : "tallas"}
              </span>
            </span>
          </span>
        </span>
      </th>
    </tr>
  );
});
