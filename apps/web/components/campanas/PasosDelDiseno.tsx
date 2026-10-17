"use client";

import {
  COLOR_PROPIO_DE_PARTIDA,
  ESTILOS,
  PALETAS,
  aplicarEstilo,
  colorQueSeLee,
  estiloDelDiseno,
  paletaPropia,
  seLee,
  type ColoresPropios,
  type DisenoDeCampana,
} from "@cayla-retail/portada";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { CampanaDePortada, PiezaDePortada } from "@/lib/campana-diseno";
import { Lienzo } from "./Lienzo";
import { PortadaDeCampana } from "./PortadaDeCampana";

// Los pasos del editor de «Diseño en la web» (ADR-0436; maqueta, pantalla 2): el cuerpo de cada uno. Cada paso recibe el diseño y avisa
// el cambio con `onCambiar`; el editor (`DisenoCampana`) guarda el borrador y lleva la guía de foco.

/** Paso 1: los ocho estilos de partida, cada uno con su portada en chico. El texto y las prendas que ya se eligieron se quedan. */
export function PasoEstilo({
  diseno,
  campana,
  piezas,
  ahora,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  campana: CampanaDePortada;
  piezas: readonly PiezaDePortada[];
  ahora: number;
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const actual = estiloDelDiseno(diseno)?.id ?? null;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-tinta/70">Un toque y la portada queda lista. Después cambia lo que quieras.</p>
      <div className="tw-opciones">
        {ESTILOS.map((e) => {
          const con = aplicarEstilo(diseno, e.id);
          return (
            <button key={e.id} type="button" className="tw-opcion" aria-pressed={actual === e.id} onClick={() => onCambiar(con)}>
              <Lienzo ancho={1280} alto={720}>
                <PortadaDeCampana campana={campana} diseno={con} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
              <span className="tw-opcion-nombre">
                {e.nombre}
                <small>{e.nota}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Paso 2: las paletas curadas, las sacadas de las prendas de la campaña y «Mi color» (la letra se elige sola). */
export function PasoColores({
  diseno,
  paletasDePrendas,
  onCambiar,
}: {
  diseno: DisenoDeCampana;
  paletasDePrendas: readonly ColoresPropios[];
  onCambiar: (d: DisenoDeCampana) => void;
}) {
  const propia = diseno.paleta === "propia" ? diseno.colores : null;
  const esMiColor = propia?.nombre === "Mi color";
  const miColorSeLee = esMiColor && seLee(diseno, "claro") && seLee(diseno, "oscuro");
  const elegir = (colores: ColoresPropios) => onCambiar({ ...diseno, paleta: "propia", colores });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <TituloGrupo>Paletas que siempre se leen bien</TituloGrupo>
        <div className="tw-muestras">
          {PALETAS.map((p) => (
            <Muestra
              key={p.id}
              nombre={p.nombre}
              fondo={p.fondo}
              acento={p.acento}
              elegida={diseno.paleta === p.id}
              onClick={() => onCambiar({ ...diseno, paleta: p.id, colores: null })}
            />
          ))}
        </div>
      </div>
      {paletasDePrendas.length > 0 && (
        <div className="space-y-2">
          <TituloGrupo>Sacadas de las prendas de esta campaña</TituloGrupo>
          <div className="tw-muestras">
            {paletasDePrendas.map((p) => (
              <Muestra key={p.fondo} nombre={p.nombre} fondo={p.fondo} acento={p.acento} elegida={propia?.fondo === p.fondo && propia.nombre === p.nombre} onClick={() => elegir(p)} />
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <TituloGrupo nota="la letra se elige sola">O tu propio color</TituloGrupo>
        <label className="tw-mi-color">
          <input
            type="color"
            value={esMiColor ? propia.fondo : COLOR_PROPIO_DE_PARTIDA}
            onChange={(e) => elegir(paletaPropia(e.target.value))}
            aria-label="Elegir mi color"
          />
          <span className="text-[13px] text-tinta">
            <b className="block font-semibold">Elegir mi color</b>
            <span className="text-tinta/70">{esMiColor ? (miColorSeLee ? "Se lee bien." : "Con este color la letra no se lee bien.") : "Toca el círculo."}</span>
          </span>
        </label>
        {esMiColor && !miColorSeLee && (
          <Aviso
            tono="atencion"
            chico
            accion={
              <Boton peso="fantasma" onClick={() => elegir(paletaPropia(colorQueSeLee(propia.fondo)))}>
                Usar uno un poco más oscuro
              </Boton>
            }
          >
            Ni la letra clara ni la oscura se leen bien sobre este tono.
          </Aviso>
        )}
      </div>
    </div>
  );
}

/** Una muestra de color: el fondo con su acento en un punto. */
function Muestra({ nombre, fondo, acento, elegida, onClick }: { nombre: string; fondo: string; acento: string; elegida: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tw-muestra" aria-pressed={elegida} title={nombre} aria-label={nombre} onClick={onClick} data-color-dato style={{ background: fondo }}>
      <i style={{ background: acento }} />
    </button>
  );
}
