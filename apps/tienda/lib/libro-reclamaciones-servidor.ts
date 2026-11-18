import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { db, lecturaCompartida } from "./compartido-servidor";
import { leerHoja, leerProveedor, leerRegistro, PROVEEDOR_DE_RESPALDO, type DatosProveedor, type Hoja, type ResultadoHoja } from "./libro-reclamaciones";

// El Libro de Reclamaciones en la base (ADR-0679), solo por sus tres `retail.tienda_*` (20261118145000). Si la base no responde, cada
// lectura lo dice y la página se degrada (principio 9): el formulario se muestra igual y lo escrito no se pierde. En los registros del
// servidor no va nada de la persona ni lo que escribió: solo el evento y el error de la base.

/** Los datos de CAYLA se comparten entre visitas una hora: son los mismos para todos y casi nunca cambian. */
const datosCompartidos = lecturaCompartida("tienda-libro-datos-v1", 3600, async () => {
  const [fila] = await db()`select retail.tienda_libro_reclamaciones_datos() as r`;
  return fila?.r ?? null;
});

async function datosGuardados(): Promise<unknown> {
  "use cache";
  try {
    const crudos = await datosCompartidos();
    cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
    return crudos;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos.
    console.error(JSON.stringify({ evento: "tienda_libro_datos_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** Los datos de CAYLA que la hoja muestra antes de llenarla. Sin base, los de respaldo (los mismos que copia la base). */
export const leerDatosDelLibro = cache(async (): Promise<DatosProveedor> => {
  try {
    return leerProveedor(await datosGuardados());
  } catch {
    return PROVEEDOR_DE_RESPALDO;
  }
});

/** La guarda. `usuarioWebId`: si tiene sesión (si no, null: la hoja igual se guarda). `ipHash`: la huella de la conexión, o null. */
export const registrarHojaEnBase = (
  datos: Record<string, string | boolean>,
  usuarioWebId: string | null,
  ipHash: string | null,
  marca: string,
): Promise<ResultadoHoja> =>
  leerConRespaldo<ResultadoHoja>(
    "tienda_registrar_hoja_fallo",
    async (db) => {
      // El JSON viaja como TEXTO y lo convierte la base (como en la bolsa): con `::jsonb` solo, el driver lo vuelve a codificar.
      const [fila] = await db`select retail.tienda_registrar_hoja_reclamacion(${JSON.stringify(datos)}::text::jsonb, ${usuarioWebId}::uuid, ${ipHash}::text, ${marca}::uuid) as r`;
      return leerRegistro(fila?.r);
    },
    { estado: "sin_respuesta" },
  );

export type LecturaHoja = { estado: "ok"; hoja: Hoja } | { estado: "no_esta" } | { estado: "sin_respuesta" };

/** La constancia: con el id y la marca. */
export const leerHojaEnBase = (id: string, marca: string): Promise<LecturaHoja> =>
  leerConRespaldo<LecturaHoja>(
    "tienda_ver_hoja_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_ver_hoja_reclamacion(${id}::uuid, ${marca}::uuid) as r`;
      if (fila?.r === null || fila?.r === undefined) return { estado: "no_esta" };
      const hoja = leerHoja(fila.r);
      return hoja ? { estado: "ok", hoja } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );
