"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { Resaltado } from "@/components/ui/Resaltado";
import { FRASE, TEXTO, type TarjetaVista } from "@/lib/parecidas-alta-vista";

// La tarjeta completa de una prenda parecida, dentro de la hoja «Ver y comparar» (Fase 1; maqueta docs/maquetas/producto-buscar-primero-2026-09/).
//
// EL PROBLEMA. «Mismo producto» es MISMO DISEÑO (Felipe, 2026-09-30) y el diseño es visual: para decidir, la persona compara lo que tiene en la mano
// con la foto, los colores, las tallas y el stock de la prenda que ya existe. Hoy el aviso solo dice un nombre. La tarjeta pone todo eso junto y deja
// dos respuestas: «Es el mismo diseño» (abre esa prenda) y «No, es otro diseño» (la pliega).
//
// CONTRATO. PROMETE: dibujar `tarjeta` tal cual; foto grande o la miniatura neutra «Sin foto todavía» (la percha sobre el tono neutro, sin color ni categoría: es una candidata, no la prenda; nunca la muestra del tejido: cinco jeans
//   mostrarían el mismo denim y parecerían iguales); el código leído del texto como chip (con `title` de dónde se leyó); «Es el mismo diseño» como
//   enlace a /productos/<id>/editar con la frase honesta de lo que hace y lo que NO; ningún botón lleno (el único lleno de la pantalla es «Seguir»);
//   nada de precio ni costo; stock solo en cantidades; ni un texto propio (todos vienen de `TEXTO` y `FRASE`); la cápsula de un color sin hex en rueda de
//   tonos (nunca vacía). La idéntica no ofrece «No, es otro diseño» (no destraba nada). ASUME: que vive en la hoja y que su ancho lo decide el contenedor
//   `parecidas-hoja` (celular: foto más chica y botones a todo el ancho); que el formulario usa `useSalidaSinGuardar` (el enlace «Es el mismo diseño»
//   SALE de la pantalla: sin esa guardia lo llenado se pierde sin preguntar; la tarjeta ya lo dijo antes de tocar). NO HACE: decidir si la prenda se
//   parece (eso ya viene en la vista), guardar «revisada» ni navegar por su cuenta más allá del enlace: avisa por callbacks.

type Props = {
  tarjeta: TarjetaVista;
  /** La persona ya dijo «No, es otro diseño»: la tarjeta se pliega a una línea con «Deshacer» (salvo la idéntica, que no se puede plegar). */
  revisada: boolean;
  /** El texto buscado en la hoja, que se resalta en el nombre (sin tildes ni mayúsculas). Vacío = sin resaltar. */
  resaltar?: string;
  /** Un destello cuando la persona llegó a esta prenda desde una mini fila del resumen. */
  llamada?: boolean;
  onRevisada: (id: string) => void;
  onDeshacer: (id: string) => void;
  /** Se tocó «Es el mismo diseño»: el enlace navega solo, esto es por si quien integra quiere cerrar la hoja o avisar. */
  onEsElMismo?: (id: string) => void;
};

