import type { CSSProperties, ReactNode } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { matrizDeVariantes, prendasTexto, type ModeloIngresado } from "@/lib/ingresos-reglas";
import { MatrizIngreso } from "./MatrizIngreso";

// Lo que se abre bajo un modelo de «Ingresos» (Felipe 2026-11-11: la caja beige maciza rompía el vidrio). Es la misma banda de la fila
// abierta de Rendimiento —un tinte apenas, con su hilo arriba y abajo, que se abre hacia abajo—, no una tarjeta sólida pegada a la tabla:
//   · a la izquierda, la matriz de colores × tallas sobre el vidrio claro (corre con el scroll: sin desenfoque, ADR-0623), con cada celda
//     teñida según cuántas prendas trae, para que lo grueso del pedido se vea antes de leer;
//   · a la derecha, cómo se reparte: por talla y por color, a escala del mayor (`BarraAvance tono="tinta"`, ADR-0358 `grafico.escala`).
//     Con una sola talla o un solo color ese reparto no dice nada y no se dibuja.
// La hoja impresa (`HojaIngresos`) sigue usando solo `<MatrizIngreso>`, sin esta banda.

export function DetalleIngreso({ modelo, id, guia }: { modelo: ModeloIngresado; id: string; guia?: string }) {
  const m = matrizDeVariantes(modelo.variantes);
  const porTalla = m.tallas.map((talla) => ({ clave: talla, nombre: talla, n: m.totalPorTalla[talla] ?? 0 }));
  const porColor = [...m.filas]
    .sort((a, b) => b.total - a.total || (a.color ?? "").localeCompare(b.color ?? "", "es"))
    .map((f) => ({ clave: `${f.color ?? ""}|${f.colorHex ?? ""}`, nombre: f.color ?? "Sin color", hex: f.colorHex, conColor: f.color !== null, n: f.total }));
  const verTallas = porTalla.length > 1;
  const verColores = porColor.length > 1;
  const conReparto = m.filas.length > 0 && (verTallas || verColores);
  const deDosLados = modelo.deStockInicial > 0 && modelo.deRecepcion > 0;

  return (
    <div id={id} data-guia={guia} className="ing-abierto">
      <div>
        <div className="ing-abierto-cuerpo" data-con-reparto={conReparto ? "" : undefined}>
          <section className="ing-placa" aria-label="Colores y tallas">
            <header className="ing-placa-cabeza">
              <h4 className="ing-titulo">Colores y tallas</h4>
              <p className="ing-placa-dato">
                {prendasTexto(m.total)}
                {deDosLados && (
                  <span className="text-taupe">
                    {" "}
                    · {modelo.deRecepcion} por recepción, {modelo.deStockInicial} de inventario inicial
                  </span>
                )}
              </p>
            </header>
            <MatrizIngreso variantes={modelo.variantes} />
          </section>

          {conReparto && (
            <div className="ing-reparto">
              {verTallas && <Reparto titulo="Por talla" filas={porTalla} total={m.total} />}
              {verColores && (
                <Reparto
                  titulo="Por color"
                  filas={porColor.map((c) => ({
                    clave: c.clave,
                    nombre: c.nombre,
                    n: c.n,
                    marca: c.conColor ? <CapsulaColor fondo={c.hex} compacta /> : null,
                  }))}
                  total={m.total}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type FilaReparto = { clave: string; nombre: string; n: number; marca?: ReactNode };

/** Una lista de barras a escala de la mayor: la más larga no está «lista», solo es la que más trajo (por eso, tinta y no verde). */
function Reparto({ titulo, filas, total }: { titulo: string; filas: readonly FilaReparto[]; total: number }) {
  const mayor = Math.max(1, ...filas.map((f) => f.n));
  return (
    <section className="ing-reparto-bloque" aria-label={titulo}>
      <h4 className="ing-titulo">{titulo}</h4>
      <ul className="ing-reparto-lista">
        {filas.map((f, i) => (
          <li key={f.clave} className="ing-reparto-fila" style={{ "--i": i } as CSSProperties}>
            <span className="ing-reparto-nombre">
              {f.marca}
              <span className="truncate">{f.nombre}</span>
            </span>
            <BarraAvance pct={(f.n / mayor) * 100} tono="tinta" alto="fina" decorativa indice={i} />
            <span className="ing-reparto-cifra">
              {f.n}
              <span className="ing-reparto-pct"> · {total > 0 ? Math.round((f.n / total) * 100) : 0} %</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
