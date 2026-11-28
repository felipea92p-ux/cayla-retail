"use client";

import { useEffect, useRef } from "react";
import { buscarClienta } from "@/lib/clientas-acciones";
import { fichaDeEseDni, type ClientaDelTicket } from "@/lib/clienta-ticket-reglas";

/**
 * Busca en la libreta el DNI que se escribió en el comprobante y, si es de un cliente registrado, lo une a la venta
 * (ADR-0718, Felipe 2026-11-28). PROMETE: solo une la ficha con ese DNI exacto, nunca crea ni cambia fichas, y no vuelve a
 * unir un DNI que la persona quitó mientras siga escrito. ASUME: `buscar_clienta` exige el módulo Clientes (sin él,
 * `activo` llega en falso). Si la búsqueda falla (sin red), no une nada y la venta se cobra igual.
 */
export function useFichaPorDni({
  dni,
  hayClienta,
  activo,
  onEncontrada,
}: {
  dni: string | null;
  hayClienta: boolean;
  activo: boolean;
  onEncontrada: (c: ClientaDelTicket) => void;
}) {
  const quitado = useRef<string | null>(null);
  const alEncontrar = useRef(onEncontrada);
  useEffect(() => {
    alEncontrar.current = onEncontrada;
  });

  useEffect(() => {
    // Se escribió otro número: lo que se había quitado vuelve a poder unirse si se teclea de nuevo.
    if (dni !== quitado.current) quitado.current = null;
    if (!activo || !dni || hayClienta || quitado.current === dni) return;
    let vigente = true;
    void buscarClienta(dni).then(({ clientas, error }) => {
      if (!vigente || error) return;
      const ficha = fichaDeEseDni(clientas, dni);
      if (ficha) alEncontrar.current({ id: ficha.id, nombre: ficha.nombre, documentoTipo: ficha.documentoTipo, documentoNumero: ficha.documentoNumero, celular: ficha.telefonoWhatsapp });
    });
    return () => {
      vigente = false;
    };
  }, [dni, hayClienta, activo]);

  return {
    /** «Quitar» sobre una ficha unida sola: ese DNI sigue en la boleta, pero la venta no entra en la ficha. */
    noUnir: (d: string) => {
      quitado.current = d;
    },
  };
}
