"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerPrendasPorTienda, type PrendasPorTienda } from "@/lib/vitrina-looks-reglas";

// Qué hay en cada tienda, para armar un look (`fn_vitrina_prendas_por_tienda`, 20261027204000). Se pide al abrir la hoja de un look, no con la lista (cuesta unos
// 2,5 s en producción: arma el catálogo de cada tienda) y se guarda un minuto para que abrir varias hojas seguidas no la pida otra vez. Promete que, si la base no
// responde (o la función todavía no está), la hoja se ve igual: sin filtro ni aviso por tienda, y dice que no pudo mirarlo.

export type QueHayPorTienda = { estado: "cargando" } | { estado: "listo"; datos: PrendasPorTienda } | { estado: "error" };

const VIGENCIA_MS = 60_000;
let guardado: { cuando: number; datos: PrendasPorTienda } | null = null;
let enCurso: Promise<PrendasPorTienda | null> | null = null;

function pedir(): Promise<PrendasPorTienda | null> {
  if (!enCurso) {
    enCurso = (async () => {
      const { data, error } = await createClient().rpc("fn_vitrina_prendas_por_tienda");
      if (error) return null;
      const datos = leerPrendasPorTienda(data);
      guardado = { cuando: Date.now(), datos };
      return datos;
    })()
      .catch(() => null)
      .finally(() => {
        enCurso = null;
      });
  }
  return enCurso;
}

export function useQueHayPorTienda(): QueHayPorTienda {
  const [estado, setEstado] = useState<QueHayPorTienda>(() => (guardado && Date.now() - guardado.cuando < VIGENCIA_MS ? { estado: "listo", datos: guardado.datos } : { estado: "cargando" }));
  useEffect(() => {
    if (guardado && Date.now() - guardado.cuando < VIGENCIA_MS) return;
    let vivo = true;
    void pedir().then((datos) => {
      if (vivo) setEstado(datos ? { estado: "listo", datos } : { estado: "error" });
    });
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
