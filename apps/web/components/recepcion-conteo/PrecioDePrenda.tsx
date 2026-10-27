"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { ElegirOpcion } from "@/components/recepcion-envio/BloquePrenda";
import { ALCANCE_DE_FABRICA, hoyDelPrecio, leerCostoCierre, leerPrecioNuevo, type PrecioEditado, type PrendaSeparada, type RangoDePrecio } from "@/lib/recepcion-conteo-reglas";
import { leerPreciosDePrenda } from "@/lib/recepcion-conteo-acciones";

// El precio de venta de una prenda que ya se identificó en este envío (Felipe 2026-10-24). El campo viene con el precio de hoy; quien recibe lo
// cambia y elige si vale solo para la sede donde recibe (la primera opción y la que viene elegida, Felipe 2026-10-26) o para todas (una terminal, solo la suya: 2026-10-26). NO guarda aquí: el cambio se aplica al cerrar el envío, después de una
// confirmación que lista todo lo que cambia (`CerrarEnvio`). Rige hacia adelante: lo ya vendido guarda su precio y el cambio queda en el
// historial de la prenda (Catálogo ▸ Productos ▸ Historial).

const monto = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const textoRango = (r: RangoDePrecio) => (r.desde === r.hasta ? monto(r.desde) : `${monto(r.desde)} a ${monto(r.hasta)}`);

/** Junto al nombre de la prenda: su precio de hoy (el de la sede si el precio vale solo para ella, y si es otro que el general, también el general). */
function textoDeHoy(e: PrecioEditado | undefined, sede: string): string {
  if (!e || e.actual === undefined) return "leyendo el precio…";
  const hoy = hoyDelPrecio(e);
  if (hoy === null || hoy === undefined) return "sin precio a la vista";
  const distinto = e.alcance === "sede" && e.actual !== null && e.actualSede !== undefined && e.actualSede !== null && textoRango(e.actual) !== textoRango(e.actualSede);
  return distinto && e.actual ? `hoy en ${sede} ${textoRango(hoy)} (en las demás sedes, ${textoRango(e.actual)})` : `hoy ${textoRango(hoy)}`;
}

/** Lleva el cursor al campo del precio de una prenda (para decirle a quien escribe cuál hay que corregir). */
export function enfocarPrecio(productoId: string) {
  const campo = document.querySelector<HTMLInputElement>(`[data-precio-prenda="${CSS.escape(productoId)}"] input`);
  campo?.scrollIntoView({ block: "center", behavior: "smooth" });
  campo?.focus({ preventScroll: true });
}

/** El costo de compra de una prenda (ADR-0519, Felipe 2026-10-26): lo que dice el campo, qué cuesta su línea (lo que se usa si lo deja vacío), qué
 *  decía al abrir y si lo escrito está mal. Sin esto, el campo no se dibuja (quien no ve el costo de una línea de fuera de la guía). */
export type CostoDePrenda = { valor: string; deLaLinea: string; antes: string; problema: string | null };

