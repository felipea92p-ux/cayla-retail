"use client";

import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ListChecks } from "lucide-react";
import type { GrupoConteo, PrendaConteo } from "@/lib/conteo-reglas";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { FilaConteo } from "@/components/conteo/FilaConteo";
import type { ControlConteo } from "@/components/conteo/control-conteo";

/* ====================================================================
   ListaConteo · los productos de Contar, en tarjetas (Inventario ▸ Conteo ▸ Contar; rediseño 2026-09-29)

   Cada «percha» (modelo + color) es UNA tarjeta: arriba su miniatura, el nombre, el color y cuántas tallas tiene, con
   «Completar todo» a la derecha; debajo, una fila por talla: Talla · Debe haber · Contaste · Estado.

   DOS COLUMNAS INDEPENDIENTES (tipo masonry), no una parrilla de filas: una tarjeta de 3 tallas no se estira para igualar a
   la de 5 que tiene al lado, y la siguiente tarjeta de cada columna se coloca justo debajo de la anterior de SU columna, sin
   huecos. Cada tarjeta va a la columna que hoy está más corta (por su número de tallas), en el orden de la lista: la primera
   a la izquierda, la segunda a la derecha, y así. El reparto se calcula con TODAS las perchas, así que una tarjeta no salta
   de columna cuando el montaje por tandas dibuja más. Con poco ancho (< 45 rem) es UNA columna, en el orden de la lista.
   El ancho se mide con el contenedor y no con la ventana: con el menú lateral abierto, una ventana de 1024 px deja ~670 px.

   `memo`: solo se vuelve a dibujar cuando cambia el agrupado (una línea aparece o desaparece, o se filtra). Una lectura
   o una respuesta de la base cambian una fila, no la lista.

   FILTRAR NO DESMONTA. Cuando se busca algo, las tarjetas y filas que no coinciden se ESCONDEN (`hidden`) y siguen
   montadas: desmontar y volver a montar ~1.100 filas cada vez que se escribe o se borra el buscador cuesta medio
   segundo, y con la pistola pasa en cada lectura (el código se teclea en el campo y Enter lo borra). Una fila
   escondida conserva lo que se escribió en ella, y esconder es cambiar un atributo, no dibujar.

   MONTAJE POR TANDAS. Una sede grande (~1.100 variantes) son ~15.000 nodos. Dibujarlos de un golpe bloquea la pantalla
   varios segundos en un celular. Se dibujan primero las primeras tarjetas (lo que cabe en pantalla y un poco más) y el
   resto entra por tandas de baja prioridad, sin trabar el teclado: la lista completa está en menos de un segundo.
   Contar no depende de esto: escanear resuelve la variante en el almacén del conteo, no en el DOM.
   ==================================================================== */

/** Tarjetas que se dibujan al abrir la pantalla, y las que entran en cada tanda. */
const PERCHAS_AL_ABRIR = 24;
const PERCHAS_POR_TANDA = 40;

/** Desde este ancho del contenedor la lista es de dos columnas (cada tarjeta mide entonces ≥ 350 px). */
const ANCHO_DOS_COLUMNAS_PX = 720;

/** Lo que pesa una tarjeta al repartir: sus filas más su cabecera (que equivale a ~2,5 filas). */
const pesoDe = (g: GrupoConteo<PrendaConteo>) => g.tallas.length + 2.5;

/** Reparte las tarjetas en `columnas` columnas: cada una, en orden, a la que hoy está más corta (a igualdad, la de más a la izquierda). */
function repartir(grupos: GrupoConteo<PrendaConteo>[], columnas: 1 | 2) {
  const cols: { g: GrupoConteo<PrendaConteo>; i: number }[][] = Array.from({ length: columnas }, () => []);
  const alturas = new Array<number>(columnas).fill(0);
  grupos.forEach((g, i) => {
    const c = alturas.indexOf(Math.min(...alturas));
    cols[c].push({ g, i });
    alturas[c] += pesoDe(g);
  });
  return cols;
}

export const ListaConteo = memo(function ListaConteo({
  grupos,
  coincidencias,
  control,
  alConfirmar,
  alInvalido,
  alEnter,
  alCompletar,
}: {
  grupos: GrupoConteo<PrendaConteo>[];
  /** Las variantes que coinciden con lo buscado; `null` = no se busca nada y se ven todas. */
  coincidencias: ReadonlySet<string> | null;
  control: ControlConteo;
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  alInvalido: (texto: string) => void;
  alEnter: (campo: HTMLInputElement) => void;
  /** «Completar todo» de una tarjeta: las tallas que siguen pendientes se cuentan con lo que debe haber. */
  alCompletar: (varianteIds: string[]) => void;
}) {
  const [montadas, setMontadas] = useState(PERCHAS_AL_ABRIR);
  useEffect(() => {
    if (montadas >= grupos.length) return;
    const id = window.setTimeout(() => startTransition(() => setMontadas((m) => m + PERCHAS_POR_TANDA)), 30);
    return () => window.clearTimeout(id);
  }, [montadas, grupos.length]);

  const raiz = useRef<HTMLDivElement>(null);
  const [columnas, setColumnas] = useState<1 | 2>(1);
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = () => setColumnas(el.clientWidth >= ANCHO_DOS_COLUMNAS_PX ? 2 : 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const reparto = useMemo(() => repartir(grupos, columnas), [grupos, columnas]);

  return (
    <div ref={raiz} className="flex items-start gap-4">
      {reparto.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-4">
          {col
            .filter(({ i }) => i < montadas)
            .map(({ g }) => (
              <TarjetaPercha
                key={g.clave}
                grupo={g}
                visible={coincidencias === null || g.tallas.some((t) => coincidencias.has(t.varianteId))}
                coincidencias={coincidencias}
                control={control}
                alConfirmar={alConfirmar}
                alInvalido={alInvalido}
                alEnter={alEnter}
                alCompletar={alCompletar}
              />
            ))}
        </div>
      ))}
    </div>
  );
});

