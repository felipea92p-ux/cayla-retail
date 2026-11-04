import "server-only";
import { getUbicaciones } from "@/lib/ubicaciones";

// Qué tiendas puede mirar quien abre un reporte de Ventas ▸ Reportes: el líder, todas (y elige una); quien tiene el módulo en su rol, solo la suya. Lo
// decide la base (reglas de fila); esto solo evita ofrecer lo que la base no mostraría y NO obedece una tienda de la URL que la cuenta no puede elegir.
// Lo comparten las dos pantallas y las dos descargas: así el archivo dice lo que dice la pantalla.
export async function alcanceDeReportes(
  persona: { rol: string; ubicacionEtiqueta: string },
  pedida: string | null,
): Promise<{ tiendas: { id: string; nombre: string }[] | null; tienda: string | null; sede: string }> {
  const esLider = persona.rol === "lider";
  const tiendas = esLider ? (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo).map((u) => ({ id: u.id, nombre: u.nombre })) : null;
  const tienda = esLider && pedida && tiendas?.some((t) => t.id === pedida) ? pedida : null;
  const sede = esLider ? (tiendas?.find((t) => t.id === tienda)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;
  return { tiendas, tienda, sede };
}
