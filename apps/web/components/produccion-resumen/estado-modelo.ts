import type { TonoChip } from "@/components/ui/Chip";
import type { EstadoModelo } from "@/lib/produccion-decisiones";

/** El color de la insignia de cada consejo del Resumen de Producción. La usan la tabla «¿Qué producir?» y la hoja «Ver el modelo»: un mismo estado, el mismo color en las dos. */
export const TONO_ESTADO_MODELO: Record<EstadoModelo, TonoChip> = {
  producir_ya: "ambar",
  trasladar: "pizarra",
  en_produccion: "neutro",
  vigilar: "neutro",
  alcanza: "verde",
  sobrestock: "neutro",
  sin_ritmo: "apagado",
};
