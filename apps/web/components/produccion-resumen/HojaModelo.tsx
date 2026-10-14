"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { BotonEnlace } from "@/components/ui/campos";
import { FichaDelColor } from "@/components/ui/FichaDelColor";
import { FotoAmpliada } from "@/components/existencias/FotoAmpliada";
import { FotoVistaRapida } from "@/components/vista-rapida/FotoVistaRapida";
import { DIAS_RITMO_RECIENTE, UMBRAL_POCA_BASE_VENTAS } from "@/lib/inventario-reglas";
import { baseDelRitmo, ETIQUETA_ESTADO_MODELO, hrefNuevaOrden, porSemana, textoDiasDeStock } from "@/lib/produccion-decisiones";
import { aclaracionDeLaBase, fraseDeLaFalta, hrefVerEnExistencias, matrizDeLaHoja, type HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { rangoSoles } from "@/lib/productos-vista";
import { Dato } from "./CifrasDeLaHoja";
import { useFichaDeColor } from "./FichasDeColor";
import { FichaDelModelo } from "./FichaDelModelo";
import { MatrizDelModelo } from "./MatrizDelModelo";
import { OrdenesDelModelo, TelaDelModelo } from "./OrdenesYTelaDelModelo";
import { TiendasDelModelo } from "./TiendasDelModelo";
import { TONO_ESTADO_MODELO } from "./estado-modelo";

// «Ver el modelo» (Resumen de Producción, tarea #8 del análisis docs/pantallas/produccion.md): la hoja que se abre al tocar un modelo de «¿Qué producir?».
//
// Es la ficha COMPLETA del modelo, con el mismo diseño que la vista rápida de Catálogo ▸ Productos (Felipe 2026-10-13: «tiene que dejarme ver todo: proveedor, marca, qué tienda lo vende…
// son datos que ya existen»): a la izquierda la foto grande, que sigue al color que se mira, con su ficha de color y la descripción; a la derecha, lo que hay y lo que falta, QUÉ TIENDA lo
// vende (y qué le queda a cada una), la matriz color × talla de toda la red o de una tienda, la ficha (marca, proveedor, material, patrón), las órdenes abiertas del modelo y la tela y los
// avíos que lleva contra su saldo. Es de solo lectura: lo que decide —abrir la orden, trasladar— sale de aquí, no se guarda nada. Todo el movimiento es el de `<Modal>` (ADR-0136) y el de
// la foto de la vista rápida (su excepción escrita); esta hoja no agrega ninguno. Lo que cuenta cada cifra vive en `lib/produccion-hoja-modelo.ts` y `lib/produccion-decisiones.ts`.

export function HojaModelo({ hoja, presentacion, onClose, alCerrarEnfocar }: { hoja: HojaDeModelo; presentacion?: PresentacionDeModelo; onClose: () => void; alCerrarEnfocar?: RefObject<HTMLElement | null> }) {
  const base = baseDelRitmo(hoja.ventasBase);
  const falta = fraseDeLaFalta(hoja);
  const aclaracion = aclaracionDeLaBase(hoja);
  const traslado = hoja.estado === "trasladar" && !!hoja.hrefTrasladar;
  const hrefOrden = hrefNuevaOrden(hoja.productoId, hoja.sugerida);
  const ficha = hoja.ficha;

  // La foto: arranca en el color de la foto de la fila (el que ya se ve en la lista), o en el primero que tenga foto, o en el primero.
  const [fijado, setFijado] = useState<string>(() => (hoja.colores.find((c) => c.fotoUrl && c.fotoUrl === presentacion?.fotoUrl) ?? hoja.colores.find((c) => c.fotoUrl) ?? hoja.colores[0])?.nombre ?? "");
  const [vista, setVista] = useState<string | null>(null);
  const [tiendaId, setTiendaId] = useState<string | null>(null);
  const [fotoGrande, setFotoGrande] = useState<{ fotoUrl: string; color: string } | null>(null);
  const botonAmpliar = useRef<HTMLButtonElement>(null);
  const fichaDeColor = useFichaDeColor();

  const matriz = useMemo(() => matrizDeLaHoja(hoja, tiendaId), [hoja, tiendaId]);
  const enFoto = vista ?? fijado;
  const colorEnFoto = hoja.colores.find((c) => c.nombre === enFoto) ?? hoja.colores[0];
  const fichaEnFoto = colorEnFoto ? fichaDeColor(colorEnFoto.nombre) : null;
  const aLaFoto = colorEnFoto ? { clave: colorEnFoto.nombre, nombre: colorEnFoto.nombre, hex: colorEnFoto.hex, fotoUrl: colorEnFoto.fotoUrl } : undefined;
  const prenda = { referencia: hoja.referencia, categoria: presentacion?.categoria, categoriaPrefijo: presentacion?.categoriaPrefijo, categoriaFamilia: presentacion?.categoriaFamilia };

  const hrefCatalogo = `/productos?q=${encodeURIComponent(ficha?.codigo ?? hoja.referencia)}`;
  // Existencias abre la sede en la que estás (aquí, el Taller): el enlace lleva la tienda que tiene prendas del color de la foto y su primera talla con stock; sin stock en ninguna, la lista.
  const hrefExistencias = hrefVerEnExistencias(colorEnFoto?.dondeVerlo ?? null);
  const tiendaElegida = tiendaId === null ? null : (hoja.tiendas.find((t) => t.id === tiendaId) ?? null);
  const precio = hoja.precioMin === null ? null : rangoSoles([hoja.precioMin, hoja.precioMax]);

  return (
    <>
      <Modal
        variante="hoja"
        conCerrar
        tamano="ancha"
        titulo={hoja.referencia}
        subtitulo={
          <span className="vr-meta">
            {ficha?.codigo && (
              <span className="vr-cod">{ficha.codigo}</span>
            )}
            {presentacion?.categoria && (
              <span>{presentacion.categoria}</span>
            )}
            <Chip tono={TONO_ESTADO_MODELO[hoja.estado]}>{ETIQUETA_ESTADO_MODELO[hoja.estado]}</Chip>
            <span className="vr-sep">
              {hoja.ritmoDia ? `Se vende ${porSemana(hoja.ritmoDia)} por semana (${base.largo})` : `Sin ventas medidas en los últimos ${DIAS_RITMO_RECIENTE} días`}
            </span>
            {precio && (
              <span className="vr-sep">
                <b className="tabular-nums">{precio}</b>
              </span>
            )}
            {ficha?.temporada && (
              <span className="vr-sep">{ficha.temporada}</span>
            )}
            <span className="vr-sep">
              <b>{hoja.colores.length}</b> {hoja.colores.length === 1 ? "color" : "colores"} · <b>{hoja.tallas.length}</b> {hoja.tallas.length === 1 ? "talla" : "tallas"}
            </span>
          </span>
        }
        onClose={onClose}
        alCerrarEnfocar={alCerrarEnfocar}
      >
        <div className="vr-cuerpo vr-quieta">
          <aside data-guia="prod-resumen.hoja-foto" className="vr-lado">
            <FotoVistaRapida producto={prenda} fila={aLaFoto} onAmpliar={setFotoGrande} botonAmpliar={botonAmpliar} />
            <div>
              <div className="vr-pie-foto">
                <span className="vr-sw" data-color-dato style={{ background: colorEnFoto?.hex ?? undefined, width: 20, height: 20 }} />
                <span className="vr-nom">
                  {colorEnFoto?.nombre}
                </span>
                <span className="vr-est">{vista !== null && vista !== fijado ? "vista previa" : "fijado"}</span>
              </div>
              <p className="vr-pista">Pasa el mouse por un color de la tabla y la foto lo muestra. Un clic lo deja fijo.</p>
              {/* Qué transmite el color de la foto y con qué se combina (ADR-0316): la misma ficha de color de Catálogo y Vender, en una caja de alto fijo para que no se mueva nada bajo el mouse (ADR-0185). */}
              {fichaEnFoto && (
                <div className="vr-color-ficha">
                  <FichaDelColor key={colorEnFoto?.nombre} ficha={fichaEnFoto} forma="bloque" />
                </div>
              )}
            </div>
            {/* Lo que se escribió en «Descripción» al crear o editar la prenda. Sin descripción no se dibuja nada: el campo es opcional. */}
            {ficha?.descripcion && (
              <div className="vr-desc">
                <span className="vr-rotulo label-cayla">Descripción</span>
                <p>{ficha.descripcion}</p>
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-5">
            <div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Dato etiqueta="En tiendas" valor={hoja.stockRed} nota={hoja.diasRed === null ? "sin ventas medidas" : textoDiasDeStock(hoja.stockRed, hoja.diasRed)} />
                <Dato etiqueta="En el Taller" valor={hoja.stockTaller} nota={hoja.stockTaller > 0 ? "por trasladar" : undefined} />
                <Dato etiqueta="En camino" valor={hoja.enCamino} nota={hoja.enCamino > 0 ? "a las tiendas" : undefined} />
                <Dato etiqueta="En producción" valor={hoja.enProduccion} nota={hoja.enProduccion > 0 ? "en órdenes abiertas" : undefined} />
              </dl>
              {falta && <p className="mt-3 text-[13.5px] leading-relaxed text-tinta">{falta}</p>}
            </div>

            <TiendasDelModelo hoja={hoja} />

            <MatrizDelModelo
              referencia={hoja.referencia}
              tallas={hoja.tallas}
              matriz={matriz}
              tiendas={hoja.tiendas}
              tiendaId={tiendaId}
              alCambiarTienda={setTiendaId}
              presentacion={presentacion}
              fijado={fijado}
              alFijar={setFijado}
              enFoto={enFoto}
              alVistaPrevia={setVista}
            />

            <FichaDelModelo ficha={ficha} />
            <OrdenesDelModelo ordenes={hoja.ordenes} />
            <TelaDelModelo materiales={hoja.materiales} />

            <p className="nota-cayla">
              Ventas {tiendaElegida ? `de ${tiendaElegida.nombre}` : "de todas las tiendas"} en los últimos {DIAS_RITMO_RECIENTE} días; debajo de cada cifra, lo que queda {tiendaElegida ? "ahí" : "en tiendas"}. Las cifras en gris tienen {UMBRAL_POCA_BASE_VENTAS} ventas o menos: es poca base, no decidas por ellas. «Ya no hay» marca lo que se vendió más de {UMBRAL_POCA_BASE_VENTAS} veces y hoy no queda ninguna en tiendas.
              {aclaracion && ` ${aclaracion}`}
            </p>
          </div>
        </div>

        {/* El pie fijo (`pie-hoja-fijo`): los botones nunca quedan bajo el pliegue, por larga que sea la hoja. A la izquierda, ir a ver el modelo donde vive; a la derecha, lo que se decide aquí. */}
        <div className="pie-hoja-fijo vr-pie vr-quieta">
          <div data-guia="prod-resumen.hoja-acciones" className="vr-botones">
            <BotonEnlace href={hrefCatalogo} peso="fantasma">
              Ver en Catálogo
            </BotonEnlace>
            <BotonEnlace href={hrefExistencias} peso="fantasma">
              Ver en Existencias
            </BotonEnlace>
            {/* En celular los cuatro botones son celdas de la misma grilla de dos columnas (`contents`); desde `sm`, los dos de decidir van juntos a la derecha. */}
            <span className="contents sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              {hoja.hrefTrasladar && (
                <BotonEnlace href={hoja.hrefTrasladar} peso={traslado ? "primario" : "fantasma"}>
                  Trasladar al piso
                </BotonEnlace>
              )}
              <BotonEnlace href={hrefOrden} peso={traslado ? "fantasma" : "primario"}>
                {hoja.sugerida ? "Abrir orden sugerida" : "Abrir orden"}
              </BotonEnlace>
            </span>
          </div>
        </div>
      </Modal>
      {/* La foto en grande, la misma hoja que abre la miniatura de Existencias. Va FUERA de la hoja y no dentro: un modal sube sus teclas y sus clics por sus ancestros de React (ADR-0128). */}
      {fotoGrande && <FotoAmpliada fotoUrl={fotoGrande.fotoUrl} referencia={hoja.referencia} color={fotoGrande.color || null} onCerrar={() => setFotoGrande(null)} alCerrarEnfocar={botonAmpliar} />}
    </>
  );
}
