"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AvisoParecidos, type Parecido } from "@/components/alta-producto/AvisoParecidos";
import { TextoConPartes } from "@/components/alta-producto/AlertaParecidas";
import { Aviso } from "@/components/ui/Aviso";
import { TEXTO_ALTA } from "@/lib/parecidas-alta-estado";
import { TEXTO, type AvisoNombreVista } from "@/lib/parecidas-alta-vista";

// Las tres piezas chicas con que «Nuevo producto» conecta «Prendas parecidas» al paso 2 (Fase 1, sin tocar producción).
//
// EL PROBLEMA. La alerta y la hoja viven a la derecha, pero hay tres lugares del formulario que también tienen que decir algo: bajo el campo
// «Nombre» (el idéntico, en rojo, junto al campo donde se produce), en el pie del paso 2 («Revisa: 2 parecidas · Ver») y, cuando la pantalla nueva no
// puede hablar de una prenda que la base marcó, la casilla de siempre. Aquí solo se DIBUJAN; qué decir lo decide `useParecidasAlta`.
//
// CONTRATO
//   PROMETE: `ParecidasBajoNombre` — el aviso rojo SOLO para el idéntico (con su enlace o su botón «Ver y comparar» y la frase de que lo llenado no
//            se guarda si se abre), el rojo de un nombre reservado por el sistema, el ámbar de «casi igual» mientras «Crear» espera su respuesta (con su
//            botón «Ver y comparar»), el «No pude comprobar» neutro y, solo como respaldo, el `AvisoParecidos` de siempre con su casilla. `RevisaParecidasDelPaso`
//            — «Revisa: N parecidas · Ver»: un botón que abre la hoja y NO apaga «Seguir». `PieConParecidas` — apila «Falta: …» y «Revisa: …» en el pie del paso.
//            Todos los botones son `type="button"` (viven dentro del formulario) y ningún texto lleva precio ni costo.
//   ASUME:   que quien integra ya armó cada cosa (`AvisoNombreVista`, el respaldo, el texto de «Revisa») con `armarParecidasDelAlta`.
//   NO HACE: no decide, no abre la hoja por su cuenta (avisa por `onComparar` / `onVer`) y no dibuja hojas ni campos de texto (por eso no necesita su fila en el registro de la guía de foco).

export type ParecidasBajoNombreProps = {
  /** «No pude comprobar…»: la comprobación falló (el sistema la repite al guardar). */
  noSePudoComprobar: boolean;
  /** El aviso rojo del idéntico, ya armado; `null` = no hay. */
  aviso: AvisoNombreVista | null;
  /** El aviso ámbar de «casi igual» (la base lo exige responder): `id` es la prenda a la que abre «Ver y comparar». `null` = no hay. */
  avisoUnaLetra: { id: string; texto: string } | null;
  /** El aviso rojo de un nombre que el sistema se reservó («Prenda sin Registrar»); `null` = no hay. */
  nombreReservado: string | null;
  /** «Ver y comparar» del aviso: abre la hoja parada en esa prenda. */
  onComparar: (id: string) => void;
  /** Lo que la pantalla nueva no puede decir y vuelve a la casilla de siempre (vacío casi siempre). */
  respaldo: Parecido[];
  /** La casilla de siempre: solo cuenta en el respaldo. */
  confirmo: boolean;
  onConfirmo: (v: boolean) => void;
};

const CLASE_ENLACE_AVISO = "mt-1 inline-block underline underline-offset-4";

/** Lo que va bajo el campo «Nombre». Reemplaza a `<AvisoParecidos>` en Nuevo producto (Editar producto sigue con el suyo). */
export function ParecidasBajoNombre({ p }: { p: ParecidasBajoNombreProps }) {
  const { aviso } = p;
  const accion = aviso?.accion ?? null;
  if (!p.noSePudoComprobar && !aviso && !p.avisoUnaLetra && !p.nombreReservado && p.respaldo.length === 0) return null;
  return (
    <div className="space-y-2">
      {p.noSePudoComprobar && <Aviso tono="info">{TEXTO_ALTA.noPudeComprobar}</Aviso>}

      {p.nombreReservado && (
        <Aviso tono="error">
          {p.nombreReservado}
        </Aviso>
      )}

      {/* «Casi igual»: frena «Crear» hasta que la persona lo mire y responda. Se dice AQUÍ, junto al campo, porque «Nombre» aparece en «Faltan:» con el campo
          lleno y sin esto no hay cómo saber por qué. Ámbar, no rojo: no es un error, es un camino. */}
      {p.avisoUnaLetra && (
        <Aviso tono="atencion">
          <p>{p.avisoUnaLetra.texto}</p>
          <button type="button" className={CLASE_ENLACE_AVISO} onClick={() => p.avisoUnaLetra && p.onComparar(p.avisoUnaLetra.id)}>
            {TEXTO.verYComparar}
          </button>
        </Aviso>
      )}

      {aviso && (
        <Aviso tono="error">
          <p>
            <TextoConPartes texto={aviso.texto} partes={aviso.partes} />
          </p>
          {accion?.tipo === "ver_ficha" ? (
            <Link href={accion.href} className={CLASE_ENLACE_AVISO}>
              {accion.etiqueta}
            </Link>
          ) : accion?.tipo === "comparar" ? (
            <button type="button" className={CLASE_ENLACE_AVISO} onClick={() => accion.id && p.onComparar(accion.id)}>
              {accion.etiqueta}
            </button>
          ) : null}
          {aviso.subtexto && <span className="mt-1 block text-[13px]">{aviso.subtexto}</span>}
        </Aviso>
      )}

      {p.respaldo.length > 0 && <AvisoParecidos parecidos={p.respaldo} confirmo={p.confirmo} onConfirmo={p.onConfirmo} noSePudoComprobar={false} />}
    </div>
  );
}

/** «Revisa: 2 parecidas · Ver». No es un campo ni una falta: es lo que conviene mirar antes de seguir, y «Seguir» sigue encendido. */
export function RevisaParecidasDelPaso({ texto, onVer }: { texto: string; onVer: () => void }) {
  return (
    <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-taupe">
      <span>{texto} ·</span>
      <button type="button" className="btn-cayla btn-enlace text-[12.5px]" aria-label={TEXTO.verParecidasAria} onClick={onVer}>
        Ver
      </button>
    </div>
  );
}

/** El pie del paso 2 con las dos líneas: lo que falta (tocable) y lo que hay por revisar. Cada una solo se pinta si trae algo. */
export function PieConParecidas({ faltan, revisa }: { faltan?: ReactNode; revisa?: ReactNode }) {
  return (
    <div className="mr-auto min-w-0 space-y-1.5">
      {faltan}
      {revisa}
    </div>
  );
}