export function TarjetaParecida({ tarjeta: t, revisada, resaltar = "", llamada = false, onRevisada, onDeshacer, onEsElMismo }: Props) {
  const [verFrase, setVerFrase] = useState(false);
  if (revisada && !t.exacto) {
    return (
      <div className="parecidas-revisada" data-id={t.id}>
        <span aria-hidden className="parecidas-ok">
          ✓
        </span>
        <span>{t.textoRevisada}</span>
        <button type="button" className="btn-enlace parecidas-enlace" aria-label={FRASE.deshacerAria(t.nombre)} onClick={() => onDeshacer(t.id)}>
          {TEXTO.deshacer}
        </button>
      </div>
    );
  }

  return (
    <article className="parecidas-tarjeta" data-id={t.id} data-exacto={t.exacto ? "" : undefined} data-llamado={llamada ? "" : undefined} aria-label={t.nombre}>
      <div className="parecidas-tarjeta-in">
        {/* Foto grande o la miniatura neutra: el diseño es lo que se compara, y sin foto no se puede comparar a la vista (y se dice). */}
        <figure className="parecidas-foto">
          {t.fotoUrl ? (
            <Image src={t.fotoUrl} alt={FRASE.fotoAlt(t.nombre)} fill unoptimized sizes="116px" className="parecidas-foto-img" />
          ) : (
            <>
              <SinFoto tamano="h-full w-full" />
              <figcaption>{TEXTO.sinFoto}</figcaption>
            </>
          )}
        </figure>

        <div className="parecidas-info">
          <div className="parecidas-l1">
            <h3>
              <Resaltado texto={t.nombre} busqueda={resaltar} />
            </h3>
            <span className="parecidas-ev">
              {t.evidencia && (
                <Chip tono={t.evidencia.tono} className="parecidas-chip">
                  {t.evidencia.texto}
                </Chip>
              )}
              {t.descontinuada && (
                <Chip tono="neutro" className="parecidas-chip">
                  {TEXTO.descontinuada}
                </Chip>
              )}
            </span>
          </div>

          <p className="parecidas-mc">
            <span>{t.marcaCategoria}</span>
            {t.codigo && (
              <span className="parecidas-cod" title={t.codigo.titulo}>
                {t.codigo.texto}
              </span>
            )}
          </p>

          {t.coincide && (
            <small className="parecidas-coincide">
              {FRASE.coincideEn(t.coincide.campo)}
              <Resaltado texto={t.coincide.texto} busqueda={resaltar} />
            </small>
          )}

          {t.descripcion && (
            <p className="parecidas-desc" title={t.descripcionCompleta ?? undefined}>
              {t.descripcion}
            </p>
          )}

          {/* Los datos en filas con título (Felipe, 2026-10-06, opción 2 de la maqueta): se leen alineados y cada uno dice qué es. */}
          <dl className="parecidas-datos">
            {(t.tejido || t.patron) && (
              <>
                <dt>Tela</dt>
                <dd>{[t.tejido, t.patron].filter(Boolean).join(" · ")}</dd>
              </>
            )}
            {t.temporada && (
              <>
                <dt>Temporada</dt>
                <dd>{t.temporada}</dd>
              </>
            )}
            {t.coloresVisibles.length > 0 && (
              <>
                <dt>Colores</dt>
                <dd>
                  {/* Solo los círculos: el nombre sale al pasar el mouse o al tocarlo (foco). El lector de pantalla lee la lista entera. */}
                  <span className="sr-only">{t.textoColores}</span>
                  {t.coloresVisibles.map((c) => (
                    <span
                      key={c.nombre}
                      aria-hidden
                      data-nombre={c.nombre}
                      className="parecidas-punto"
                      data-varios={c.varios ? "" : undefined}
                      style={c.varios ? undefined : { background: c.hex }}
                    />
                  ))}
                  {t.masColores > 0 && <span className="parecidas-mas-colores" title={t.textoColores}>+{t.masColores}</span>}
                </dd>
              </>
            )}
            {t.listaTallas.length > 0 && (
              <>
                <dt>Tallas</dt>
                <dd>
                  {t.listaTallas.map((x) => (
                    <span key={x} className="parecidas-talla">
                      {x}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt title={TEXTO.tituloDisponibles}>Hay</dt>
            <dd>
              {t.disponibleSedes && t.disponibleSedes.some((s) => s.cantidad > 0) ? (
                <>
                  {t.disponibleSedes
                    .filter((s) => s.cantidad > 0)
                    .map((s) => (
                      <span key={s.sede} className="parecidas-hay">
                        {s.sede} <b>{s.cantidad}</b>
                      </span>
                    ))}
                  {t.disponibleSedes.some((s) => s.cantidad === 0) && (
                    <span className="parecidas-cero">
                      {t.disponibleSedes
                        .filter((s) => s.cantidad === 0)
                        .map((s) => `${s.sede} 0`)
                        .join(" · ")}
                    </span>
                  )}
                </>
              ) : (
                <span className="parecidas-cero">{t.disponible}</span>
              )}
            </dd>
          </dl>

          {t.cargada && (
            <p className="parecidas-cargada" title={TEXTO.tituloCargada}>
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5 shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {t.cargada}
            </p>
          )}
        </div>

        <div className="parecidas-acc">
          {/* «Es el mismo diseño» abre esa prenda: ahí se le suman tallas y colores. Ningún botón lleno: el único de la pantalla es «Seguir». */}
          <Link
            href={t.href}
            className="btn-cayla btn-secundario"
            aria-label={FRASE.esElMismoAria(t.nombre)}
            onClick={() => onEsElMismo?.(t.id)}
          >
            {TEXTO.esElMismoDiseno} →
          </Link>
          {t.puedeDescartar && (
            <button type="button" className="btn-enlace parecidas-enlace" onClick={() => onRevisada(t.id)} aria-label={FRASE.noEsOtroAria(t.nombre)}>
              {TEXTO.noEsOtroDiseno}
            </button>
          )}
          {/* Lo que pasa al abrirla, a un toque (no solo con el mouse): antes era un párrafo fijo bajo los botones de cada prenda. */}
          <button type="button" className="parecidas-que-pasa" aria-expanded={verFrase} onClick={() => setVerFrase((v) => !v)}>
            <span aria-hidden className="parecidas-q">
              ?
            </span>
            Qué pasa al abrirla
          </button>
          {verFrase && <p className="parecidas-linea">{t.frase}</p>}
        </div>
      </div>
    </article>
  );
}