export function PrecioDePrenda({
  prenda,
  sede,
  soloSede = false,
  sedeId,
  editado,
  costo,
  onActual,
  onValor,
  onAlcance,
  onCosto,
}: {
  /** `cantidad`: cuántas llegaron (la columna «Llegaron»); sin ella (la hoja de tallas de una sola prenda, donde todavía se está contando) no hay columna. */
  prenda: Pick<PrendaSeparada, "productoId" | "nombre" | "codigo"> & { cantidad?: number };
  /** El nombre de la sede que recibe: «Solo Tienda Lima». */
  sede: string;
  /** Una terminal: el precio vale solo en su sede. No se ofrece «Todas las sedes»; se dice dónde vale. */
  soloSede?: boolean;
  /** La sede que recibe, para leer el precio que la prenda tiene en ella (`null`: no se sabe, vale el general). */
  sedeId: string | null;
  editado: PrecioEditado | undefined;
  /** El costo de compra de ESTA prenda (por defecto el de su línea) y qué hacer al escribirlo; sin él, no hay campo de costo. */
  costo?: CostoDePrenda;
  /** El precio de hoy ya se leyó (el general y el de esta sede): la pantalla lo guarda y, si no hay nada escrito, lo pone en el campo. */
  onActual: (general: RangoDePrecio | null, enSede: RangoDePrecio | null | undefined) => void;
  onValor: (valor: string) => void;
  onAlcance: (alcance: "todas" | "sede") => void;
  onCosto?: (valor: string) => void;
}) {
  const nombre = prenda.nombre ?? prenda.codigo ?? "la prenda";
  const alcance = editado?.alcance ?? ALCANCE_DE_FABRICA;
  const lectura = leerPrecioNuevo(editado?.valor ?? "");
  // Lo que está mal escrito, o lo que la base no aceptaría (con su motivo): junto al campo, no en un aviso aparte.
  const problema = lectura.problema ?? editado?.rechazo ?? null;

  useEffect(() => {
    let vivo = true;
    void leerPreciosDePrenda(prenda.productoId, sedeId).then((p) => vivo && onActual(p.general, p.enSede));
    return () => {
      vivo = false;
    };
    // Se lee una vez por prenda; `onActual` es de la pantalla y cambia en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prenda.productoId, sedeId]);

  // Una fila por prenda (Felipe 2026-10-26): de izquierda a derecha van el nombre con su precio de hoy, lo que llegó de esa prenda, lo que
  // costó, el precio de venta y las dos opciones de dónde vale. Cabe en una fila desde 1000 px de ancho del contenedor de `Tabla` (con el
  // costo) o desde 820 px (sin él); en angosto, el nombre y la cantidad arriba y los campos con sus opciones debajo. Cada columna lleva su
  // título arriba, en cada fila (Felipe 2026-10-26: «Precio de venta» sobre cada campo), y su contenido mide lo que la caja (40 px).
  const conCosto = costo !== undefined && onCosto !== undefined;
  // «Antes S/ …»: solo si lo que dice el campo es un monto válido y distinto de lo que traía al abrir.
  const nuevoCosto = conCosto ? leerCostoCierre(costo.valor.trim() ? costo.valor : costo.deLaLinea) : null;
  const hayCambio = conCosto && nuevoCosto !== null && nuevoCosto.problema === null && nuevoCosto.valor !== leerCostoCierre(costo.antes).valor;
  const contenido = conCosto
    ? "@min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:flex-col @min-[1000px]:justify-center"
    : "@min-[820px]:flex @min-[820px]:min-h-10 @min-[820px]:flex-col @min-[820px]:justify-center";
  return (
    <div
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 ${
        conCosto
          ? "@min-[1000px]:grid-cols-[minmax(0,16rem)_6.5rem_9rem_9rem_auto] @min-[1000px]:justify-start"
          : "@min-[820px]:grid-cols-[minmax(0,18rem)_6.5rem_9rem_auto] @min-[820px]:justify-start"
      }`}
      data-precio-prenda={prenda.productoId}
    >
      <div className="min-w-0">
        <span className="campo-etiqueta block">Prenda</span>
        <div className={`mt-1.5 ${contenido}`}>
          <p className="truncate text-sm font-medium leading-tight text-tinta" title={nombre}>{nombre}</p>
          <p className="truncate text-xs leading-tight text-taupe">
            {textoDeHoy(editado, sede)}
          </p>
        </div>
      </div>
      {prenda.cantidad !== undefined && (
        <div className={`whitespace-nowrap text-right ${conCosto ? "@min-[1000px]:text-left" : "@min-[820px]:text-left"}`}>
          <span className="campo-etiqueta block">Llegaron</span>
          <div className={`mt-1.5 ${contenido}`}>
            <p className="text-sm font-semibold leading-tight tabular-nums text-tinta">
              {prenda.cantidad.toLocaleString("es-PE")} {prenda.cantidad === 1 ? "unidad" : "unidades"}
            </p>
          </div>
        </div>
      )}
      {/* En ancho, `contents` deja al campo y a las opciones como celdas de la fila; en angosto son una segunda línea. */}
      <div className={`col-span-2 flex flex-wrap items-start gap-x-3 gap-y-2 ${conCosto ? "@min-[1000px]:contents" : "@min-[820px]:contents"}`}>
        {conCosto && (
          <div className="w-36 shrink-0">
            <CampoTexto
              etiqueta="Costo"
              aria-label={`Costo de ${nombre}`}
              inputMode="decimal"
              value={costo.valor}
              // sugerir-fijo: un costo es un monto de soles, no depende de nada elegido antes
              placeholder={costo.deLaLinea.trim() ? `S/\u00a0${costo.deLaLinea}` : "S/\u00a00.00"}
              onChange={(e) => onCosto(e.target.value)}
              tono={costo.problema ? "error" : undefined}
              pie={costo.problema ?? (hayCambio ? `Antes S/\u00a0${costo.antes.trim() || "—"}` : undefined)}
              sinPie={!costo.problema && !hayCambio}
              className="text-right font-semibold tabular-nums"
            />
          </div>
        )}
        <div className="w-36 shrink-0">
          <CampoTexto
            etiqueta="Precio de venta"
            aria-label={`Precio de venta de ${nombre}`}
            inputMode="decimal"
            value={editado?.valor ?? ""}
            // sugerir-fijo: un precio es un monto de soles, no depende de nada elegido antes
            placeholder="S/ 0.00"
            onChange={(e) => onValor(e.target.value)}
            tono={problema ? "error" : undefined}
            sinPie
            className="text-right font-semibold tabular-nums"
          />
        </div>
        <div>
          <span className="campo-etiqueta block">¿Dónde vale?</span>
          <div className={`mt-1.5 ${conCosto ? "@min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:items-center" : "@min-[820px]:flex @min-[820px]:min-h-10 @min-[820px]:items-center"}`}>
            {soloSede ? (
              // Una terminal (Felipe 2026-10-26, ADR-0531): solo su sede; la base no le deja cambiar el de todas.
              <p className="text-xs text-taupe">Solo en {sede}: las otras sedes no cambian.</p>
            ) : (
              <ElegirOpcion
                chico
                etiqueta={`Dónde vale el precio de venta de ${nombre}`}
                // Felipe 2026-10-26: la primera opción es la sede que recibe y viene marcada; «Todas las sedes» es la segunda.
                opciones={[
                  { valor: "sede", texto: `Solo ${sede}` },
                  { valor: "todas", texto: "Todas las sedes" },
                ]}
                valor={alcance}
                onValor={(v) => onAlcance(v as "todas" | "sede")}
              />
            )}
          </div>
        </div>
      </div>
      {/* El motivo va bajo la fila, a todo el ancho (el campo es angosto y un motivo largo se partía en una columna), con el pie de error de siempre. */}
      {problema && (
        <p role="alert" className="col-span-full text-xs leading-tight text-rojo-profundo">
          <span className="pie-error trazo-dibuja anim-revelar">
            <CircleAlert aria-hidden />
            <span>{problema}</span>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Una fila de solo costo (ADR-0519, Felipe 2026-10-26): lo que se puede costear pero no tiene precio de venta en esta pantalla. Sirve para
 * (a) una prenda NUEVA ya descrita que todavía no se crea («holaa · por crear»: su precio se pone al crearla) y (b) la línea que no estaba en
 * la guía, cuyo costo es obligatorio y no viene de ninguna orden. Lo que no tiene nombre NO tiene fila: no se cambia el costo de algo que no
 * se sabe qué es.
 */
export function FilaDeCosto({
  titulo,
  subtitulo,
  unidades,
  nombre,
  costo,
  placeholder,
  onCosto,
  marca,
}: {
  /** Lo que se lee en la primera columna: el nombre de la prenda o «Toda la línea». */
  titulo: string;
  subtitulo: string;
  /** Cuántas unidades llegaron de esto; `null` si no se dice. */
  unidades: number | null;
  /** Cómo se llama, para el lector de pantalla: «Costo de holaa». */
  nombre: string;
  costo: { valor: string; deLaLinea: string; antes: string; problema: string | null };
  placeholder: string;
  onCosto: (valor: string) => void;
  /** Lo que distingue a esta fila en pruebas y guía: `nueva` o `linea`. */
  marca: "nueva" | "linea";
}) {
  const nuevo = leerCostoCierre(costo.valor.trim() ? costo.valor : costo.deLaLinea);
  const hayCambio = nuevo.problema === null && nuevo.valor !== leerCostoCierre(costo.antes).valor;
  const contenido = "@min-[1000px]:flex @min-[1000px]:min-h-10 @min-[1000px]:flex-col @min-[1000px]:justify-center";
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 @min-[1000px]:grid-cols-[minmax(0,16rem)_6.5rem_9rem] @min-[1000px]:justify-start"
      data-costo-de={marca}
    >
      <div className="min-w-0">
        <span className="campo-etiqueta block">Prenda</span>
        <div className={`mt-1.5 ${contenido}`}>
          <p className="truncate text-sm font-medium leading-tight text-tinta" title={titulo}>
            {titulo}
          </p>
          <p className="truncate text-xs leading-tight text-taupe">{subtitulo}</p>
        </div>
      </div>
      <div className="whitespace-nowrap text-right @min-[1000px]:text-left">
        <span className="campo-etiqueta block">Llegaron</span>
        <div className={`mt-1.5 ${contenido}`}>
          <p className="text-sm font-semibold leading-tight tabular-nums text-tinta">
            {unidades == null ? "—" : `${unidades.toLocaleString("es-PE")} ${unidades === 1 ? "unidad" : "unidades"}`}
          </p>
        </div>
      </div>
      <div className="col-span-2 @min-[1000px]:col-span-1">
        <div className="w-36 shrink-0">
          <CampoTexto
            etiqueta="Costo"
            aria-label={`Costo de ${nombre}`}
            inputMode="decimal"
            value={costo.valor}
            // sugerir-fijo: un costo es un monto de soles, no depende de nada elegido antes
            placeholder={placeholder}
            onChange={(e) => onCosto(e.target.value)}
            tono={costo.problema ? "error" : undefined}
            pie={costo.problema ?? (hayCambio ? `Antes S/\u00a0${costo.antes.trim() || "—"}` : undefined)}
            sinPie={!costo.problema && !hayCambio}
            className="text-right font-semibold tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}
