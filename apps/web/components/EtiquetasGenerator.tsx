"use client";

import { useEffect, useMemo, useState } from "react";
import { CodigoQR } from "@/components/CodigoQR";
// `Codigo128` sigue en el repo, arreglado y verificado con la Zebra el 2026-09-09,
// pero la etiqueta imprime QR: es lo que CAYLA ya usa, y no tiene el techo de 15
// caracteres que dejaba afuera a una talla XXL. Leer sigue funcionando con ambos.

// Generador de etiquetas de código de barras para la Brother QL-1110NWB (rollo
// 62mm). Código de barras Code 128 B — el estándar retail que la pistola Zebra
// lee sin configurar nada. Se genera aquí mismo como SVG: sin librerías externas,
// sin internet, sin depender de nadie.

type VarianteEtiqueta = {
  varianteId: string;
  sku: string;
  /** El corto (BLU-0042-AZM-M). Es lo que se imprime; `sku` es el respaldo. */
  codigo: string | null;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
};

type Seleccion = { variante: VarianteEtiqueta; cantidad: number };

export function EtiquetasGenerator({ variantes }: { variantes: VarianteEtiqueta[] }) {
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion[]>([]);
  const [conPrecio, setConPrecio] = useState(true);

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantes
      .filter((v) => `${v.codigo ?? ""} ${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [variantes, q]);

  function agregar(v: VarianteEtiqueta) {
    setSeleccion((actual) => {
      const existe = actual.find((s) => s.variante.varianteId === v.varianteId);
      if (existe) {
        return actual.map((s) =>
          s.variante.varianteId === v.varianteId ? { ...s, cantidad: s.cantidad + 1 } : s
        );
      }
      return [...actual, { variante: v, cantidad: 1 }];
    });
    setQ("");
  }

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

  const etiquetas = seleccion.flatMap((s) =>
    Array.from({ length: s.cantidad }, (_, i) => ({ ...s.variante, key: `${s.variante.varianteId}-${i}` }))
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="label-cayla text-[10px] text-tinta/70">Buscar prenda para etiquetar</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Referencia, SKU, talla, color…"
          className="w-full border-b border-tinta/20 bg-transparent px-1 py-2.5 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo"
        />
        {resultados.length > 0 && (
          <div className="divide-y divide-tinta/5 card-cayla">
            {resultados.map((v) => (
              <button
                key={v.varianteId}
                onClick={() => agregar(v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sand/40"
              >
                <span className="text-tinta">
                  {v.referencia} <span className="text-tinta/65">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                </span>
                <span className="font-mono text-[10px] text-tinta/65">{v.codigo ?? v.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {seleccion.length > 0 && (
        <>
          <div className="divide-y divide-tinta/5 card-cayla">
            {seleccion.map((s) => (
              <div key={s.variante.varianteId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex-1">
                  <p className="text-tinta">
                    {s.variante.referencia}{" "}
                    <span className="text-tinta/65">{[s.variante.talla, s.variante.color].filter(Boolean).join("/")}</span>
                  </p>
                  <p className="font-mono text-[10px] text-tinta/65">{s.variante.codigo ?? s.variante.sku}</p>
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
                  onClick={() => setSeleccion((actual) => actual.filter((x) => x.variante.varianteId !== s.variante.varianteId))}
                  className="label-cayla text-[9px] text-rojo"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={imprimir}
              className="label-cayla rounded-md bg-tinta px-5 py-3 text-[10px] text-crema transition-colors hover:bg-rojo"
            >
              Imprimir {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"}
            </button>
            <label className="flex items-center gap-2 text-xs text-tinta/75">
              <input type="checkbox" checked={conPrecio} onChange={(e) => setConPrecio(e.target.checked)} />
              Incluir precio
            </label>
            <span className="text-xs text-tinta/65">
              En el diálogo de impresión elige la Brother QL y papel de 62×29mm, margen 0.
            </span>
          </div>

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
          Busca una prenda y agrégala para generar sus etiquetas.
        </p>
      )}
    </div>
  );
}
