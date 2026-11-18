import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { db, lecturaCompartida } from "./compartido-servidor";
import { enviarCorreo } from "./correo-servidor";
import {
  correoDeLaHoja,
  correoDeLaRespuesta,
  enlaceDeLaHoja,
  leerCopias,
  leerHoja,
  leerProveedor,
  leerRegistro,
  PROVEEDOR_DE_RESPALDO,
  type CopiaPorMandar,
  type DatosProveedor,
  type Hoja,
  type ResultadoHoja,
} from "./libro-reclamaciones";

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

// ---------- La copia al correo (PARTE 2, 20261118150000) ----------

/** Toma hasta `limite` copias pendientes (o solo la de `id`). null si la base no responde. */
const reclamarCopias = (limite: number, id: string | null): Promise<CopiaPorMandar[] | null> =>
  leerConRespaldo<CopiaPorMandar[] | null>(
    "tienda_libro_copias_reclamar_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_libro_copias_reclamar(${limite}::integer, ${id}::uuid) as r`;
      return leerCopias(fila?.r);
    },
    null,
  );

const marcarCopiaEnviada = (id: string): Promise<boolean> =>
  leerConRespaldo<boolean>(
    "tienda_libro_copia_enviada_fallo",
    async (db) => {
      await db`select retail.tienda_libro_copia_enviada(${id}::uuid)`;
      return true;
    },
    false,
  );

export type VueltaDeCopias = { tomadas: number; enviadas: number; fallidas: number; sinConfigurar: boolean } | null;

/**
 * Manda las copias pendientes: toma de la base, manda cada una y marca las que salieron. Lo que falla queda pendiente para la vuelta
 * siguiente (la base cuenta los intentos, hasta 5). `origen`: la dirección de la tienda, para el enlace a la constancia. `id`: solo esa
 * hoja (la acción que la acaba de guardar). null si la base no responde.
 */
export async function mandarCopias(origen: string, { limite = 20, id = null }: { limite?: number; id?: string | null } = {}): Promise<VueltaDeCopias> {
  const copias = await reclamarCopias(limite, id);
  if (copias === null) return null;
  let enviadas = 0;
  let fallidas = 0;
  let sinConfigurar = false;
  for (const c of copias) {
    const correo = correoDeLaHoja(c.hoja, enlaceDeLaHoja(origen, c.hoja.id, c.marca));
    const r = await enviarCorreo({ para: c.hoja.consumidor.correo, ...correo });
    if (r === "enviado" && (await marcarCopiaEnviada(c.hoja.id))) enviadas++;
    else {
      fallidas++;
      if (r === "sin_configurar") sinConfigurar = true;
      // Con su quinto intento ya no vuelve a salir: queda para revisarla a mano (solo su número, nunca sus datos).
      if (c.intentos >= 5) console.error(JSON.stringify({ evento: "tienda_libro_copia_sin_enviar", codigo: c.hoja.codigo }));
    }
  }
  return { tomadas: copias.length, enviadas, fallidas, sinConfigurar };
}

// ---------- La respuesta por correo (PARTE 4, 20261118152000) ----------

/**
 * Manda las respuestas de CAYLA que todavía no salieron por correo (las escribe el ERP; la tienda las manda). Misma regla que las copias:
 * lo que falla queda para la vuelta siguiente, hasta 5 intentos. null si la base no responde.
 */
export async function mandarRespuestas(origen: string, limite = 20): Promise<VueltaDeCopias> {
  const respuestas = await leerConRespaldo<CopiaPorMandar[] | null>(
    "tienda_libro_respuestas_reclamar_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_libro_respuestas_reclamar(${limite}::integer) as r`;
      return leerCopias(fila?.r, "respuestas");
    },
    null,
  );
  if (respuestas === null) return null;
  let enviadas = 0;
  let fallidas = 0;
  let sinConfigurar = false;
  for (const c of respuestas) {
    const r = await enviarCorreo({ para: c.hoja.consumidor.correo, ...correoDeLaRespuesta(c.hoja, enlaceDeLaHoja(origen, c.hoja.id, c.marca)) });
    const marcada =
      r === "enviado" &&
      (await leerConRespaldo<boolean>(
        "tienda_libro_respuesta_enviada_fallo",
        async (db) => {
          await db`select retail.tienda_libro_respuesta_enviada(${c.hoja.id}::uuid)`;
          return true;
        },
        false,
      ));
    if (marcada) enviadas++;
    else {
      fallidas++;
      if (r === "sin_configurar") sinConfigurar = true;
      if (c.intentos >= 5) console.error(JSON.stringify({ evento: "tienda_libro_respuesta_sin_enviar", codigo: c.hoja.codigo }));
    }
  }
  return { tomadas: respuestas.length, enviadas, fallidas, sinConfigurar };
}