/** Una tarjeta de producto: cabecera y una tabla de tallas. Es su propio `@container`: sus columnas se ajustan a SU ancho. */
const TarjetaPercha = memo(function TarjetaPercha({
  grupo: g,
  visible,
  coincidencias,
  control,
  alConfirmar,
  alInvalido,
  alEnter,
  alCompletar,
}: {
  grupo: GrupoConteo<PrendaConteo>;
  visible: boolean;
  coincidencias: ReadonlySet<string> | null;
  control: ControlConteo;
  alConfirmar: (varianteId: string, cantidad: number | null) => boolean;
  alInvalido: (texto: string) => void;
  alEnter: (campo: HTMLInputElement) => void;
  alCompletar: (varianteIds: string[]) => void;
}) {
  const ids = useMemo(() => g.tallas.map((t) => t.varianteId), [g.tallas]);
  return (
    <article hidden={!visible} className="card-cayla @container overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1 pl-[18px] pr-3">
        <MiniaturaPrenda fotoUrl={g.fotoUrl} colorHex={g.colorHex} tamano="xl" {...categoriaDe(g)} />
        <div className="min-w-[8rem] flex-1">
          <h3 className="truncate text-base font-semibold leading-snug text-tinta">{g.referencia}</h3>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-taupe">
            {g.color ? (
              // `inert`: el nombre ya va en texto; sin esto cada tarjeta sumaría una parada de Tab entre campos de conteo.
              <span inert>
                <MuestraColor nombre={g.color} hex={g.colorHex} compacta />
              </span>
            ) : null}
            <span className="truncate">{g.color ?? "Sin color"}</span>
            <span className="whitespace-nowrap">
              · {g.tallas.length} {g.tallas.length === 1 ? "talla" : "tallas"}
            </span>
          </p>
        </div>
        <BotonCompletarTodo control={control} ids={ids} nombre={`${g.referencia} ${g.color ?? ""}`.trim()} alCompletar={alCompletar} />
      </header>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">
          Tallas de {g.referencia} {g.color ?? ""}
        </caption>
        <colgroup>
          <col className="w-11 @[26rem]:w-[4.5rem]" />
          <col className="w-12 @[26rem]:w-28" />
          <col className="w-[7.75rem] @[26rem]:w-[12rem]" />
          <col />
        </colgroup>
        <thead>
          <tr className="bg-hueso/40">
            <th scope="col" className="py-[5px] pl-[18px] pr-1 text-left text-xs font-normal leading-tight text-taupe">
              Talla
            </th>
            <th scope="col" className="px-1 py-[5px] text-center text-xs font-normal leading-tight text-taupe">
              Debe haber
            </th>
            <th scope="col" className="px-1 py-[5px] text-center text-xs font-normal leading-tight text-taupe">
              Contaste
            </th>
            <th scope="col" className="py-[5px] pl-2 pr-3 text-left text-xs font-normal leading-tight text-taupe">
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand/60">
          {g.tallas.map((t) => (
            <FilaConteo
              key={t.varianteId}
              prenda={t}
              // Solo las filas de una tarjeta visible cambian de `oculta`: las de una tarjeta escondida no se vuelven a dibujar.
              oculta={visible && coincidencias !== null && !coincidencias.has(t.varianteId)}
              control={control}
              alConfirmar={alConfirmar}
              alInvalido={alInvalido}
              alEnter={alEnter}
            />
          ))}
        </tbody>
      </table>
    </article>
  );
});

/**
 * «Completar todo»: «encontré físicamente todo este producto tal como CAYLA esperaba». Cuenta cada talla que SIGUE
 * pendiente con lo que debe haber; las tallas que ya tienen número (escrito a mano, escaneado o recontado) no se tocan.
 * Se apaga cuando en la tarjeta no queda ninguna pendiente. Se suscribe solo al resumen del conteo: una lectura no vuelve
 * a dibujar la lista, solo este botón (que hace una comparación por talla).
 */
const BotonCompletarTodo = memo(function BotonCompletarTodo({
  control,
  ids,
  nombre,
  alCompletar,
}: {
  control: ControlConteo;
  ids: string[];
  nombre: string;
  alCompletar: (varianteIds: string[]) => void;
}) {
  const quedanPendientes = () => ids.some((id) => control.linea(id)?.contada === null);
  const hay = useSyncExternalStore(control.suscribirResumen, quedanPendientes, quedanPendientes);
  return (
    <button
      type="button"
      disabled={!hay}
      onClick={() => alCompletar(ids)}
      aria-label={`Completar todo: ${nombre}`}
      className="btn-cayla btn-secundario ml-auto h-9 min-h-0 shrink-0 gap-2 px-3 text-[13px] text-rojo-profundo disabled:opacity-50"
    >
      <ListChecks aria-hidden className="h-4 w-4" />
      Completar todo
    </button>
  );
});
