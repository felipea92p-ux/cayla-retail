import type { ReactNode } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { ENTREGA_DE_LA_TIENDA_ONLINE, tallasParaMostrar, type Tema, type TemaId } from "@/lib/recomendaciones-temas";
import type { LecturaCatalogo } from "./useCatalogoParaResponder";

/**
 * «Lo que pide» (actividad 4 de la hoja nueva, Felipe 2026-10-17): de qué habla lo que escribió el cliente, como píldoras para elegir,
 * y el dato del ERP que sirve para responderle ese tema: cuántos modelos hay en su talla, cuántos colores, cómo entrega la tienda
 * online. Elegir un tema cambia también las formas de empezar de abajo. No guarda nada (decisión #4 A): es lectura.
 */
export function LoQuePide({
  temas,
  elegido,
  onElegir,
  lectura,
  tienda,
}: {
  temas: readonly Tema[];
  elegido: TemaId;
  onElegir: (id: TemaId) => void;
  lectura: LecturaCatalogo;
  /** Sobre qué tienda escribió, o null si es sobre CAYLA en general. */
  tienda: string | null;
}) {
  const tema = temas.find((t) => t.id === elegido) ?? temas[0]!;
  return (
    <section className="space-y-2.5" data-guia="recomendacion.lo-que-pide" aria-label="Lo que pide">
      <TituloGrupo>Lo que pide</TituloGrupo>
      <div role="radiogroup" aria-label="De qué habla" className="flex flex-wrap gap-1.5">
        {temas.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === tema.id}
            data-activa={t.id === tema.id}
            onClick={() => onElegir(t.id)}
            className="pildora-cayla"
          >
            {t.nombre}
          </button>
        ))}
      </div>
      <DatoDelTema tema={tema} lectura={lectura} tienda={tienda} />
    </section>
  );
}

function DatoDelTema({ tema, lectura, tienda }: { tema: Tema; lectura: LecturaCatalogo; tienda: string | null }) {
  if (tema.id === "envio") return <Nota>{ENTREGA_DE_LA_TIENDA_ONLINE}</Nota>;
  if (tema.id === "elogio") return <Nota>Es un elogio: no hay nada que corregir. Basta con agradecer y contárselo al equipo de {tienda ?? "la tienda"}.</Nota>;
  if (tema.id !== "tallas" && tema.id !== "colores") return null;
  if (lectura.estado === "leyendo" || lectura.estado === "sin_pedir") return <Nota>Buscando en el catálogo…</Nota>;
  if (lectura.estado === "fallo") return <Nota>No se pudo leer el catálogo ahora: las formas de empezar no dan cifras.</Nota>;
  const datos = lectura.datos;

  if (tema.id === "colores") {
    return (
      <div className="space-y-2 rounded-2xl border border-sand bg-crema px-4 py-3">
        <p className="text-[13px] font-semibold text-tinta">
          {datos.colores.total} {datos.colores.total === 1 ? "color" : "colores"} en el catálogo hoy
        </p>
        {datos.colores.masUsados.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Los colores que más modelos usan">
            {datos.colores.masUsados.map((c) => (
              <span
                key={c.nombre}
                title={c.nombre}
                // El color de la prenda es dato: no cambia con el tema (ADR-0336, regla 3).
                data-color-dato
                className={`h-5 w-5 rounded-full border border-tinta/15 ${c.hex ? "" : "bg-sand"}`}
                style={c.hex ? { background: c.hex } : undefined}
              />
            ))}
          </div>
        )}
        <p className="text-[12px] text-taupe">Los que más modelos usan, de los modelos activos del catálogo.</p>
      </div>
    );
  }

  const tallas = tallasParaMostrar(tema, datos);
  const mayor = Math.max(1, ...tallas.map((t) => datos.modelosPorTalla[t] ?? 0));
  return (
    <div className="space-y-2 rounded-2xl border border-sand bg-crema px-4 py-3">
      <p className="text-[13px] font-semibold text-tinta">Modelos del catálogo en esas tallas</p>
      <div className="space-y-1.5">
        {tallas.map((t) => {
          const n = datos.modelosPorTalla[t] ?? 0;
          return (
            <div key={t} className="grid grid-cols-[3rem_minmax(0,1fr)_5.5rem] items-center gap-2.5 text-[12.5px] tabular-nums">
              <span className={`font-semibold ${t === tema.talla ? "text-tinta" : "text-tinta/70"}`}>{t}</span>
              <BarraAvance pct={(n / mayor) * 100} tono="tinta" decorativa />
              <span className={`text-right ${n === 0 ? "font-semibold text-ambar" : "text-taupe"}`}>
                {n === 0 ? "ninguno" : `${n} ${n === 1 ? "modelo" : "modelos"}`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-taupe">Modelos activos con al menos una prenda en esa talla.</p>
    </div>
  );
}

const Nota = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl border border-sand bg-crema px-4 py-3 text-[13px] leading-snug text-tinta">{children}</p>
);
