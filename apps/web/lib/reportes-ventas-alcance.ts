import "server-only";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getEmpresasAqui } from "@/lib/empresas-de-sede";
import { empresaDeUrl, empresasParaElegir, type EmpresaDeReporte } from "@/lib/reportes-empresa-reglas";

// Qué puede mirar quien abre un reporte de Ventas ▸ Reportes. Las TIENDAS: el líder, todas (y elige una); quien tiene el módulo en su rol, solo la suya. Lo
// decide la base (reglas de fila); esto solo evita ofrecer lo que la base no mostraría y NO obedece una tienda de la URL que la cuenta no puede elegir. Y la
// EMPRESA (CAYLA / CLAURE, ADR-0665): solo donde operan dos (hoy Lima): se ofrece cuando la tienda que se mira es una de esas, sea porque el líder la eligió o
// porque es la única de quien no es líder; en cualquier otro caso `?emp=` se ignora. Lo comparten las dos pantallas y las dos descargas: así el archivo dice
// lo que dice la pantalla.
//
// `ubicacion` es la tienda que se le manda a la base. Sin empresa es la elegida (o ninguna: la base ya acota a quien no es líder); con empresa es SIEMPRE una
// tienda, también para quien no es líder: la base exige saber dónde se parte (22023) y no la adivina.
export async function alcanceDeReportes(
  persona: { rol: string; ubicacionEtiqueta: string; ubicacionId: string },
  pedida: string | null,
  empresaPedida: string | string[] | null = null,
): Promise<{
  tiendas: { id: string; nombre: string }[] | null;
  tienda: string | null;
  sede: string;
  /** Las empresas entre las que se puede elegir en esta tienda, o `null` (hay una sola o no se supo): el filtro no se dibuja. */
  empresas: EmpresaDeReporte[] | null;
  /** La empresa elegida, ya validada contra las que se ofrecen. */
  empresa: EmpresaDeReporte | null;
  ubicacion: string | null;
}> {
  const esLider = persona.rol === "lider";
  const tiendas = esLider ? (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo).map((u) => ({ id: u.id, nombre: u.nombre })) : null;
  const tienda = esLider && pedida && tiendas?.some((t) => t.id === pedida) ? pedida : null;
  const sede = esLider ? (tiendas?.find((t) => t.id === tienda)?.nombre ?? "Todas las tiendas") : persona.ubicacionEtiqueta;

  // La tienda donde se parte: la elegida por el líder o la propia de quien no lo es. Con «todas las tiendas» no hay dónde partir.
  const sedeDondeSeParte = esLider ? tienda : persona.ubicacionId;
  const empresas = sedeDondeSeParte ? empresasParaElegir(await getEmpresasAqui(sedeDondeSeParte).catch(() => null)) : null;
  const empresa = empresaDeUrl(empresaPedida, empresas);
  return { tiendas, tienda, sede, empresas, empresa, ubicacion: empresa ? sedeDondeSeParte : tienda };
}
