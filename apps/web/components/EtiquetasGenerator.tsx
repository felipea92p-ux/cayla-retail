"use client";

import { useEffect, useMemo, useState } from "react";
import { CodigoQR } from "@/components/CodigoQR";
// `Codigo128` sigue en el repo, arreglado y verificado con la Zebra el 2026-09-09,
// pero la etiqueta imprime QR: es lo que CAYLA ya usa, y no tiene el techo de 15
// caracteres que dejaba afuera a una talla XXL. Leer sigue funcionando con ambos.

/**
 * Etiquetas para la Brother QL-1110NWB (rollo de 62 mm). QR para la máquina y los
 * caracteres al lado para el ojo — verificado con la pistola Zebra el 2026-09-10.
 *
 * POR QUÉ HAY MODOS EN LOTE. Buscar y agregar de a una sirve para reimprimir una
 * etiqueta que se despegó. No sirve para el censo: después de contar una tienda hay
 * decenas de prendas nuevas que nunca tuvieron etiqueta, y pedirlas una por una es el
 * tipo de trabajo que hace que el sistema se abandone a mitad de camino. El cierre
 * del día es contar → crear → **imprimir todo junto** → pegar.
 */

type VarianteEtiqueta = {
  varianteId: string;
  productoId: string;
  sku: string;
  /** El corto (BLU-0042-AZM-M). Es lo que se imprime; `sku` es el respaldo. */
  codigo: string | null;
  referencia: string;
  familia: string | null;
  categoria: string | null;
  talla: string | null;
  color: string | null;
  precio: number | null;
  /** Unidades en la sede donde está parada la persona. Una etiqueta por prenda física. */
  stockEnMiSede: number;
};

/** Lo contado en el conteo abierto: el atajo del final del día de censo. */
export type ContadaEnConteo = { varianteId: string; contadas: number };

type Seleccion = { variante: VarianteEtiqueta; cantidad: number };

/**
 * Tope por tanda. Cada etiqueta es un SVG de QR en el DOM; a varios cientos, la
 * computadora de la tienda se ahoga abriendo el diálogo de impresión. Es una
 * restricción honesta y se dice en pantalla, no un límite escondido.
 */
const POR_TANDA = 120;

