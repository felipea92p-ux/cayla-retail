"use client";

import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import type { CeldaAlta, ColorAlta } from "@/lib/alta-producto";
import type { EstadoVariante, NombresFicha } from "@/lib/variantes-ficha-reglas";
import type { Sububicacion } from "@/lib/sububicaciones";

// Piezas de la sección «Variantes» de la ficha de una prenda (ADR-0263). Lo que comparten la sección y sus modales:
// cómo se nombra y se pinta un color, cómo se elige UNO (corregir), cómo se muestra el código que va a tener cada
// variante y los dos montos con que nacen las nuevas. Las reglas viven en `lib/variantes-ficha-reglas.ts`.

/** Lo que hace falta para ajustar el stock desde la ficha (Felipe, 2026-09-29; ADR-0270, actualización de la decisión 9). Es de
 *  la SEDE ACTIVA: el ajuste escribe un movimiento allí, con su motivo y su responsable, como en Existencias. Solo llega si la
 *  cuenta puede ajustar stock (`puede(persona, "ajustarStock")`), que es lo mismo que exige la base. */
export type AjusteStockFicha = {
  productoId: string;
  ubicacionId: string;
  /** El nombre de la sede activa: la ficha muestra el stock de TODAS, y el ajuste es solo de esta. */
  sede: string;
  sububicaciones: Sububicacion[];
  /** El rol ve «Bajada al piso» y la sede separa piso y almacén: lo nuevo puede entrar al piso (ADR-0212). */
  puedeBajarAlPiso: boolean;
};

/** Lo que toda la sección necesita saber de la prenda y de quien la edita. */
export type ContextoFicha = {
  nombres: NombresFicha;
  /** El vocabulario de colores activo, con familia y sinónimos (para buscar «plomo» y encontrar Gris). */
  colores: ColorAlta[];
  /** El código del producto (BOD-0003): la base del código de cada variante. */
  codigoProducto: string | null;
  /** Unidades y ventas por variante (`fn_variantes_estado`). `null` = la función no está en la base: sin columna de stock. */
  estado: Record<string, EstadoVariante> | null;
  /** La cuenta es de un líder: corrige también las variantes que ya se vendieron (D-136). */
  esLider: boolean;
  /** La cuenta ve el dinero de compras: sin eso no se muestra ni se toca el costo. */
  veCosto: boolean;
  /** No se pudo saber qué costos vienen de compras (`costosSinComprobar`): todos quedan fijos y la ficha dice por qué. */
  costoSinComprobar: boolean;
  /** La base sabe corregir el color y la talla (tiene `fn_variantes_estado` y el resto del SQL de ADR-0263). Sin eso no
   *  se ofrece corregir: una base vieja ignoraba la corrección pero guardaba las fotos que se movieron con ella. */
  puedeCorregir: boolean;
  /** Ajustar el stock desde la ficha. `null` o ausente = la cuenta no puede ajustar stock: no se ofrece. */
  ajusteStock?: AjusteStockFicha | null;
};

/** Valor del combo para «Sin color»: los códigos de color son 3 mayúsculas, este no choca con ninguno. */
export const SIN_COLOR = "sin-color";

/** El punto de color de un color del vocabulario; «Sin color» es un círculo punteado vacío. */
export function PuntoColor({ codigo, colores }: { codigo: string | null; colores: readonly ColorAlta[] }) {
  const c = codigo ? colores.find((x) => x.codigo === codigo) : null;
  if (!c) return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-tinta/40" />;
  return <Punto hex={c.hex} familia={c.familiaColor} />;
}

/** Elegir UN color (para corregir): buscando por nombre o sinónimo, con su punto. «Sin color» solo si se ofrece. */
export function ElegirUnColor({
  valor,
  onValor,
  colores,
  ofrecerSinColor,
  etiqueta,
  id,
}: {
  /** Código del color, `SIN_COLOR` o "" (todavía nada). */
  valor: string;
  onValor: (v: string) => void;
  colores: readonly ColorAlta[];
  ofrecerSinColor: boolean;
  etiqueta: string;
  id?: string;
}) {
  const opciones = [
    ...(ofrecerSinColor ? [{ valor: SIN_COLOR, texto: "Sin color", icono: <PuntoColor codigo={null} colores={colores} /> }] : []),
    ...colores.map((c) => ({ valor: c.codigo, texto: c.nombre, claves: c.sinonimos, icono: <Punto hex={c.hex} familia={c.familiaColor} /> })),
  ];
  const elegido = valor && valor !== SIN_COLOR ? colores.find((c) => c.codigo === valor) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-10 w-6 shrink-0 place-items-center">
        {valor ? <PuntoColor codigo={elegido ? elegido.codigo : null} colores={colores} /> : null}
      </span>
      <ComboBuscable caja id={id} className="min-w-0 flex-1" etiquetaAccesible={etiqueta} marcador="Busca el color: negro, plomo, coral…" valor={valor} onValor={onValor} opciones={opciones} />
    </div>
  );
}

