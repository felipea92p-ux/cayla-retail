// Forma y mapeo de una clienta — sin `supabase/server` ni `supabase/client`: lo importan
// tanto la lectura del servidor (`clientas.ts`) como las escrituras del navegador
// (`clientas-acciones.ts`) y el panel cliente, sin arrastrar el lado equivocado de Supabase
// al otro (mismo criterio que separa `ventas-historial.ts` de `ventas-historial-reglas.ts`).
export type Clienta = {
  id: string;
  dni: string | null;
  nombre: string | null;
  telefonoWhatsapp: string | null;
  /** true si la clienta dio su permiso de contacto por WhatsApp — dato aparte del teléfono. */
  tienePermisoWhatsapp: boolean;
  cumpleDia: number | null;
  cumpleMes: number | null;
  createdAt: string;
};

export type FilaClienta = {
  id: string;
  dni: string | null;
  nombre: string | null;
  telefono_whatsapp: string | null;
  whatsapp_consentimiento_en: string | null;
  cumple_dia: number | null;
  cumple_mes: number | null;
  created_at: string;
};

export function aClienta(fila: FilaClienta): Clienta {
  return {
    id: fila.id,
    dni: fila.dni,
    nombre: fila.nombre,
    telefonoWhatsapp: fila.telefono_whatsapp,
    tienePermisoWhatsapp: fila.whatsapp_consentimiento_en !== null,
    cumpleDia: fila.cumple_dia,
    cumpleMes: fila.cumple_mes,
    createdAt: fila.created_at,
  };
}
