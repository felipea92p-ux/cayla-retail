import { HORAS_PROFORMA_POR_VENCER } from "@cayla-retail/shared";

// Reglas puras de proformas: ni Supabase ni `next/headers`, para que se puedan
// probar sin levantar nada — mismo criterio que `lib/registro-contable.ts`.
// `lib/proformas.ts` las reexporta, así que quien ya importaba desde ahí no
// cambia nada.

export type EstadoProforma = "vigente" | "convertida" | "vencida" | "anulada";

export type Proforma = {
  id: string;
  sede_id: string;
  cliente_nombre: string | null;
  cliente_num_doc: string | null;
  total: number;
  estado: EstadoProforma;
  comprobante_id: string | null;
  created_at: string;
  vence_at: string | null;
  /** Derivado, no es columna (camelCase como `stockTotal` en catalogo.ts): si le
   *  quedan menos de HORAS_PROFORMA_POR_VENCER para caducar.
   *
   *  Se calcula en el servidor y no en el componente. Dos razones: la regla de
   *  negocio ("48h") pertenece al dominio, no a la UI; y el reloj del navegador
   *  de una sede puede estar mal puesto — si cada tablet decidiera por su cuenta
   *  qué está por vencer, dos personas verían números distintos de la misma
   *  pantalla. */
  porVencer: boolean;
};

/** Fila tal como viene de la base, antes de calcularle nada. */
export type ProformaFila = Omit<Proforma, "porVencer">;

/** Marca cuáles están por vencer.
 *
 *  `ahora` es un PARÁMETRO y no una llamada a `Date.now()` escondida adentro, que
 *  es justo el error que tenía esto antes: el reloj es una entrada de la función,
 *  no un efecto oculto. Así la regla se puede probar con relojes fijos en vez de
 *  esperar 47 horas, y el resultado no cambia entre dos llamadas seguidas. */
export function marcarPorVencer(filas: ProformaFila[], ahora: number = Date.now()): Proforma[] {
  const limite = ahora + HORAS_PROFORMA_POR_VENCER * 3600 * 1000;
  return filas.map((p) => {
    const vence = p.vence_at ? new Date(p.vence_at).getTime() : null;
    return {
      ...p,
      // Solo una proforma vigente puede estar "por vencer": una ya convertida o
      // anulada no le sirve a nadie por más cerca que esté su fecha. Y una que YA
      // venció tampoco es "por vencer" — esa venta ya se perdió.
      porVencer: p.estado === "vigente" && vence != null && vence > ahora && vence < limite,
    };
  });
}
