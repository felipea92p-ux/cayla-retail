"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import type { RespuestaPadron } from "@/lib/padron";
import {
  avisoSinNombreDelPadron,
  padronDeLaRespuesta,
  pieDelNombreDelPadron,
  type DondeDelNombre,
  type PadronDeFicha,
} from "@/lib/nombre-del-padron-reglas";

// El nombre de una ficha con DNI (Felipe 2026-10-15: «El nombre no se debe poder escribir ni editar: siempre debe ser el que trae la
// API»). Lo usan «Registrar cliente» del ticket de Vender (`ClientaDelTicket`), «+ Nuevo cliente» (`NuevaClientaModal`) y «Editar» de
// la ficha (`ClientaFichaModal`). La caja se ve llena y BLOQUEADA, con su origen; nunca se escribe. Lo que dice cada estado y lo que
// se guarda salen de `lib/nombre-del-padron-reglas.ts` (con su prueba); la base lo vuelve a exigir (20261015133000).
//
// No es `ConsultaDocumento`: esa es la consulta de un COMPROBANTE (boleta o factura), donde si el padrón no responde el nombre se
// escribe a mano y la venta sigue. Para una ficha eso ya no vale: sin el padrón no se registra.

/** El id de la caja del nombre con DNI: para llevarle el cursor (`avisar.error(…, { enfocar })`). */
export const ID_NOMBRE_DEL_PADRON = "nombre-del-padron";

/** Medio segundo después del último dígito: tipear no dispara consultas a medio camino (cada una puede pagarse). */
const ESPERA_MS = 400;

type Lectura = { numero: string; padron: PadronDeFicha };

/**
 * La consulta al padrón para el DNI escrito AHORA: una respuesta que llega tarde, de otro número, no se pinta. `automatico`: con los
 * 8 dígitos pregunta sola (un alta); sin él, solo con `consultar` («Actualizar desde el padrón» en «Editar», o «Volver a intentar»).
 * `activo`: el documento elegido es un DNI.
 */
export function usePadronDeFicha({ numero, activo, automatico }: { numero: string; activo: boolean; automatico: boolean }): {
  padron: PadronDeFicha;
  consultar: () => void;
} {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  // Al apagarse (la ficha deja «Editar», o el documento deja de ser DNI) se olvida lo leído: la próxima vez empieza de cero.
  const [activoAntes, setActivoAntes] = useState(activo);
  if (activo !== activoAntes) {
    setActivoAntes(activo);
    if (!activo) setLectura(null);
  }
  const enVuelo = useRef<AbortController | null>(null);
  const dni = activo && /^[0-9]{8}$/.test(numero) ? numero : null;

  const consultar = useCallback(() => {
    if (!dni) return;
    enVuelo.current?.abort();
    const control = new AbortController();
    enVuelo.current = control;
    setLectura({ numero: dni, padron: { estado: "consultando" } });
    // Lectura mientras se escribe: sin el loader de pantalla completa (ADR-0149); la caja dice «Consultando el padrón…».
    fetch(`/api/padron?tipo=dni&numero=${dni}&para=ficha`, { signal: control.signal, headers: { "x-espera": "no" } })
      .then(async (r) => (r.ok ? ((await r.json()) as RespuestaPadron) : null))
      .then(
        (r) => {
          if (!control.signal.aborted) setLectura({ numero: dni, padron: padronDeLaRespuesta(r) });
        },
        (e: unknown) => {
          if (!(e instanceof Error && e.name === "AbortError")) setLectura({ numero: dni, padron: padronDeLaRespuesta(null) });
        },
      );
  }, [dni]);

  useEffect(() => {
    if (!automatico || !dni || lectura?.numero === dni) return;
    const reloj = setTimeout(consultar, ESPERA_MS);
    return () => clearTimeout(reloj);
  }, [automatico, dni, lectura?.numero, consultar]);

  // Si la hoja se cierra con una consulta en vuelo, se cancela.
  useEffect(() => () => enVuelo.current?.abort(), []);

  const padron: PadronDeFicha = !dni
    ? { estado: "sin_consultar" }
    : lectura?.numero === dni
      ? lectura.padron
      : automatico
        ? { estado: "consultando" }
        : { estado: "sin_consultar" };
  return { padron, consultar };
}