export function EtiquetasGenerator({
  variantes,
  sedeCodigo,
  contadasEnConteo = [],
}: {
  variantes: VarianteEtiqueta[];
  sedeCodigo: string;
  contadasEnConteo?: ContadaEnConteo[];
}) {
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion[]>([]);
  const [conPrecio, setConPrecio] = useState(true);
  const [porStock, setPorStock] = useState(true);
  const [familia, setFamilia] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tanda, setTanda] = useState(0);

  const porVariante = useMemo(
    () => new Map(variantes.map((v) => [v.varianteId, v])),
    [variantes]
  );

  const familias = useMemo(
    () => Array.from(new Set(variantes.map((v) => v.familia).filter(Boolean) as string[])).sort(),
    [variantes]
  );
  const categorias = useMemo(
    () =>
      Array.from(
        new Set(
          variantes
            .filter((v) => !familia || v.familia === familia)
            .map((v) => v.categoria)
            .filter(Boolean) as string[]
        )
      ).sort(),
    [variantes, familia]
  );

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantes
      .filter((v) =>
        `${v.codigo ?? ""} ${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 6);
  }, [variantes, q]);

  /** Cuántas etiquetas por prenda: una por unidad en la sede, o una sola. */
  const cuantas = (v: VarianteEtiqueta) => (porStock ? Math.max(1, v.stockEnMiSede) : 1);

  function agregarVarias(nuevas: { variante: VarianteEtiqueta; cantidad: number }[]) {
    if (nuevas.length === 0) return;
    setSeleccion((actual) => {
      const porId = new Map(actual.map((s) => [s.variante.varianteId, s]));
      for (const n of nuevas) {
        // Se FIJA la cantidad en vez de sumarla: agregar un lote dos veces por error
        // no debería duplicar 200 etiquetas. Sumar es el gesto de la búsqueda de a una.
        porId.set(n.variante.varianteId, { variante: n.variante, cantidad: n.cantidad });
      }
      return [...porId.values()];
    });
    setTanda(0);
  }

  function agregarUna(v: VarianteEtiqueta) {
    setSeleccion((actual) => {
      const existe = actual.find((s) => s.variante.varianteId === v.varianteId);
      if (existe) {
        return actual.map((s) =>
          s.variante.varianteId === v.varianteId ? { ...s, cantidad: s.cantidad + 1 } : s
        );
      }
      return [...actual, { variante: v, cantidad: cuantas(v) }];
    });
    setQ("");
  }

  const delModelo = (productoId: string) => variantes.filter((v) => v.productoId === productoId);

  const porFiltro = useMemo(
    () =>
      familia || categoria
        ? variantes.filter(
            (v) => (!familia || v.familia === familia) && (!categoria || v.categoria === categoria)
          )
        : [],
    [variantes, familia, categoria]
  );

  const delConteo = useMemo(
    () =>
      contadasEnConteo
        .map((c) => ({ variante: porVariante.get(c.varianteId), cantidad: c.contadas }))
        .filter((x): x is { variante: VarianteEtiqueta; cantidad: number } => Boolean(x.variante)),
    [contadasEnConteo, porVariante]
  );

  function imprimir() {
    document.body.classList.add("imprimiendo-etiquetas");
    window.print();
  }
  useEffect(() => {
    const limpiar = () => document.body.classList.remove("imprimiendo-etiquetas");
    window.addEventListener("afterprint", limpiar);
    return () => window.removeEventListener("afterprint", limpiar);
  }, []);

  const totalEtiquetas = seleccion.reduce((a, s) => a + s.cantidad, 0);
  const tandas = Math.max(1, Math.ceil(totalEtiquetas / POR_TANDA));
  const tandaActual = Math.min(tanda, tandas - 1);

  const todas = seleccion.flatMap((s) =>
    Array.from({ length: s.cantidad }, (_, i) => ({
      ...s.variante,
      key: `${s.variante.varianteId}-${i}`,
    }))
  );
  const etiquetas = todas.slice(tandaActual * POR_TANDA, (tandaActual + 1) * POR_TANDA);

  return (
    <div className="space-y-5">
      {/* ---------- en lote: lo que hace usable el final de un censo ---------- */}
      <div className="card-cayla space-y-4 p-4">
        <p className="label-cayla text-[10px] text-tinta/70">Agregar en lote</p>

        {delConteo.length > 0 && (
          <button
            onClick={() => agregarVarias(delConteo)}
            className="label-cayla w-full rounded-md border border-rojo px-4 py-3 text-left text-[10px] text-rojo transition-colors hover:bg-rojo hover:text-crema"
          >
            Las {delConteo.length} prendas del conteo abierto en {sedeCodigo}
            <span className="ml-2 normal-case tracking-normal opacity-80">
              — con las cantidades que contaste
            </span>
          </button>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="label-cayla text-[10px] text-tinta/60">Familia</label>
            <select
              value={familia}
              onChange={(e) => {
                setFamilia(e.target.value);
                setCategoria("");
              }}
              className="w-full card-cayla px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Todas</option>
              {familias.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <label className="label-cayla text-[10px] text-tinta/60">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full card-cayla px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={porFiltro.length === 0}
            onClick={() => agregarVarias(porFiltro.map((v) => ({ variante: v, cantidad: cuantas(v) })))}
            className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            Agregar {porFiltro.length || ""}
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-tinta/75">
          <input type="checkbox" checked={porStock} onChange={(e) => setPorStock(e.target.checked)} />
          Una etiqueta por prenda que hay en {sedeCodigo} (si no, una por modelo)
        </label>
      </div>

      {/* ---------- de a una: para reimprimir la que se despegó ---------- */}
      <div className="space-y-1.5">
        <label className="label-cayla text-[10px] text-tinta/70">O buscar una prenda</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Referencia, código, talla, color…"
          className="w-full border-b border-tinta/20 bg-transparent px-1 py-2.5 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo"
        />
        {resultados.length > 0 && (
          <div className="divide-y divide-tinta/5 card-cayla">
            {resultados.map((v) => {
              const hermanas = delModelo(v.productoId);
              return (
                <div key={v.varianteId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <button onClick={() => agregarUna(v)} className="min-w-0 flex-1 text-left">
                    <span className="text-tinta">
                      {v.referencia}{" "}
                      <span className="text-tinta/65">
                        {[v.talla, v.color].filter(Boolean).join("/")}
                      </span>
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-tinta/65">
                      {v.codigo ?? v.sku}
                    </span>
                  </button>
                  {hermanas.length > 1 && (
                    <button
                      onClick={() =>
                        agregarVarias(hermanas.map((h) => ({ variante: h, cantidad: cuantas(h) })))
                      }
                      className="label-cayla shrink-0 rounded border border-tinta/20 px-2 py-1 text-[9px] text-tinta/75 hover:border-rojo hover:text-rojo"
                    >
                      + el modelo ({hermanas.length})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {seleccion.length > 0 && (
        <>
          <div className="divide-y divide-tinta/5 card-cayla">
            {seleccion.map((s) => (
              <div key={s.variante.varianteId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-tinta">
                    {s.variante.referencia}{" "}
                    <span className="text-tinta/65">
                      {[s.variante.talla, s.variante.color].filter(Boolean).join("/")}
                    </span>
                  </p>
                  <p className="font-mono text-[10px] text-tinta/65">
                    {s.variante.codigo ?? s.variante.sku}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={s.cantidad}
                  onChange={(e) =>
                    setSeleccion((actual) =>
                      actual.map((x) =>
                        x.variante.varianteId === s.variante.varianteId
                          ? { ...x, cantidad: Math.max(1, Number(e.target.value)) }
                          : x
                      )
                    )
                  }
                  className="w-16 border border-tinta/20 bg-crema px-1.5 py-1 text-center text-xs text-tinta outline-none focus:border-rojo"
                />
                <button
                  onClick={() =>
                    setSeleccion((actual) =>
                      actual.filter((x) => x.variante.varianteId !== s.variante.varianteId)
                    )
                  }
                  className="label-cayla shrink-0 text-[9px] text-rojo"
                >
                  Quitar
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-tinta/70">
                {seleccion.length} prendas · {totalEtiquetas} etiquetas
              </span>
              <button
                onClick={() => setSeleccion([])}
                className="label-cayla text-[9px] text-tinta/60 hover:text-rojo"
              >
                Vaciar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={imprimir}
              className="label-cayla rounded-md bg-tinta px-5 py-3 text-[10px] text-crema transition-colors hover:bg-rojo"
            >
              Imprimir {etiquetas.length} etiqueta{etiquetas.length === 1 ? "" : "s"}
              {tandas > 1 && ` · tanda ${tandaActual + 1} de ${tandas}`}
            </button>

            {tandas > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={tandaActual === 0}
                  onClick={() => setTanda(tandaActual - 1)}
                  className="label-cayla rounded border border-tinta/20 px-2.5 py-2 text-[10px] text-tinta disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  disabled={tandaActual >= tandas - 1}
                  onClick={() => setTanda(tandaActual + 1)}
                  className="label-cayla rounded border border-tinta/20 px-2.5 py-2 text-[10px] text-tinta disabled:opacity-40"
                >
                  Siguiente tanda →
                </button>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-tinta/75">
              <input
                type="checkbox"
                checked={conPrecio}
                onChange={(e) => setConPrecio(e.target.checked)}
              />
              Incluir precio
            </label>
          </div>

          <p className="text-xs text-tinta/65">
            En el diálogo de impresión elige la Brother QL y papel de 62×29 mm, margen 0.
            {tandas > 1 &&
              ` Se imprime de a ${POR_TANDA} para que el navegador no se ahogue: imprime esta tanda, después pasa a la siguiente.`}
          </p>

          {/* Vista previa (y contenido real de impresión) */}
          <div id="etiquetas-print" className="flex flex-wrap gap-3">
            {etiquetas.map((e) => (
              <div
                key={e.key}
                className="etiqueta-impresa flex items-center gap-2 border border-tinta/15 bg-white"
                style={{ width: "62mm", height: "29mm", padding: "2mm" }}
              >
                {/* El QR para la máquina; los caracteres de al lado, para el ojo. Es lo
                    que hace hoy casi todo el retail, y lo que ya usa CAYLA. */}
                <div className="shrink-0">
                  <CodigoQR texto={e.codigo ?? e.sku} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-[0.4mm]">
                  <p className="truncate text-[9px] font-semibold uppercase leading-tight tracking-wide text-black">
                    {e.referencia}
                  </p>
                  <p className="truncate text-[8px] uppercase leading-tight text-black">
                    {[e.talla, e.color].filter(Boolean).join(" · ")}
                  </p>
                  {conPrecio && e.precio != null && (
                    <p className="text-[12px] font-semibold leading-tight text-black">
                      S/{e.precio.toFixed(2)}
                    </p>
                  )}
                  {/* El código impreso importa tanto como el QR: es lo que alguien dicta
                      por teléfono cuando la otra sede pregunta si hay una talla. */}
                  <p className="truncate font-mono text-[7px] leading-tight tracking-wider text-black">
                    {e.codigo ?? e.sku}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {seleccion.length === 0 && (
        <p className="font-display card-cayla py-10 text-center text-base italic text-tinta/65">
          Agrega un lote o busca una prenda para generar sus etiquetas.
        </p>
      )}
    </div>
  );
}
