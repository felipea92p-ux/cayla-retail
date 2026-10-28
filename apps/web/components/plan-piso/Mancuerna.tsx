"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { estiloDeGrupo, IconoDeGrupo } from "@/components/plan-piso/IconoDeGrupo";
import type { PropuestaMix } from "@/lib/mix-piso";
import { escalaDeMancuerna, pctEs, posicionEnEscala } from "@/lib/mix-piso-visual";
import { etiquetasDeFila, lecturaDeFila, resumenDeFila, TIPOS_DE_MARCA, type TipoMarca } from "@/lib/mancuerna-lectura";

// Plan del piso ▸ Propuesta: DÓNDE está cada cifra de cada grupo, en una sola línea. La tabla da los números; esto muestra su distancia: lo que
// cuelga hoy, el punto de partida, lo que vendió la sede (con el rango entre el que estaría la venta real) y lo que se propone. Cuando
// los cuatro puntos caen juntos, la mezcla se parece; cuando se separan, se ve cuál empuja hacia dónde. Sin rebote y sin rojo (solo tokens).
// Cada punto es la parte del grupo DENTRO DE SU PROPIO TOTAL (lo que cuelga, los lugares del riel, las ventas): por eso «hoy» no se compara con la propuesta
// para decir cuántas prendas faltan: eso lo dice la tabla.
//
// Al pasar el cursor por una fila (o enfocarla con Tab, o tocarla), Felipe 2026-10-11: «visualizar mejor cada dato»:
//  · la fila se enciende y las demás bajan; cada marca lleva su cifra en una etiqueta (arriba o abajo de la pista; las que caen casi en el mismo punto
//    comparten una) y junto a la fila flota la lectura del grupo, con sus cuatro cifras y lo que las respalda, en palabras. Flota (`position: absolute`) y no
//    se reserva un hueco arriba: así ni deja un vacío cuando no hay nada señalado ni mueve las filas bajo el cursor (la lectura parpadearía en bucle);
//  · tocar una fila la deja fija; tocar una marca de la leyenda deja resaltada esa marca en TODAS las filas.
// La lógica (etiquetas, cifras, frases) vive en `lib/mancuerna-lectura.ts`, con su prueba; aquí solo se dibuja. El ancho que manda es el de la TARJETA
// (`container` de `plan-piso.css`), no el de la ventana: con el menú abierto una laptop de 1024 px deja la tarjeta en 657.

const TEXTO_DE_LEYENDA: Record<TipoMarca, string> = { hoy: "Hoy", partida: "Punto de partida", ventas: "Tus ventas y su rango", propuesta: "Propuesta" };

/** El dibujo de una marca, igual en la leyenda, en la lectura y en la pista. */
function Glifo({ tipo }: { tipo: TipoMarca }) {
  return <span aria-hidden="true" className="mc-g" data-m={tipo} />;
}

