import "server-only";
import { cookies } from "next/headers";
import { base, leerConRespaldo } from "./base";
import {
  COOKIE_BOLSA,
  DIAS_DE_LA_BOLSA,
  escribirBolsa,
  interpretarBolsaEnBase,
  leerBolsa,
  unidades,
  type Bolsa,
  type BolsaEnBase,
  type LineaBolsa,
} from "./bolsa";

// La bolsa en el servidor (ADR-0408, actividad 7): su cookie (la escriben solo las acciones de `app/acciones/bolsa.ts`) y lo que la
// base dice de ella (`retail.tienda_bolsa`) y de «Separar» (`retail.tienda_separar`, 20261015021000). La base decide el precio, si
// se puede separar y si alcanza: aquí no se confía en nada de lo que trae la cookie.

/** La bolsa de este aparato. */
export async function leerBolsaDeLaCookie(): Promise<Bolsa> {
  const almacen = await cookies();
  return leerBolsa(almacen.get(COOKIE_BOLSA)?.value);
}

/** Guarda la bolsa (solo desde una acción: una página no puede escribir cookies). Sin prendas ni tienda, la borra. */
export async function guardarBolsa(b: Bolsa): Promise<void> {
  const almacen = await cookies();
  if (b.lineas.length === 0 && !b.sedeId) {
    almacen.delete(COOKIE_BOLSA);
    return;
  }
  almacen.set(COOKIE_BOLSA, escribirBolsa(b), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DIAS_DE_LA_BOLSA * 24 * 60 * 60,
  });
}

/**
 * @public La cuenta del ícono de la bolsa en la cabecera (`components/bolsa/BotonBolsa.tsx`), que pone la integración de la tienda
 * (actividades 4 y 5). Lee solo la cookie: sin red y sin la base.
 */
export async function cuantasEnLaBolsa(): Promise<number> {
  return unidades(await leerBolsaDeLaCookie());
}

/** Lo que la base dice de esas prendas en esa tienda (o, sin tienda, al precio mayor de la web). `null` si no responde. */
export const leerBolsaEnBase = (lineas: readonly LineaBolsa[], sedeId: string | null): Promise<BolsaEnBase | null> =>
  leerConRespaldo(
    "tienda_bolsa_fallo",
    async (db) => {
      // El JSON viaja como TEXTO y lo convierte la base: con `::jsonb` solo, el driver lo vuelve a codificar (llega un texto, no una lista).
      const entrada = JSON.stringify(lineas.map((l) => ({ variante_id: l.varianteId, cantidad: l.cantidad })));
      const [fila] = await db`select retail.tienda_bolsa(${entrada}::text::jsonb, ${sedeId}::uuid) as b`;
      return interpretarBolsaEnBase(fila?.b);
    },
    null,
  );

export type ResultadoSeparar =
  | { ok: true; codigo: string }
  /** La base dijo que no (`hint`, y en `detalle` qué prenda) o no respondió (`hint` null). No quedó nada escrito. */
  | { ok: false; hint: string | null; detalle: string | null };

/** «Separar»: la base vuelve a calcular cada precio, revisa todo y crea el pedido por confirmar (sin tocar el stock). */
export async function separarEnBase(
  usuarioWebId: string,
  sedeId: string,
  lineas: readonly { variante_id: string; cantidad: number; precio: number }[],
  marca: string,
): Promise<ResultadoSeparar> {
  try {
    const [fila] = await base()`
      select retail.tienda_separar(${usuarioWebId}::uuid, ${sedeId}::uuid, ${JSON.stringify(lineas)}::text::jsonb, ${marca}::uuid) as r`;
    const codigo = (fila?.r as { codigo?: unknown } | undefined)?.codigo;
    if (typeof codigo === "string") return { ok: true, codigo };
    return { ok: false, hint: null, detalle: null };
  } catch (error) {
    const e = error as { hint?: unknown; detail?: unknown; code?: unknown };
    const hint = typeof e.hint === "string" ? e.hint : null;
    // Lo que la base explica (un precio que cambió, algo agotado) no es una falla: no se anota. Sin datos de la persona.
    if (!hint?.startsWith("tienda_") && !hint?.startsWith("pedido_web_")) {
      console.error(JSON.stringify({ evento: "tienda_separar_fallo", codigo: e.code ?? null, hint }));
    }
    return { ok: false, hint, detalle: typeof e.detail === "string" ? e.detail : null };
  }
}
