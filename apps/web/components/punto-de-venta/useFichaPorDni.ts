"use client";

import { useEffect, useRef } from "react";
import { buscarClienta } from "@/lib/clientas-acciones";
import { fichaDeEseDni, type ClientaDelTicket } from "@/lib/clienta-ticket-reglas";

/**
 * Busca en la libreta el DNI que se escribió en el comprobante y, si es de un cliente registrado, lo une a la venta
 * (ADR-0718, Felipe 2026-11-28). PROMETE: solo une la ficha con ese DNI exacto, nunca crea ni cambia fichas, y no vuelve a
 * unir un DNI que la persona quitó de este ticket. ASUME: `buscar_clienta` exige el módulo Clientes (sin él,
 * `activo` llega en falso). Si la búsqueda falla (sin red), no une nada y la venta se cobra igual.
 */
export function useFichaPorDni({
  dni,
  quitado,
  hayClienta,
  activo,
  onEncontrada,
}: {
  dni: string | null;
  /** El DNI que la persona quitó de este ticket: vive con el ticket (espera, recarga), no aquí. */
  quitado: string | null;
  hayClienta: boolean;
  activo: boolean;
  onEncontrada: (c: ClientaDelTicket) => void;
}) {
  const alEncontrar = useRef(onEncontrada);
  useEffect(() => {
    alEncontrar.current = onEncontrada;
  });

  useEffect(() => {
    if (!activo || !dni || hayClienta || quitado === dni) return;
    let vigente = true;
    void buscarClienta(dni).then(({ clientas, error }) => {
      if (!vigente || error) return;
      const ficha = fichaDeEseDni(clientas, dni);
      if (ficha) alEncontrar.current({ id: ficha.id, nombre: ficha.nombre, documentoTipo: ficha.documentoTipo, documentoNumero: ficha.documentoNumero, celular: ficha.telefonoWhatsapp });
    });
    return () => {
      vigente = false;
    };
  }, [dni, quitado, hayClienta, activo]);
}
