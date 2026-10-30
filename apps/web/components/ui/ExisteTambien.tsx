"use client";

import { useState } from "react";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { claveTexto } from "@/lib/nombres-parecidos";
import { nivelDeMotivo, nivelMasFuerte, textoDeLaPregunta, type CoincidenciaVista, type Vocablo } from "@/lib/atributo-parecido";

// «Existe también» (ADR-0576): la caja ámbar que aparece bajo el nombre mientras se escribe un color, una talla, un tejido, un
// patrón, una familia o una categoría nuevos, y dice cuáles ya existen y por qué se parecen. Es la misma pieza de marcas y
// proveedores (`PreguntaParecido`), con la regla de vocabularios (`lib/atributo-parecido.ts`): nada se dibuja a mano.
//
// Tres niveles (lo decide el motivo, no la pantalla):
//   · mismo nombre → la base no lo deja pasar: solo se puede elegir el que existe o cambiar lo escrito;
//   · casi igual / otro nombre → puede ser el mismo: se guarda cuando la persona contesta «No, es otro»;
//   · solo el tono → se avisa, no se pregunta (Blanco y Crudo se parecen y son dos colores).

export function useExisteTambien(nombre: string, coincidencias: readonly CoincidenciaVista[]) {
  // Para qué nombre dijo la persona «es otro»: si lo cambia, la pregunta vuelve (puede ser otro parecido distinto).
  const [respondidoPara, setRespondidoPara] = useState("");
  const clave = claveTexto(nombre);
  const respondida = respondidoPara !== "" && respondidoPara === clave;
  const visibles = respondida ? coincidencias.filter((c) => nivelDeMotivo(c.por) === "avisa") : coincidencias;
  const nivel = nivelMasFuerte(visibles);
  return {
    coincidencias: visibles,
    /** Hay que contestar la pregunta o cambiar el nombre antes de guardar. */
    bloquea: nivel === "frena" || nivel === "pregunta",
    esOtro: () => setRespondidoPara(clave),
    /** Al abrir de nuevo el formulario: lo contestado antes no vale para esta vez. */
    reiniciar: () => setRespondidoPara(""),
  };
}

export type EstadoExisteTambien = ReturnType<typeof useExisteTambien>;

export function ExisteTambien({
  que,
  nombre,
  estado,
  si,
  deshabilitado,
  id,
  solo,
  className,
}: {
  que: Vocablo;
  nombre: string;
  estado: EstadoExisteTambien;
  /** Dibuja solo una parte: «nombre» (lo que se parece por cómo se llama) o «tono» (lo que solo se ve parecido). Un color usa las dos, cada una donde se decide. */
  solo?: "nombre" | "tono";
  /** Qué hace «elegir el que ya existe» en esta pantalla: elegirlo (alta) o llevar a verlo en la lista (Atributos). */
  si: (existente: { id: string; nombre: string }) => { texto: string; onClick: () => void };
  deshabilitado?: boolean;
  id?: string;
  /** Aire alrededor de la caja cuando el contenedor separa poco a sus hijos (el de los campos de Colores: 4 px). Solo existe si hay caja. */
  className?: string;
}) {
  const lista = solo ? estado.coincidencias.filter((c) => (c.por === "tono") === (solo === "tono")) : estado.coincidencias;
  const texto = textoDeLaPregunta(que, nombre, lista);
  if (!texto) return null;
  const caja = (
    <PreguntaParecido
      id={id}
      titulo={texto.titulo}
      bajada={texto.bajada}
      opciones={lista.map((c) => ({ id: c.id, nombre: c.nombre, detalle: c.detalle }))}
      si={si}
      no={texto.no ? { texto: texto.no, onClick: estado.esOtro } : undefined}
      deshabilitado={deshabilitado}
    />
  );
  return className ? <div className={className}>{caja}</div> : caja;
}

/** Por qué «Guardar» está apagado (o `null` si no lo está por esto): para su `title` y para el recordatorio de la guía. */
export function faltaPorExistente(que: Vocablo, nombre: string, estado: EstadoExisteTambien): string | null {
  return estado.bloquea ? (textoDeLaPregunta(que, nombre, estado.coincidencias)?.falta ?? null) : null;
}
