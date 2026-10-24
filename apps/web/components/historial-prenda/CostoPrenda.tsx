"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CircleHelp, Equal, Pencil } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import {
  Encabezado,
  Tabla,
  celda,
  fila,
  type Columna,
} from "@/components/ui/Tabla";
import { Linea } from "@/components/ui/Linea";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  cuentaDeCompra,
  diaCorto,
  fraseDeRespuesta,
  graficoDelCosto,
  movidaDeCompra,
  respuestaCosto,
  textoDeMovida,
  type CompraCosto,
  type CostoPrenda as Costo,
  type ErrorArreglado,
  type Movida,
} from "@/lib/costo-prenda-reglas";
import { soles } from "@/lib/historial-prenda-reglas";

/**
 * La pestaña «Costo» del Historial de la prenda (maqueta elegida por Felipe el 2026-10-24:
 * docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html). Primero la respuesta —cuánto cuesta hoy cada prenda y si
 * subió o bajó—, después una fila por compra: cuántas llegaron y a cuánto, cuántas ya había y a cuánto, y en cuánto quedó.
 * La cuenta, a un toque en «?». Solo la ve quien ve el dinero de compras (lo decide la base: sin permiso no llega `costo`).
 * El gráfico de escalera lleva un número por compra: tocar el número enciende su fila y tocar la fila enciende el número.
 * Los costos que alguien arregló a mano van aparte, en «Errores arreglados», y en el gráfico solo como un lápiz sobre su fecha: no
 * mueven la línea (el gráfico ya usa el número bueno).
 */

// La tabla decide su forma por el ancho de su tarjeta (en la vista rápida es angosta aunque la pantalla sea ancha): desde 560 px
// de tarjeta, columnas; más angosta, tres líneas por compra. Las clases van escritas enteras: Tailwind solo genera lo que lee.
const PLANTILLA =
  "@min-[560px]:grid-cols-[28px_64px_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)]";
const COLUMNAS: Columna[] = [
  { titulo: "" },
  { titulo: "Fecha" },
  { titulo: "Llegaron" },
  { titulo: "Ya tenías" },
  { titulo: "Costo queda en" },
  { titulo: "Documento", alinear: "der" },
];

