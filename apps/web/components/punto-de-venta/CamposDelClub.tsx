"use client";

import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import {
  CUMPLE_VACIO,
  OPCIONES_MES_CUMPLE,
  ajustarAnio,
  ajustarDia,
  celularLegible,
  cumpleVacio,
  problemaCumple,
  type CumpleEscrito,
} from "@/lib/club-caja-reglas";
import { ajustarCelular } from "@/lib/club-reglas";

// Las piezas del club de las dos hojas de Cobrar («Registrar clienta» e «Invitar al club»), dibujadas como el spike del
// club (`45-club-caja.js`: `modalRegistrar` y `modalInvitar`): cajas hundidas (`caja-cayla`), el título lo pone el bloque
// guiado de afuera (`CampoGuiado`) y la etiqueta de cada caja queda para el lector de pantalla. Solo dibujan: la regla vive
// en `lib/club-caja-reglas.ts`.

/** El celular de WhatsApp: se lee «987 654 321» y a la base viajan los 9 dígitos (pegar «+51 …» también sirve). */
export function CampoCelularClub({ id, valor, onValor, problema }: { id: string; valor: string; onValor: (v: string) => void; problema: string | null }) {
  return (
    <CampoTexto
      id={id}
      etiqueta="Celular de WhatsApp"
      caja
      mono
      inputMode="numeric"
      placeholder="9xx xxx xxx" // sugerir-fijo: formato del celular peruano; es el mismo para cualquier clienta
      // Sin `maxLength`: pegar «+51 987 654 321» se cortaría antes de limpiarlo. Lo recorta `ajustarCelular`.
      value={celularLegible(valor)}
      onChange={(e) => onValor(ajustarCelular(e.target.value))}
      pie={problema}
      tono={problema ? "error" : "neutro"}
    />
  );
}

/**
 * Día, mes y año en tres cajas iguales (spike: `grid grid-cols-3 gap-3`). El año es opcional (CL-3) y su caja dice solo «Año»:
 * «Año (opcional)» se cortaba a 375 px (spike, commit b1c605e7); que es opcional lo dice la ayuda del título.
 * `omitible`: «Omitir por ahora · se puede agregar después en su ficha.» (Invitar). Sin él, el enlace solo aparece con el
 * cumpleaños a medias, para poder vaciarlo: el mes, una vez elegido, no tiene opción vacía.
 */
export function CumpleanosClub({
  idDia,
  cumple,
  onCumple,
  anioActual,
  omitible = false,
  omitido = false,
  onOmitir,
  deshabilitado = false,
}: {
  idDia: string;
  cumple: CumpleEscrito;
  onCumple: (c: CumpleEscrito) => void;
  anioActual: number;
  omitible?: boolean;
  omitido?: boolean;
  onOmitir?: () => void;
  deshabilitado?: boolean;
}) {
  const problema = problemaCumple(cumple, anioActual);
  const completo = cumple.dia !== "" && cumple.mes !== "" && problema === null;
  const vacio = cumpleVacio(cumple);
  const mostrarOmitir = !completo && !(omitido && vacio) && (omitible || !vacio);
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
      {problema && <p className="mt-1 text-xs text-rojo-profundo">{problema}</p>}
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
          · se puede agregar después en su ficha.
        </p>
      )}
      {omitido && vacio && <p className="mt-1.5 text-xs text-tinta/60">Omitido: se puede agregar después en su ficha.</p>}
    </div>
  );
}

/** El texto del club que la asesora LEE en voz alta, y la casilla con que confirma que lo leyó y ella dijo que sí (D-4). */
export function TextoDelClubLeido({ texto, leido, onLeido, deshabilitado = false }: { texto: string; leido: boolean; onLeido: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <div>
      <div className="rounded-lg bg-hueso px-3.5 py-3 text-[13px] leading-relaxed text-tinta/80">{texto}</div>
      <p className="mt-1.5 text-xs text-tinta/60">
        Queda guardado con la versión del texto: nunca hay un «sí» sin su texto. La publicidad por WhatsApp es aparte y la pide ella después,
        desde su QR.
      </p>
      <label className={`mt-3 flex items-start gap-2.5 text-[13px] text-tinta ${deshabilitado ? "opacity-60" : "cursor-pointer"}`}>
        <Casilla marcada={leido} onCambio={() => !deshabilitado && onLeido(!leido)} etiqueta="Se lo leí y la clienta dijo que sí" className="mt-0.5" />
        <span>Se lo leí y la clienta dijo que sí.</span>
      </label>
    </div>
  );
}
