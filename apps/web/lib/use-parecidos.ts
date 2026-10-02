"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Parecido } from "@/components/alta-producto/AvisoParecidos";

// El aviso en vivo de "¿ya existe algo así?" (buscar_productos_parecidos,
// 20260918230000), compartido por Nuevo producto y Editar producto: UNA sola
// forma de comprobar un nombre (integridad conceptual), no dos copias.
//
// CONTRATO
//   PROMETE: mientras se escribe, espera 350 ms, pregunta a la base, y devuelve
//            qué se parece — sin mostrar nunca el resultado de un nombre viejo
//            ni dejar la pantalla esperando más de 6 s.
//   ASUME:   `nombre` ya viene en el formato único (tipo título).
//   NO HACE: no decide qué bloquear; eso lo hace quien lo usa con `hayIdentico`
//            / `hayUnaLetra` / `confirmo`. Si la comprobación falla lo dice
//            (`fallo`) y la base vuelve a verificar al guardar (principio 9).

type Resultado = { clave: string; items: Parecido[]; fallo: boolean };
const SIN_RESULTADO: Resultado = { clave: "", items: [], fallo: false };

export function useParecidos({
  nombre,
  activo,
  excluirId,
  marcaId,
}: {
  nombre: string;
  activo: boolean;
  excluirId?: string;
  /** Un nombre es único POR MARCA (ADR-0294): con este dato (`""` = sin marca) solo cuentan los productos de esa marca, igual que la base. Sin él, todas. */
  marcaId?: string;
}) {
  const peticion = useRef(0);
  const [resultado, setResultado] = useState<Resultado>(SIN_RESULTADO);
  const [reintento, setReintento] = useState(0);
  const [confirmoPara, setConfirmoPara] = useState("");
  // Un resultado vale para ese nombre Y esa marca: cambiar la marca cambia la respuesta de la base.
  const clave = `${nombre}\u0000${marcaId ?? "*"}`;

  useEffect(() => {
    if (!activo || !nombre) return;
    const id = ++peticion.current;
    const espera = setTimeout(async () => {
      // AbortController + temporizador, no `AbortSignal.timeout`: éste no existe en Safari antiguo (los iPads de las
      // tiendas) y lanzaría acá adentro, dejando `comprobando` en true para siempre — el bloque siguiente cerrado sin salida.
      const control = new AbortController();
      const corte = setTimeout(() => control.abort(), 6000);
      let resultadoNuevo: Resultado;
      try {
        // Parámetros LITERALES (no un spread): `pnpm datos:comparar` los lee del código para avisar si la base no los acepta.
        const { data, error } = await createClient()
          .rpc("buscar_productos_parecidos", {
            p_referencia: nombre,
            p_excluir_id: excluirId,
            p_marca_id: marcaId || undefined,
            p_por_marca: marcaId !== undefined,
          })
          .abortSignal(control.signal);
        resultadoNuevo =
          error || !data
            ? { clave, items: [], fallo: true }
            : {
                clave,
                fallo: false,
                items: data.map((p) => ({ id: p.id, referencia: p.referencia, categoria: p.categoria, nivel: p.nivel as Parecido["nivel"] })),
              };
      } catch {
        resultadoNuevo = { clave, items: [], fallo: true };
      } finally {
        clearTimeout(corte);
      }
      if (id !== peticion.current) return; // llegó tarde: ya se escribió otra cosa
      setResultado(resultadoNuevo);
    }, 350);
    return () => clearTimeout(espera);
  }, [nombre, activo, excluirId, marcaId, clave, reintento]);

  // Un resultado solo vale para el nombre con el que se pidió.
  const vigente = resultado.clave === clave ? resultado : SIN_RESULTADO;
  return {
    items: vigente.items,
    fallo: vigente.fallo,
    /** Todavía no se sabe si el nombre es duplicado: quien lo usa debe mantener cerrado lo que sigue. */
    comprobando: activo && nombre !== "" && resultado.clave !== clave,
    hayIdentico: vigente.items.some((p) => p.nivel === "identico"),
    hayUnaLetra: vigente.items.some((p) => p.nivel === "una_letra"),
    confirmo: confirmoPara === nombre,
    confirmar: (v: boolean) => setConfirmoPara(v ? nombre : ""),
    /** Vuelve a preguntar (ej. la base dijo «duplicado» al guardar y hay que mostrarlo en pantalla). */
    reintentar: () => setReintento((n) => n + 1),
    reiniciar: () => {
      setResultado(SIN_RESULTADO);
      setConfirmoPara("");
    },
  };
}