export function CostoPrenda({
  costo,
  errores,
}: {
  costo: Costo;
  errores: readonly ErrorArreglado[];
}) {
  const r = respuestaCosto(costo);
  // «Ahora» se fija al dibujar: el escalón de hoy no se corre mientras la pestaña está abierta.
  const [ahora] = useState(() => Date.now());
  const g = useMemo(() => graficoDelCosto(costo, ahora), [costo, ahora]);
  const [activa, setActiva] = useState<number | null>(null);
  const tabla = useRef<HTMLDivElement>(null);
  const elegir = (n: number, llevar: boolean) => {
    setActiva((a) => (a === n ? null : n));
    // Desde el gráfico, la fila elegida se deja a la vista (solo si no se ve); desde la fila, no se mueve nada.
    const f = llevar
      ? tabla.current?.querySelector<HTMLElement>(`[data-compra="${n}"]`)
      : null;
    if (f) {
      const rect = f.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight)
        f.scrollIntoView({
          block: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
    }
  };
  // El error que se acaba de elegir desde su lápiz: se enciende un momento en la lista.
  const [destello, setDestello] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const irAlError = (id: string) => {
    const f = lista.current?.querySelector<HTMLElement>(`[data-error="${id}"]`);
    f?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    setDestello(id);
    window.setTimeout(() => setDestello((d) => (d === id ? null : d)), 1400);
  };
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (k: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  return (
    <div className="space-y-3">
      <section
        data-guia="historial-prenda.costo-respuesta"
        className="card-cayla flex flex-wrap items-end justify-between gap-4 px-5 py-4"
      >
        <div className="min-w-0">
          <p className="text-[14px] text-tinta/75">Hoy cada prenda te cuesta</p>
          <p className="font-display mt-0.5 text-[44px] leading-none text-tinta tabular-nums">
            {soles(r.hoy)}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-tinta/75">
            {r.cambio !== 0 && (
              <Chip tono={r.cambio > 0 ? "ambar" : "verde"} versalitas={false}>
                {r.cambio > 0 ? (
                  <ArrowUp aria-hidden className="h-3 w-3" />
                ) : (
                  <ArrowDown aria-hidden className="h-3 w-3" />
                )}
                {soles(Math.abs(r.cambio))} {r.cambio > 0 ? "más" : "menos"} que
                al principio
              </Chip>
            )}
            <span>{fraseDeRespuesta(r)}</span>
          </div>
        </div>
        <p className="text-right text-[12.5px] text-tinta/65">
          En stock
          <span className="font-display block text-[28px] leading-tight text-tinta tabular-nums">
            {r.stock}
          </span>
          {r.stock === 1 ? "prenda" : "prendas"}
        </p>
      </section>

      {g && (
        <section
          data-guia="historial-prenda.costo-grafico"
          className="card-cayla px-5 pb-3 pt-4"
        >
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <TituloSeccion nivel={3}>Cuánto te costó cada prenda</TituloSeccion>
            <span className="text-[12.5px] text-tinta/65">
              Toca un número para ver esa compra
            </span>
          </div>
          <Linea
            serie={g.puntos}
            escalones
            desde={g.desde}
            hasta={g.hasta}
            minY={g.minY}
            maxY={g.maxY}
            formatoY={(v) => `S/\u00a0${v.toFixed(v % 1 ? 1 : 0)}`}
            marcasX={g.fechas}
            cifra={soles(r.hoy)}
            alto={230}
            etiqueta={`Costo por prenda: empezó en ${soles(r.desde)} y hoy es ${soles(r.hoy)}`}
            marcas={g.marcas.map((m) => ({
              x: m.x,
              y: m.y,
              n: m.n,
              texto: textoDeMovida(m.movida),
              tono:
                m.movida.tipo === "sube"
                  ? "sube"
                  : m.movida.tipo === "baja"
                    ? "baja"
                    : "neutro",
              activa: activa === m.n,
              etiqueta: `Compra ${m.n}, ${diaCorto(m.fecha)}: ${textoDeMovida(m.movida).replace(/^[↑↓] /, "")}`,
              onElegir: () => elegir(m.n, true),
            }))}
            arreglos={errores.map((e) => ({
              x: Date.parse(e.cuando),
              etiqueta: `Error arreglado el ${diaCorto(e.cuando)}: ${soles(e.antes)} pasó a ${soles(e.despues)}`,
              onElegir: () => irAlError(e.id),
            }))}
          />
        </section>
      )}

      {costo.compras.length > 0 && (
        <section data-guia="historial-prenda.costo-compras" ref={tabla}>
          <TituloSeccion
            nivel={3}
            cuenta={costo.compras.length}
            className="mb-2"
          >
            Compras que movieron el costo
          </TituloSeccion>
          <Tabla className="@container">
            <Encabezado
              columnas={COLUMNAS}
              plantilla={PLANTILLA}
              visible="hidden @min-[560px]:grid"
            />
            {costo.compras.map((c, i) => {
              const k = c.fecha;
              return (
                <FilaCompra
                  key={k}
                  compra={c}
                  numero={i + 1}
                  activa={activa === i + 1}
                  onElegir={() => elegir(i + 1, false)}
                  abierta={abiertas.has(k)}
                  onAlternar={() => alternar(k)}
                />
              );
            })}
          </Tabla>
        </section>
      )}

      {errores.length > 0 && (
        <section
          data-guia="historial-prenda.costo-errores"
          ref={lista}
          className="card-cayla px-5 py-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <TituloSeccion nivel={3} cuenta={errores.length}>
              Errores arreglados
            </TituloSeccion>
            <span className="text-[12.5px] text-tinta/65">
              no cambian el costo
            </span>
          </div>
          <ul className="mt-1">
            {errores.map((e) => (
              <li
                key={e.id}
                data-error={e.id}
                aria-current={destello === e.id ? "true" : undefined}
                className={`grid grid-cols-[24px_52px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 rounded-lg border-t border-dashed border-sand px-1 py-2 text-[13px] transition-colors duration-300 first:border-t-0 sm:grid-cols-[24px_52px_auto_minmax(0,1fr)] ${destello === e.id ? "bg-hueso" : ""}`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-pizarra text-pizarra">
                  <Pencil aria-hidden className="h-3 w-3" /> {/* unificar-fijo: marca de un costo arreglado, no la acción de editar */}
                </span>
                <span className="text-[12.5px] text-tinta/65 tabular-nums">
                  {diaCorto(e.cuando)}
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  <s className="text-tinta/55">{soles(e.antes)}</s> →{" "}
                  <b className="font-semibold">{soles(e.despues)}</b>
                </span>
                <span className="col-start-3 text-[12px] text-tinta/65 sm:col-start-auto sm:text-right">
                  costo declarado
                  {e.variantes > 1 ? ` · en ${e.variantes} variantes` : ""}
                  {e.persona ? ` · ${e.persona}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilaCompra({
  compra: c,
  numero,
  activa,
  onElegir,
  abierta,
  onAlternar,
}: {
  compra: CompraCosto;
  numero: number;
  activa: boolean;
  onElegir: () => void;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const m = movidaDeCompra(c);
  // En angosto, tres líneas: el número a la izquierda, lo que llegó al centro y el costo a la derecha.
  return (
    <div
      className={fila(
        PLANTILLA,
        `cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 @min-[560px]:items-center`,
      )}
      role="row"
      data-compra={numero}
      aria-current={activa ? "true" : undefined}
      // Un clic en cualquier parte de la fila la elige; el «?» y el número hacen lo suyo.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) onElegir();
      }}
    >
      <span className={`row-span-3 @min-[560px]:row-span-1`} role="cell">
        <button
          type="button"
          onClick={onElegir}
          aria-pressed={activa}
          aria-label={`Compra ${numero}: verla en el gráfico`}
          className={`grid h-6 w-6 place-items-center rounded-full border-2 border-tinta text-[11.5px] font-semibold tabular-nums transition-colors duration-200 ${activa ? "bg-tinta text-papel" : "text-tinta"}`}
        >
          {numero}
        </button>
      </span>
      <span
        className={celda(
          "izq",
          `col-start-2 text-[12.5px] text-tinta/65 @min-[560px]:col-auto @min-[560px]:text-[13.5px]`,
        )}
        role="cell"
      >
        {diaCorto(c.fecha)}
      </span>
      <span
        className={celda(
          "izq",
          `col-start-2 tabular-nums @min-[560px]:col-auto`,
        )}
        role="cell"
      >
        <b className="font-semibold">+{c.llegaron}</b> a{" "}
        {soles(c.costoLlegaron)}
        {c.origen === "produccion" && (
          <span className="text-tinta/65"> · del Taller</span>
        )}
      </span>
      <span
        className={celda(
          "izq",
          `col-start-2 text-[12.5px] tabular-nums text-tinta/75 @min-[560px]:col-auto @min-[560px]:text-[13.5px]`,
        )}
        role="cell"
      >
        <span className={`@min-[560px]:hidden`}>ya tenías </span>
        {c.yaHabia > 0 && c.costoAntes !== null
          ? `${c.yaHabia} a ${soles(c.costoAntes)}`
          : "ninguna"}
      </span>
      <span
        className={`col-start-3 row-start-1 row-span-2 flex flex-col items-end gap-1 @min-[560px]:col-auto @min-[560px]:row-auto @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-2`}
        role="cell"
      >
        <span className="font-display whitespace-nowrap text-[19px] leading-none text-tinta tabular-nums">
          {soles(c.costoDespues)}
        </span>
        <span className="flex items-center gap-1.5">
          <MarcaMovida movida={m} />
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierta}
            aria-label="Cómo se calcula"
            title="Cómo se calcula"
            className="grid h-6 w-6 place-items-center rounded-full text-tinta/65 transition-colors hover:text-tinta"
          >
            <CircleHelp aria-hidden className="h-4 w-4" />
          </button>
        </span>
      </span>
      <span
        className={celda(
          "der",
          `col-start-3 text-[12px] text-tinta/65 @min-[560px]:col-auto`,
        )}
        role="cell"
        title={[c.proveedor, c.persona].filter(Boolean).join(" · ")}
      >
        {c.documento ?? (c.origen === "produccion" ? "Taller" : "—")}
      </span>
      {abierta && (
        <p
          className={`col-span-full @min-[560px]:col-start-2 text-[12.5px] tabular-nums text-tinta/75 anim-revelar`}
        >
          {cuentaDeCompra(c)}
        </p>
      )}
    </div>
  );
}

function MarcaMovida({ movida: m }: { movida: Movida }) {
  if (m.tipo === "primera")
    return (
      <Chip tono="neutro" versalitas={false}>
        primera
      </Chip>
    );
  if (m.tipo === "igual")
    return (
      <Chip tono="neutro" versalitas={false}>
        <Equal aria-hidden className="h-3 w-3" />
        igual
      </Chip>
    );
  return (
    <Chip tono={m.tipo === "sube" ? "ambar" : "verde"} versalitas={false}>
      {m.tipo === "sube" ? (
        <ArrowUp aria-hidden className="h-3 w-3" />
      ) : (
        <ArrowDown aria-hidden className="h-3 w-3" />
      )}
      <span className="sr-only">{m.tipo === "sube" ? "subió" : "bajó"}</span>
      {m.monto.toFixed(2)}
    </Chip>
  );
}
