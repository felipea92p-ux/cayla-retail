"use client";

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

          {t.chips.length > 0 && (
            <div className="parecidas-tags">
              {t.chips.map((c) => (
                <Chip key={c} tono="neutro" versalitas={false} className="parecidas-chip">
                  {c}
                </Chip>
              ))}
            </div>
          )}

          <div className="parecidas-dato">
            {t.coloresVisibles.length > 0 && (
              <span className="parecidas-colores">
                {t.coloresVisibles.map((c) => (
                  // Un color sin hex (Estampado, Multicolor, Animal print) es de VARIOS colores: se dibuja en rueda de tonos, no vacío.
                  <i key={c.nombre} aria-hidden className="parecidas-capsula" data-varios={c.varios ? "" : undefined} style={c.varios ? undefined : { background: c.hex }} />
                ))}
                <span className="parecidas-nombres">{t.textoColores}</span>
              </span>
            )}
            {t.tallas && <span className={`parecidas-k ${t.coloresVisibles.length > 0 ? "parecidas-sepa" : ""}`}>{t.tallas}</span>}
          </div>

          <div className="parecidas-dato">
            {t.disponibleSedes ? (
              <>
                <span className="parecidas-k" title={TEXTO.tituloDisponibles}>
                  {TEXTO.disponibles}
                </span>
                <span className="parecidas-stock">
                  {t.disponibleSedes.map((s, i) => (
                    <span key={s.sede}>
                      {i > 0 && <span className="parecidas-sep">· </span>}
                      {s.cantidad > 0 ? (
                        <span>
                          {s.sede} <b>{s.cantidad}</b>
                        </span>
                      ) : (
                        <span className="parecidas-cero">
                          {s.sede} {s.cantidad}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              // Sin lectura o sin stock en ninguna sede: se dice tal cual, sin inventar ceros.
              <span className="parecidas-k">{t.disponible}</span>
            )}
          </div>

          {t.cargada && (
            <p className="parecidas-cargada" title={TEXTO.tituloCargada}>
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
            {TEXTO.esElMismoDiseno}
          </Link>
          {t.puedeDescartar && (
            <button type="button" className="btn-enlace parecidas-enlace" onClick={() => onRevisada(t.id)} aria-label={FRASE.noEsOtroAria(t.nombre)}>
              {TEXTO.noEsOtroDiseno}
            </button>
          )}
          <p className="parecidas-linea">{t.frase}</p>
        </div>
      </div>
    </article>
  );
}
