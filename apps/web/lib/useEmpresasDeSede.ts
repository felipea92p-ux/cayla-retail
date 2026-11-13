"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmpresaElegible } from "@/lib/dueno-reglas";

// Las empresas que operan en una sede (`fn_empresas_de_sede`, la misma regla del alta, del disparador de movimientos y de la tienda online),
// para que una pantalla del navegador sepa si tiene que preguntar «¿de quién es?» (ADR-0542). Una lectura por sede y por carga de página:
// el resultado se comparte entre las pantallas que lo piden. `null` = todavía no se sabe o la base no respondió (no se pregunta: la base decide).
const lecturas = new Map<string, Promise<EmpresaElegible[] | null>>();

function leer(sedeId: string): Promise<EmpresaElegible[] | null> {
  let p = lecturas.get(sedeId);
  if (!p) {
    p = Promise.resolve(createClient().rpc("fn_empresas_de_sede", { p_sede_id: sedeId })).then(
      ({ data, error }) => (error || !data ? null : data.map((e) => ({ id: e.id, clave: e.clave, nombre: e.nombre }))),
      () => null,
    );
    lecturas.set(sedeId, p);
    // Una respuesta fallida no se queda guardada: la próxima pantalla vuelve a preguntar.
    void p.then((r) => {
      if (r === null) lecturas.delete(sedeId);
    });
  }
  return p;
}

export function useEmpresasDeSede(sedeId: string | null | undefined): EmpresaElegible[] | null {
  const [empresas, setEmpresas] = useState<EmpresaElegible[] | null>(null);
  useEffect(() => {
    if (!sedeId) return;
    let vivo = true;
    void leer(sedeId).then((r) => {
      if (vivo) setEmpresas(r);
    });
    return () => {
      vivo = false;
    };
  }, [sedeId]);
  return sedeId ? empresas : null;
}
