"use client";

import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ajustarCelular } from "@/lib/club-reglas";
import { celularLegible, problemaCelularOpcional } from "@/lib/club-caja-reglas";
import {
  CUMPLE_VACIO,
  OPCIONES_MES_CUMPLE,
  ajustarAnio,
  ajustarDia,
  cumpleCompleto,
  cumpleVacio,
  problemaCumple,
  type CumpleEscrito,
} from "@/lib/club-cumple-reglas";
import { Aviso } from "@/components/ui/Aviso";

// Las piezas del club que comparten las hojas que lo tocan (ADR-0288 tanda 1b). Desde la tanda 1g (G-2) el alta pide solo el
// documento y ella se une desde el cartel, así que hoy las usa «Editar» de la ficha de /clientas. Una sola versión, dibujada
// como el spike del club (`45-club-caja.js`: `modalRegistrar` y `modalInvitar`):
// cajas hundidas (`caja-cayla`), celular de a tres cifras, cumpleaños en tres cajas iguales. Solo dibujan: la regla vive en
// `lib/club-cumple-reglas.ts` (el cumpleaños, UNA para las dos pantallas) y `lib/club-caja-reglas.ts` (el celular).

/** El id de la caja del celular, para `avisar.error(…, { enfocar })`. */
export const ID_CELULAR_CLUB = "club-celular";
/** El id de la caja del año, para `avisar.error(…, { enfocar })`. */
export const ID_ANIO_CLUB = "club-cumple-anio";
/** El id de la caja del día, para `avisar.error(…, { enfocar })`. */
export const ID_DIA_CLUB = "club-cumple-dia";

/**
 * El celular de WhatsApp: se lee «987 654 321» y a la base viajan los 9 dígitos (pegar «+51 987 654 321» también sirve).
 * Sin `maxLength` a propósito: el navegador cortaría lo pegado ANTES de que `ajustarCelular` le quite el +51.
 * `caja`: la caja hundida del spike (la etiqueta queda para el lector de pantalla: el título lo pone el bloque guiado de
 * afuera); sin ella, la etiqueta se ve (la ficha la usa para la marca de la guía). `problema`: lo que va debajo; si no se
 * pasa, avisa solo de un celular a medio escribir.
 */
export function CampoCelular({
  valor,
  onValor,
  etiqueta = "Celular de WhatsApp",
  obligatorio = false,
  caja = false,
  id = ID_CELULAR_CLUB,
  problema,
  deshabilitado = false,
}: {
  valor: string;
  onValor: (v: string) => void;
  etiqueta?: React.ReactNode;
  /** Obligatorio (el club lo pide, CL-1): va como `required` del campo; lo que falta lo dice la guía de foco. */
  obligatorio?: boolean;
  caja?: boolean;
  id?: string;
  problema?: string | null;
  deshabilitado?: boolean;
}) {
  const pie = problema === undefined ? problemaCelularOpcional(valor) : problema;
  return (
    <CampoTexto
      id={id}
      etiqueta={etiqueta}
      caja={caja}
      mono
      inputMode="numeric"
      placeholder="9xx xxx xxx" // sugerir-fijo: formato del celular peruano; es el mismo para cualquier clienta
      required={obligatorio}
      value={celularLegible(valor)}
      disabled={deshabilitado}
      onChange={(e) => onValor(ajustarCelular(e.target.value))}
      pie={pie}
      tono={pie ? "error" : "neutro"}
    />
  );
}

/**
 * Día, mes y año en tres cajas iguales (spike: `grid grid-cols-3 gap-3`). El año es opcional (CL-3) y su caja dice solo «Año»:
 * «Año (opcional)» se cortaba a 375 px (spike, commit b1c605e7); que es opcional lo dice la ayuda del título.
 * `omitible`: «Omitir por ahora · se puede agregar después en su ficha.» (Invitar). Sin él, el enlace solo aparece con el
 * cumpleaños a medias, para poder vaciarlo: el mes, una vez elegido, no tiene opción vacía. `despues`: dónde se agrega
 * después (dentro de la ficha no se dice «en su ficha»).
 */
export function CamposCumpleanos({
  cumple,
  onCumple,
  anioActual,
  idDia = ID_DIA_CLUB,
  idAnio = ID_ANIO_CLUB,
  omitible = false,
  omitido = false,
  onOmitir,
  despues = "se puede agregar después en su ficha.",
  deshabilitado = false,
}: {
  cumple: CumpleEscrito;
  onCumple: (c: CumpleEscrito) => void;
  anioActual: number;
  idDia?: string;
  idAnio?: string;
  omitible?: boolean;
  omitido?: boolean;
  onOmitir?: () => void;
  despues?: string;
  deshabilitado?: boolean;
}) {
  const problema = problemaCumple(cumple, anioActual);
  const vacio = cumpleVacio(cumple);
  const mostrarOmitir = !cumpleCompleto(cumple, anioActual) && !(omitido && vacio) && (omitible || !vacio);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <CampoTexto
          id={idDia}
          etiqueta="Día del cumpleaños"
          caja
          mono
          inputMode="numeric"
          maxLength={2}
          placeholder="Día" // sugerir-fijo: nombre de la caja (el día del cumpleaños); no depende de nada elegido antes
          value={cumple.dia}
          disabled={deshabilitado}
          onChange={(e) => onCumple({ ...cumple, dia: ajustarDia(e.target.value) })}
        />
        <CampoSelect
          etiqueta="Mes del cumpleaños"
          caja
          valor={cumple.mes}
          onValor={(mes) => onCumple({ ...cumple, mes })}
          opciones={OPCIONES_MES_CUMPLE}
          marcador="Mes"
          deshabilitado={deshabilitado}
        />
        <CampoTexto
          id={idAnio}
          etiqueta="Año del cumpleaños (opcional)"
          caja
          mono
          inputMode="numeric"
          maxLength={4}
          placeholder="Año" // sugerir-fijo: nombre de la caja (el año, opcional); no depende de nada elegido antes
          value={cumple.anio}
          disabled={deshabilitado}
          onChange={(e) => onCumple({ ...cumple, anio: ajustarAnio(e.target.value) })}
        />
      </div>
      {problema && (
        <Aviso tono="error" chico className="mt-1">
          {problema}
        </Aviso>
      )}

      {mostrarOmitir && (
        <p className="mt-1.5 text-xs text-tinta/60">
          <button
            type="button"
            onClick={() => {
              onCumple(CUMPLE_VACIO);
              onOmitir?.();
            }}
            disabled={deshabilitado}
            className="font-semibold text-tinta underline underline-offset-2 hover:text-rojo"
          >
            Omitir por ahora
          </button>{" "}
          · {despues}
        </p>
      )}
      {omitido && vacio && <p className="mt-1.5 text-xs text-tinta/60">Omitido: {despues}</p>}
    </div>
  );
}