/**
 * La caja del nombre con DNI: llena y bloqueada, con «Del padrón» cuando el padrón lo acaba de confirmar. Mientras consulta, el hilo
 * barre. Si el padrón no lo encontró o no respondió, en su lugar va el aviso de tres líneas con «Volver a intentar». En «Editar»
 * (`deAntes`: el nombre que ya tenía) se ve ese nombre, bloqueado, con «Actualizar desde el padrón».
 */
export function NombreDelPadron({
  padron,
  donde,
  onConsultar,
  deAntes = null,
  actualizable = false,
  deshabilitado = false,
  guia,
  conMarca = (titulo) => titulo,
}: {
  padron: PadronDeFicha;
  donde: DondeDelNombre;
  /** Pregunta otra vez al padrón: «Volver a intentar» y «Actualizar desde el padrón». */
  onConsultar: () => void;
  /** «Editar»: el nombre que la ficha ya tenía (con el DNI de siempre). */
  deAntes?: string | null;
  /** «Editar»: con el DNI de siempre no se consulta sola; se ofrece «Actualizar desde el padrón». */
  actualizable?: boolean;
  deshabilitado?: boolean;
  /** Ancla de la guía interactiva (ADR-0389). */
  guia?: string;
  /** La marca de la guía de foco en el título (✓, «Sigue aquí»…): `(t) => guia.etiqueta("nombre", t)`. */
  conMarca?: (titulo: ReactNode) => ReactNode;
}) {
  if (padron.estado === "no_encontrado" || padron.estado === "sin_respuesta") {
    const aviso = avisoSinNombreDelPadron(padron.estado, donde);
    return (
      <div data-guia={guia}>
        <Aviso
          tono="atencion"
          titulo={aviso.titulo}
          accion={
            <button type="button" className="btn-cayla btn-enlace" onClick={onConsultar} disabled={deshabilitado}>
              Volver a intentar
            </button>
          }
        >
          {aviso.texto}
        </Aviso>
      </div>
    );
  }
  const confirmado = padron.estado === "confirmado";
  const conNombreDeAntes = Boolean(deAntes?.trim());
  return (
    <div data-guia={guia}>
      <CampoTexto
        id={ID_NOMBRE_DEL_PADRON}
        etiqueta={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* El candado dice, antes de leer nada, que esta caja no se escribe (ley 5 de Formidable: ver antes que leer). */}
            {conMarca(
              <span className="inline-flex items-center gap-1">
                Nombre
                <Lock className="h-3 w-3" aria-hidden />
              </span>,
            )}
            {confirmado && <Chip tono="verde">Del padrón</Chip>}
          </span>
        }
        readOnly
        aria-readonly
        value={confirmado ? padron.nombre : (deAntes ?? "")}
        placeholder={padron.estado === "consultando" ? "Consultando el padrón…" : "Lo trae el padrón"} // sugerir-fijo: dice de dónde sale el nombre, no es un ejemplo
        trabajando={padron.estado === "consultando"}
        valido={confirmado}
        pie={pieDelNombreDelPadron(padron, actualizable, conNombreDeAntes)}
      />
      {/* «Editar»: el nombre que tenía no se escribe; si cambió, se vuelve a leer del padrón. */}
      {actualizable && padron.estado === "sin_consultar" && (
        <button type="button" className="btn-cayla btn-enlace -mt-1" onClick={onConsultar} disabled={deshabilitado}>
          Actualizar desde el padrón
        </button>
      )}
    </div>
  );
}
