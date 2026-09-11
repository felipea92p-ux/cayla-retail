import type { Json } from "@cayla-retail/database";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";
import { aplicarMapeo, type FilaEstandar, type PlanDeMapeo } from "@/lib/importacion/mapeo";
import { normalizarTalla, tokenTalla } from "@/lib/importacion/valores";
import { claveTexto } from "@/lib/taxonomia/anclar";

// POST /api/importacion/importar
//   { filas, filaCabecera, plan, origen, colores, categorias } → escribe
//
// CONTRATO
//   PROMETE: todo o nada. El RPC `importar_catalogo` (0056) corre en una sola
//            transacción: o entra el catálogo entero, o no entra nada. No hay
//            estado donde la mitad de las prendas existe.
//   PROMETE: stock en cero. Solo crea catálogo; las cantidades las levanta el
//            censo (ADR-0027). Es lo que hace posible deshacer sin reescribir
//            historia.
//   ASUME:   sesión válida y rol de Líder, y que los valores nuevos ya pasaron
//            por la pantalla de revisión — este endpoint no llama a la IA.
//
// POR QUÉ SE AGRUPA ACÁ Y NO EN EL RPC: el archivo trae una fila por variante
// (o una por color en matriz de tallas), y la base quiere un producto con sus
// variantes debajo. Agrupar por referencia normalizada es puro código y mucho
// más fácil de leer y testear en TypeScript que en PL/pgSQL. El RPC recibe la
// forma que le conviene y se concentra en escribir bien.

type ValorAprobado = { texto: string; universalId: string | null };

function agruparProductos(variantes: FilaEstandar[]) {
  const porRef = new Map<string, { referencia: string; categoria: string; marca: string; genero: string; temporada: string; descripcion: string; variantes: Array<{ [k: string]: Json }> }>();

  // El "código" del cliente es de VARIANTE solo si es distinto en cada fila.
  // Muchos sistemas viejos llevan un código por MODELO (el mismo en la S, la M
  // y la L); usarlo como sku dejaba que la primera variante se lo quedara y
  // las demás cayeran al derivado — un catálogo donde el 1 de cada 3 tenía el
  // código "de verdad" y el resto uno inventado, sin que nadie lo viera. Si un
  // código se repite, no es de variante y no se usa. Revisión del 2026-09-11.
  const vecesCodigo = new Map<string, number>();
  for (const v of variantes) {
    const c = v.codigoCliente.trim();
    if (c) vecesCodigo.set(c, (vecesCodigo.get(c) ?? 0) + 1);
  }

  for (const v of variantes) {
    const clave = v.referencia.trim().toLowerCase().replace(/\s+/g, " ");
    let p = porRef.get(clave);
    if (!p) {
      p = {
        referencia: v.referencia.trim(),
        categoria: v.categoria,
        marca: v.marca,
        genero: v.genero,
        temporada: v.temporada,
        descripcion: v.descripcion,
        variantes: [],
      };
      porRef.set(clave, p);
    }
    const codigoCliente = v.codigoCliente.trim();
    p.variantes.push({
      codigoCliente: (vecesCodigo.get(codigoCliente) ?? 0) > 1 ? "" : codigoCliente,
      talla: normalizarTalla(v.talla),
      color: v.color,
      costo: v.costo,
      precio: v.precio,
    });
  }

  // La base tiene `unique (producto_id, talla, color)` (0047): dos filas del
  // archivo con la misma talla y color del mismo modelo son un duplicado del
  // cliente, no dos variantes. Se deja una y se cuenta cuántas se quitaron, para
  // decirlo en pantalla en vez de que Postgres lo rechace a mitad de camino.
  //
  // La clave del dedup tiene que ser LA MISMA que usa la base, o el filtro deja
  // pasar lo que el índice rechaza. Y la base tiene DOS índices: la identidad
  // (talla, color canónico) y el código corto (`variantes_codigo_unico`), que
  // es más estricto porque `fn_token_talla` colapsa "S/M" y "SM". Se dedupe
  // con la clave más estricta de las dos: el token de talla (tokenTalla replica
  // fn_token_talla, valores.test.ts lo fija contra Postgres) y el color por
  // fn_clave_texto (claveTexto lo replica, anclar.test.ts). Con toLowerCase() a
  // secas, "Azul  marino" y "Azul marino" pasaban la pantalla y la importación
  // entera moría con un 23505 crudo.
  let duplicadas = 0;
  for (const p of porRef.values()) {
    const vistas = new Set<string>();
    p.variantes = p.variantes.filter((v) => {
      const k = `${tokenTalla(String(v.talla))}|${claveTexto(String(v.color))}`;
      if (vistas.has(k)) {
        duplicadas++;
        return false;
      }
      vistas.add(k);
      return true;
    });
  }

  return { productos: [...porRef.values()], duplicadas };
}

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede importar un catálogo." }, { status: 403 });
  }

  const cuerpo = (await request.json().catch(() => null)) as {
    filas?: string[][];
    filaCabecera?: number;
    plan?: PlanDeMapeo;
    origen?: string;
    colores?: ValorAprobado[];
    categorias?: ValorAprobado[];
    /** Uno por intento. Reintentar con el mismo devuelve la importación que ya entró. */
    token?: string;
  } | null;

  if (!Array.isArray(cuerpo?.filas) || !cuerpo?.plan) {
    return Response.json({ error: "Faltan las filas o el plan de columnas." }, { status: 400 });
  }

  const variantes = aplicarMapeo(cuerpo.filas, cuerpo.plan, cuerpo.filaCabecera ?? 0);
  if (variantes.length === 0) {
    return Response.json({ error: "Con este plan no sale ninguna prenda del archivo." }, { status: 422 });
  }

  const { productos, duplicadas } = agruparProductos(variantes);

  // El token viaja al RPC como uuid: si no tiene esa forma, mejor rechazarlo
  // acá que dejar que el cast de Postgres reviente con un 22P02 crudo.
  const token = cuerpo.token?.trim() ?? "";
  if (token && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return Response.json({ error: "El token del intento no es válido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_catalogo", {
    p_catalogo: {
      token: token || null,
      origen: cuerpo.origen ?? "(sin origen)",
      // El plan se guarda CON las cabeceras del archivo: es lo que permite que
      // /api/importacion/mapear lo reutilice la próxima vez que llegue un
      // archivo con las mismas columnas, sin pagar otra llamada al modelo.
      plan: { ...cuerpo.plan, cabeceras: cuerpo.filas[cuerpo.filaCabecera ?? 0] ?? [] },
      colores: (cuerpo.colores ?? []).map((c) => ({ nombre: c.texto, taxonomiaValorId: c.universalId })),
      categorias: (cuerpo.categorias ?? []).map((c) => ({ nombre: c.texto, taxonomiaCategoriaId: c.universalId })),
      productos,
    } as unknown as Json,
  });

  if (error) {
    // Los mensajes del RPC ya vienen en idioma CAYLA ("El producto X no tiene
    // ninguna variante"); los de Postgres (unique, check) pasan por el
    // traductor de ADR-0022 igual que el resto de las escrituras.
    return Response.json({ error: traducirError(error, "importar el catálogo") }, { status: 422 });
  }

  return Response.json({ ...(data as Record<string, unknown>), duplicadas });
}
