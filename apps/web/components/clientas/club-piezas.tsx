"use client";

import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { ajustarCelular, celularValido, type TextoClub } from "@/lib/club-reglas";
import { MESES_CUMPLE, ajustarAnio, estadoCumple } from "@/lib/club-clientas-reglas";

// Las piezas del club que comparten las hojas de /clientas (ADR-0288 tanda 1b): el alta con «Se une al club», la ficha
// («Unirse al club», «Llegó su mensaje») y «Llegó un mensaje de WhatsApp». Solo dibujan; la regla vive en `lib/club-*`.

/** El id de la caja del celular, para `avisar.error(…, { enfocar })`. */
export const ID_CELULAR_CLUB = "club-celular";
/** El id de la caja del año, para `avisar.error(…, { enfocar })`. */
export const ID_ANIO_CLUB = "club-cumple-anio";
/** El id de la caja del día, para `avisar.error(…, { enfocar })`. */
export const ID_DIA_CLUB = "club-cumple-dia";

/**
 * La caja del celular: solo deja los 9 dígitos (pegar «+51 987 654 321» deja «987654321»). Sin `maxLength` a propósito:
 * el navegador cortaría lo pegado ANTES de que `ajustarCelular` le quite el +51. Con `caja`, la caja hundida del spike del
 * club (la etiqueta queda para el lector de pantalla: el título lo pone el bloque guiado de afuera).
 */
export function CampoCelular({
  valor,
  onValor,
  etiqueta,
  obligatorio = false,
  caja = false,
  id = ID_CELULAR_CLUB,
}: {
  valor: string;
  onValor: (v: string) => void;
  etiqueta: React.ReactNode;
  /** Obligatorio (el club lo pide, CL-1): va como `required` del campo; lo que falta lo dice la guía de foco. */
  obligatorio?: boolean;
  caja?: boolean;
  id?: string;
}) {
  const aMedias = valor !== "" && !celularValido(valor);
  return (
    <CampoTexto
      id={id}
      etiqueta={etiqueta}
      pie={aMedias ? "Tiene 9 dígitos y empieza en 9." : null}
      tono={aMedias ? "error" : "neutro"}
      mono
      caja={caja}
      inputMode="tel"
      placeholder="9xx xxx xxx" // sugerir-fijo: formato del celular peruano; es el mismo para cualquier clienta
      required={obligatorio}
      value={valor}
      onChange={(e) => onValor(ajustarCelular(e.target.value))}
    />
  );
}

/**
 * Día, mes y año del cumpleaños, como el spike del club (`modalNueva`): tres cajas en fila —el día, el mes en un combo, el
 * año opcional (CL-3)— y, si quedó a medias, qué falta. `anioActual` llega de afuera para no leer el reloj al dibujar.
 */
export function CamposCumpleanos({
  dia,
  mes,
  anio,
  onDia,
  onMes,
  onAnio,
  anioActual,
}: {
  dia: string;
  mes: string;
  anio: string;
  onDia: (v: string) => void;
  onMes: (v: string) => void;
  onAnio: (v: string) => void;
  anioActual: number;
}) {
  const { problema } = estadoCumple(dia, mes, anio, anioActual);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <CampoTexto
          id={ID_DIA_CLUB}
          etiqueta="Día del cumpleaños"
          caja
          mono
          inputMode="numeric"
          maxLength={2}
          placeholder="Día" // sugerir-fijo: nombre de la casilla (el día del cumpleaños); no depende de nada elegido antes
          value={dia}
          onChange={(e) => onDia(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />
        <CampoSelect etiqueta="Mes del cumpleaños" caja valor={mes} onValor={onMes} opciones={MESES_CUMPLE} marcador="Mes" />
        <CampoTexto
          id={ID_ANIO_CLUB}
          etiqueta="Año del cumpleaños (opcional)"
          caja
          mono
          inputMode="numeric"
          maxLength={4}
          placeholder="Año" // sugerir-fijo: nombre de la casilla (el año, opcional); no depende de nada elegido antes
          value={anio}
          onChange={(e) => onAnio(ajustarAnio(e.target.value))}
        />
      </div>
      {problema && <p className="mt-1 text-xs text-rojo-profundo">{problema}</p>}
    </div>
  );
}

/**
 * El texto `club` vigente, para que la asesora se lo LEA antes de registrar su «sí» (D-4: el club es su sí de palabra), y la
 * casilla con la que confirma que lo leyó y ella dijo que sí (como el spike del club, `modalNueva`). La versión que se leyó
 * es la que viaja a `unirse_al_club` (`p_texto_version`) y queda en el registro del permiso.
 */
export function TextoDelClub({ texto, leido, onLeido }: { texto: TextoClub; leido: boolean; onLeido: (v: boolean) => void }) {
  return (
    <div>
      <div className="rounded-lg bg-hueso px-3.5 py-3 text-[13px] leading-relaxed text-tinta/80">{texto.texto}</div>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
        <Casilla marcada={leido} onCambio={() => onLeido(!leido)} etiqueta="Se lo leí y la clienta dijo que sí" className="mt-0.5" />
        <span>Se lo leí y la clienta dijo que sí.</span>
      </label>
    </div>
  );
}

/** Sin texto `club` vigente no se ofrece el club (lo mismo que hace Cobrar con «Invitar»). */
export function SinTextoDelClub() {
  return <p className="nota-cayla text-sm text-tinta/75">El club todavía no tiene su texto vigente para leerle a la clienta. Mientras tanto no se la puede unir desde aquí: avisa al líder.</p>;
}