export function Mancuerna({ propuesta: p }: { propuesta: PropuestaMix }) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [fija, setFija] = useState<string | null>(null);
  const [marca, setMarca] = useState<TipoMarca | null>(null);
  if (p.motivoSinPropuesta) return null;

  const maximo = escalaDeMancuerna(p.enRiel.flatMap((f) => [f.hoyPct, f.partidaPct, f.ventaPct, f.rangoDeVenta?.hasta, f.propuestaPct]));
  const marcas = Array.from({ length: maximo / 10 + 1 }, (_, i) => i * 10);
  const activa = fija ?? sobre;

  // Con un toque no hay cursor que siga encima: al soltar lo fijado también se suelta lo señalado (si no, el segundo toque dejaba la fila encendida).
  const alternar = (clave: string, e: MouseEvent) => {
    setFija((f) => (f === clave ? null : clave));
    if ((e.nativeEvent as PointerEvent).pointerType === "touch") setSobre(null);
  };

  return (
    <section className="card-cayla mc anim-sube" style={{ "--i": 3 } as CSSProperties} aria-label="Hoy, punto de partida, tus ventas y propuesta de cada grupo" data-guia="plan-piso.mancuerna">
      <TituloSeccion nivel={3}>Dónde está cada grupo</TituloSeccion>
      <p className="mc-bajada">
        En % de cada total (lo que cuelga, los lugares del riel, tus ventas). Cuando los puntos caen juntos, la mezcla se parece; cuando se separan, se ve quién empuja hacia dónde. Pasa el cursor por un grupo, o tócalo, para leer sus
        cifras. Las prendas que faltan están en la tabla.
      </p>

      <ul className="mc-leyenda" aria-label="Qué es cada marca (toca una para resaltarla en todos los grupos)">
        {TIPOS_DE_MARCA.map((t) => (
          <li key={t}>
            <button type="button" className="mc-leg" data-m={t} aria-pressed={marca === t} onClick={() => setMarca((m) => (m === t ? null : t))}>
              <Glifo tipo={t} />
              {TEXTO_DE_LEYENDA[t]}
            </button>
          </li>
        ))}
      </ul>

      <div className="mc-lista" data-sel={activa ?? undefined} data-marca={marca ?? undefined} onMouseLeave={() => setSobre(null)}>
        {p.enRiel.map((f, i) => {
          const clave = f.grupo.clave;
          const l = lecturaDeFila(f, p);
          const etiquetas = etiquetasDeFila({ hoy: f.hoyPct, partida: f.partidaPct, ventas: f.ventaPct, propuesta: f.propuestaPct }, maximo);
          // Las dos últimas filas abren su tarjeta hacia arriba: hacia abajo se saldría de la tarjeta de la mancuerna.
          const lado = p.enRiel.length > 3 && i >= p.enRiel.length - 2 ? "arriba" : "abajo";
          return (
            <div key={clave} className="mc-item" data-act={activa === clave ? "si" : undefined}>
              <button
                type="button"
                className="mc-fila"
                data-act={activa === clave ? "si" : undefined}
                data-apagada={p.cuadrado ? undefined : "si"}
                aria-pressed={fija === clave}
                aria-label={resumenDeFila(l)}
                onClick={(e) => alternar(clave, e)}
                onMouseEnter={() => setSobre(clave)}
                onFocus={() => setSobre(clave)}
                onBlur={() => setSobre(null)}
              >
                <span className="mc-nombre" style={estiloDeGrupo(i)}>
                  <IconoDeGrupo clave={clave} className="pp-ic-fila" />
                  <span className="mc-nombre-t">{f.grupo.nombre}</span>
                </span>
                <span className="mc-pista" aria-hidden="true">
                  {marcas.map((m) => (
                    <span key={m} className="mc-tick" style={{ left: `${posicionEnEscala(m, maximo)}%` }} />
                  ))}
                  <span className="mc-eje-h" />
                  {f.rangoDeVenta !== null && (
                    <span
                      className="mc-rango"
                      data-m="ventas"
                      style={{ left: `${posicionEnEscala(f.rangoDeVenta.desde, maximo)}%`, width: `${Math.max(0.5, posicionEnEscala(f.rangoDeVenta.hasta, maximo) - posicionEnEscala(f.rangoDeVenta.desde, maximo))}%` }}
                    />
                  )}
                  {f.partidaPct !== null && <span className="mc-m" data-m="partida" style={{ left: `${posicionEnEscala(f.partidaPct, maximo)}%` }} />}
                  {f.ventaPct !== null && <span className="mc-m" data-m="ventas" style={{ left: `${posicionEnEscala(f.ventaPct, maximo)}%` }} />}
                  {f.hoyPct !== null && <span className="mc-m" data-m="hoy" style={{ left: `${posicionEnEscala(f.hoyPct, maximo)}%` }} />}
                  {f.propuestaPct !== null && <span className="mc-m" data-m="propuesta" style={{ left: `${posicionEnEscala(f.propuestaPct, maximo)}%` }} />}
                  {etiquetas.map((e) => (
                    <span key={e.partes.map((x) => x.tipo).join("-")} className="mc-tag" data-carril={e.carril} style={{ "--x": `${e.pos}%` } as CSSProperties}>
                      {e.partes.map((x, k) => (
                        <span key={x.tipo} data-m={x.tipo}>
                          {k > 0 && <span className="mc-sep"> · </span>}
                          {x.texto}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
                <span className="mc-pct">{f.propuestaPct === null ? "—" : pctEs(f.propuestaPct)}</span>
              </button>
              {activa === clave && (
                <div className="mc-pop" data-lado={lado} aria-hidden="true">
                  <div className="mc-lec-cab">
                    <div className="mc-lec-nom" style={estiloDeGrupo(i)}>
                      <IconoDeGrupo clave={clave} className="pp-ic-fila" />
                      <span>{l.nombre}</span>
                    </div>
                    {l.frase && <p className="mc-frase">{l.frase.texto}</p>}
                  </div>
                  <div className="mc-cifras">
                    {l.cifras.map((c) => (
                      <div key={c.tipo} className="mc-cifra" data-vacia={c.valor === "—" ? "si" : undefined}>
                        <span className="mc-cifra-t">
                          <Glifo tipo={c.tipo} />
                          {c.titulo}
                        </span>
                        <b className="mc-cifra-v">{c.valor}</b>
                        {c.detalle && <span className="mc-cifra-d">{c.detalle}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="mc-eje" aria-hidden="true">
          
          <span className="mc-eje-nums">
            {/* En una tarjeta angosta solo cada 20: las marcas de 10 en 10 se amontonaban («0102030…»). */}
            {marcas.map((m, i) => (
              <span key={m} className="mc-eje-n" data-par={m % 20 === 0 ? "si" : undefined} style={{ left: `${posicionEnEscala(m, maximo)}%`, ...(i === 0 ? { transform: "none" } : {}) }}>
                {m}
              </span>
            ))}
          </span>
          
        </div>
      </div>

      {!p.cuadrado && (
        <p className="mc-nota">
          <Chip tono="ambar">Por cuadrar</Chip>
          El círculo de «Hoy» sale apagado: sin cuadrar el piso, lo que el sistema dice que cuelga no es lo que hay.
        </p>
      )}
    </section>
  );
}
