"use client";

import { useEffect, useMemo, useState } from "react";

// Generador de etiquetas de código de barras para la Brother QL-1110NWB (rollo
// 62mm). Código de barras Code 128 B — el estándar retail que la pistola Zebra
// lee sin configurar nada. Se genera aquí mismo como SVG: sin librerías externas,
// sin internet, sin depender de nadie.

type VarianteEtiqueta = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
};

type Seleccion = { variante: VarianteEtiqueta; cantidad: number };

// Tabla oficial de patrones Code 128 (anchos de barra/espacio por símbolo, 0-106).
const PATRONES = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232",
];
const PATRON_STOP = "2331112";

/** SVG Code 128 B del texto dado. Devuelve null si hay caracteres fuera de rango. */
function Codigo128({ texto, alto = 44 }: { texto: string; alto?: number }) {
  const barras = useMemo(() => {
    const valores: number[] = [];
    for (const ch of texto) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) return null; // fuera de Code 128 B
      valores.push(code - 32);
    }
    let checksum = 104; // start B
    valores.forEach((v, i) => (checksum += v * (i + 1)));
    checksum %= 103;

    const secuencia = [104, ...valores, checksum];
    const patron = secuencia.map((v) => PATRONES[v]).join("") + PATRON_STOP;

    const rects: { x: number; w: number }[] = [];
    let x = 0;
    let esBarra = true;
    for (const d of patron) {
      const w = Number(d);
      if (esBarra) rects.push({ x, w });
      x += w;
      esBarra = !esBarra;
    }
    return { rects, total: x };
  }, [texto]);

  if (!barras) return <p className="text-[8px] text-rojo">SKU con caracteres no imprimibles</p>;

  return (
    <svg
      viewBox={`0 0 ${barras.total} ${alto}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: alto }}
      shapeRendering="crispEdges"
    >
      {barras.rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={alto} fill="#000" />
      ))}
    </svg>
  );
}

export function EtiquetasGenerator({ variantes }: { variantes: VarianteEtiqueta[] }) {
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion[]>([]);
  const [conPrecio, setConPrecio] = useState(true);

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantes
      .filter((v) => `${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
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
        <label className="label-cayla text-[10px] text-tinta/50">Buscar prenda para etiquetar</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Referencia, SKU, talla, color…"
          className="w-full border-b border-tinta/20 bg-transparent px-1 py-2.5 text-sm text-tinta outline-none placeholder:text-tinta/35 focus:border-rojo"
        />
        {resultados.length > 0 && (
          <div className="divide-y divide-tinta/5 border border-tinta/10 bg-papel">
            {resultados.map((v) => (
              <button
                key={v.varianteId}
                onClick={() => agregar(v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sand/40"
              >
                <span className="text-tinta">
                  {v.referencia} <span className="text-tinta/45">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                </span>
                <span className="font-mono text-[10px] text-tinta/35">{v.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {seleccion.length > 0 && (
        <>
          <div className="divide-y divide-tinta/5 border border-tinta/10 bg-papel">
            {seleccion.map((s) => (
              <div key={s.variante.varianteId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex-1">
                  <p className="text-tinta">
                    {s.variante.referencia}{" "}
                    <span className="text-tinta/45">{[s.variante.talla, s.variante.color].filter(Boolean).join("/")}</span>
                  </p>
                  <p className="font-mono text-[10px] text-tinta/35">{s.variante.sku}</p>
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
              className="label-cayla bg-tinta px-5 py-3 text-[10px] text-crema transition-colors hover:bg-rojo"
            >
              Imprimir {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"}
            </button>
            <label className="flex items-center gap-2 text-xs text-tinta/60">
              <input type="checkbox" checked={conPrecio} onChange={(e) => setConPrecio(e.target.checked)} />
              Incluir precio
            </label>
            <span className="text-xs text-tinta/40">
              En el diálogo de impresión elige la Brother QL y papel de 62×29mm, margen 0.
            </span>
          </div>

          {/* Vista previa (y contenido real de impresión) */}
          <div id="etiquetas-print" className="flex flex-wrap gap-3">
            {etiquetas.map((e) => (
              <div
                key={e.key}
                className="etiqueta-impresa flex flex-col justify-between border border-tinta/15 bg-white p-2"
                style={{ width: "62mm", height: "29mm" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[9px] font-medium uppercase tracking-wide text-black">
                    {e.referencia}
                  </p>
                  {conPrecio && e.precio != null && (
                    <p className="shrink-0 text-[10px] font-semibold text-black">S/{e.precio.toFixed(2)}</p>
                  )}
                </div>
                <p className="text-[8px] uppercase text-black">
                  {[e.talla, e.color].filter(Boolean).join(" · ")}
                </p>
                <Codigo128 texto={e.sku} alto={38} />
                <p className="text-center font-mono text-[8px] tracking-wider text-black">{e.sku}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {seleccion.length === 0 && (
        <p className="font-display border border-tinta/10 bg-papel py-10 text-center text-base italic text-tinta/40">
          Busca una prenda y agrégala para generar sus etiquetas.
        </p>
      )}
    </div>
  );
}