/** De qué código a qué código pasa cada variante (D-137), y que la etiqueta ya pegada sigue sonando. */
export function VistaPreviaCodigos({ filas }: { filas: { clave: string; antes: string; despues: string | null; nombre: string }[] }) {
  if (filas.length === 0) return null;
  const cambian = filas.some((f) => f.despues && f.despues !== f.antes);
  return (
    <div className="rounded-lg border border-sand bg-papel px-3 py-2.5">
      <p className="text-[11.5px] text-taupe">Así quedan</p>
      <ul className="mt-1 space-y-1">
        {filas.map((f) => (
          <li key={f.clave} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="font-mono text-xs text-tinta/60">{f.antes}</span>
            <span aria-hidden className="text-tinta/40">
              →
            </span>
            <span className="font-mono text-xs font-semibold text-tinta">{f.despues ?? "se asigna al guardar"}</span>
            <span className="text-taupe">· {f.nombre}</span>
          </li>
        ))}
      </ul>
      {cambian && <p className="mt-1.5 text-[11.5px] text-taupe">Las etiquetas ya pegadas siguen sonando en la caja: el código anterior queda como otro código de la misma prenda.</p>}
    </div>
  );
}

const CAMPO_MONTO =
  "caja-cayla h-10 w-full min-w-0 px-3 text-sm tabular-nums text-tinta outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Precio y costo con que nacen las variantes nuevas (sin costo si la cuenta no ve el dinero). */
export function MontosNuevas({
  precio,
  costo,
  onPrecio,
  onCosto,
  veCosto,
}: {
  precio: string;
  costo: string;
  onPrecio: (v: string) => void;
  onCosto: (v: string) => void;
  veCosto: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-tinta">Precio de venta</span>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={precio} onChange={(e) => onPrecio(e.target.value)} className={`mt-1 ${CAMPO_MONTO}`} />
      </label>
      {veCosto && (
        <label className="block">
          <span className="text-[12.5px] font-semibold text-tinta">Costo (opcional)</span>
          <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={costo} onChange={(e) => onCosto(e.target.value)} className={`mt-1 ${CAMPO_MONTO}`} />
        </label>
      )}
    </div>
  );
}

/** Los botones del pie de un modal: cancelar a la izquierda, la acción a la derecha. */
export function PieModal({ onCancelar, texto, onConfirmar, deshabilitado }: { onCancelar: () => void; texto: string; onConfirmar: () => void; deshabilitado: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-sand pt-4">
      <button type="button" onClick={onCancelar} className="btn-cayla btn-secundario">
        Cancelar
      </button>
      <button type="button" onClick={onConfirmar} disabled={deshabilitado} className="btn-cayla btn-primario">
        {texto}
      </button>
    </div>
  );
}

/**
 * Las variantes que van a nacer, como tabla color × talla (la misma forma que el alta, `MatrizVariantes`): ✓ nace; tocar
 * la celda la quita (queda rayada con «—», el mismo rayado del alta) y tocarla otra vez la devuelve. Sin la foto por
 * color del alta: en la ficha las fotos viven en su propia sección, y aquí un botón de foto no haría nada.
 */
export function MatrizNuevas({
  celdas,
  tallas,
  colores,
  excluidas,
  onExcluidas,
  nombreColor,
}: {
  celdas: CeldaAlta[];
  /** Ya ordenadas (S, M, L). Vacío = la prenda no tiene talla: una sola columna «Única». */
  tallas: { id: string; texto: string }[];
  /** Las filas, en su orden. Un código `null` es «Sin color». */
  colores: (string | null)[];
  excluidas: Set<string>;
  onExcluidas: (s: Set<string>) => void;
  nombreColor: (codigo: string | null) => string;
}) {
  const columnas: (string | null)[] = tallas.length ? tallas.map((t) => t.id) : [null];
  const filas: (string | null)[] = colores.length ? colores : [null];
  const textoTalla = (t: string | null) => (t === null ? "Única" : (tallas.find((x) => x.id === t)?.texto ?? ""));
  function alternar(clave: string) {
    const copia = new Set(excluidas);
    if (copia.has(clave)) copia.delete(clave);
    else copia.add(clave);
    onExcluidas(copia);
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-sand">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-hueso">
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-tinta">
              Color
            </th>
            {columnas.map((t) => (
              <th key={t ?? "sin-talla"} scope="col" className="px-2 py-2 text-xs font-semibold tabular-nums text-tinta">
                {textoTalla(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((color) => (
            <tr key={color ?? "sin-color"} className="border-t border-sand">
              <th scope="row" className="whitespace-nowrap bg-papel px-3 py-2 text-left font-medium text-tinta">
                {nombreColor(color)}
              </th>
              {columnas.map((talla) => {
                const cel = celdas.find((c) => c.color === color && c.tallaId === talla);
                if (!cel) return <td key={talla ?? "x"} className="border-l border-sand" />;
                const fuera = excluidas.has(cel.clave);
                const etiqueta = `${nombreColor(color)} · ${textoTalla(talla)}`;
                return (
                  <td key={cel.clave} className="border-l border-sand p-0 text-center">
                    <button
                      type="button"
                      onClick={() => alternar(cel.clave)}
                      aria-pressed={!fuera}
                      aria-label={fuera ? `${etiqueta}: no nace. Volver a incluir` : `${etiqueta}: nace. Quitar`}
                      className={`flex h-10 w-full min-w-11 items-center justify-center px-2 transition-colors hover:bg-tinta/[0.04] ${fuera ? RAYADO_FUERA : "text-verde"}`}
                    >
                      {fuera ? "—" : "✓"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
