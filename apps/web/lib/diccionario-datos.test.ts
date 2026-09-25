import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El diccionario de datos (docs/datos/generado/) tiene dos mitades: lo que un script lee de producción (nadie lo edita a
// mano) y lo que se escribe a mano (glosario.json). Cada una falló en silencio en el refresco de 2026-09-25, y esta
// prueba vigila las dos con lo que YA está en el repo (sin base de datos, sin red):
//
//  1. PERMISOS POR FILA (RLS). El generador los deducía de «la tabla tiene alguna política». Es falso por diseño
//     (ADR-0195): las tablas de plata quedan con RLS encendido y SIN políticas —cerradas para los clientes, abiertas solo por
//     funciones `security definer`—, y el diccionario las pintó «⚠️ sin permisos por fila»: 32 alertas rojas contra 9 reales
//     donde en producción las 117 tablas tienen RLS. Ahora se LEE de `retail_rls.json` (pg_class.relrowsecurity), y esta
//     prueba exige que lo que pinta el diccionario sea exactamente eso.
//  2. GLOSARIO. Las glosas se pegan por NOMBRE de columna; cuando Finanzas F2 rehízo `gastos` y `activos_fijos`, las viejas
//     siguieron pegadas y el diccionario se contradecía dentro de la misma tabla («la base acepta cualquier texto» al lado
//     de la llave foránea que lo impide). La regla: toda glosa apunta a una columna que existe. Hoy la cumplen `gastos`,
//     `activos_fijos` y las 170 glosas vivas; quedan 247 glosas HUÉRFANAS de antes (175 de 26 tablas que ya no existen en
//     `retail`, 72 de columnas que salieron de 17 tablas que sí) congeladas en DEUDA_DE_GLOSAS: la lista solo puede
//     ENCOGERSE. Una glosa huérfana nueva pone la prueba en rojo, y una que se limpia obliga a sacarla de la lista.
//     Y una glosa viva NO puede afirmar lo que un cambio de código deja falso (2026-09-25, segunda revisión: en
//     `activos_fijos` seguían «nadie lo lee» / «ningún cálculo lo usa» con fn_depreciacion_mes usando ambas columnas; al
//     auditar las 170 salieron 33 contradiciendo a producción y 59 afirmando estado de uso). Tres candados generales:
//     nada de «nadie / ninguna / hoy / todavía»; todo valor entre comillas simples existe en un candado de esa tabla; y
//     toda referencia `tabla.columna` apunta a una columna que existe.
//  3. LA FOTO. `retail_foto.json` trae la fecha en que se tomó y cuántas relaciones y funciones había. La cabecera del
//     diccionario la imprime, y esta prueba exige que coincida con lo que la acompaña: la foto de funciones llevaba 535
//     firmas cuando producción tenía 544 y nada lo decía.

const DIR = new URL("../../../docs/datos/generado/", import.meta.url);
const leer = (archivo: string) => readFileSync(new URL(archivo, DIR), "utf8");
const json = <T>(archivo: string) => JSON.parse(leer(archivo)) as T;

type Rls = Record<string, { relkind: string; rls: boolean; forzado: boolean }>;
type Columnas = Record<string, { column_name: string; is_nullable: string; column_default: string | null }[]>;
type Restriccion = { conname: string; definicion: string; tabla: string };
type Politica = { tablename: string };
type IndiceUnico = { tablename: string; indexname: string; indexdef: string };
type Foto = { leido_en: string; relaciones: number; funciones: number };

const rls = json<Rls>("retail_rls.json");
const columnas = json<Columnas>("retail_columnas.json");
const restricciones = json<Restriccion[]>("retail_constraints.json");
const politicas = json<Politica[]>("retail_policies.json");
const indicesUnicos = json<IndiceUnico[]>("retail_indices_unicos.json");
const filas = json<Record<string, number>>("retail_filas.json");
const foto = json<Foto>("retail_foto.json");
const glosario = json<Record<string, string>>("glosario.json");
const firmas = leer("funciones-produccion.txt").split("\n").filter(Boolean);
const DICCIONARIO = leer("DICCIONARIO-RETAIL.md");

// Lo que la base dice de una tabla, para atar cada glosa a un hecho (no a una opinión).
const existe = (tabla: string, columna: string) => columnas[tabla]?.some((c) => c.column_name === columna) ?? false;
const laColumna = (tabla: string, nombre: string) => columnas[tabla]?.find((c) => c.column_name === nombre);
const candado = (tabla: string, nombre: string) => restricciones.find((c) => c.tabla === `retail.${tabla}` && c.conname === nombre)?.definicion ?? "";
const unicoPor = (tabla: string, indice: string) => indicesUnicos.some((i) => i.tablename === tabla && i.indexname === indice && /unique/i.test(i.indexdef));
const partir = (clave: string) => {
  const [, tabla = "", ...resto] = clave.split(".");
  return { tabla, columna: resto.join(".") };
};

const esVista = (relacion: string) => ["v", "m"].includes(rls[relacion]?.relkind ?? "");
const relaciones = Object.keys(rls).sort();
const tablasBase = relaciones.filter((r) => !esVista(r));

/** Cada ficha del diccionario: `### \`tabla\`` hasta la siguiente. La cabecera de un pájaro (`## …`) cae en la última ficha
 *  del anterior, y no trae etiquetas de permisos, así que no estorba. */
function fichas(md: string): Map<string, string> {
  const salida = new Map<string, string>();
  for (const parte of md.split(/^### /m).slice(1)) {
    const nombre = parte.match(/^`([a-z0-9_]+)`/)?.[1];
    if (nombre) salida.set(nombre, parte);
  }
  return salida;
}
const FICHAS = fichas(DICCIONARIO);
/** La línea en cursiva bajo el título de la ficha: «*8 columnas · ~9 filas · permisos por fila **activos***». */
const meta = (ficha: string) => ficha.match(/^\*(\d+ columnas[^\n]*)\*$/m)?.[1] ?? "";

describe("permisos por fila: el diccionario dice lo que dice la base (retail_rls.json)", () => {
  it("la foto de RLS y la foto de columnas hablan de las mismas relaciones", () => {
    // Se piden juntas (COMO-REFRESCAR.md): si una quedó vieja, el diccionario mentiría sin avisar.
    expect(Object.keys(columnas).sort()).toEqual(relaciones);
  });

  it("el diccionario trae una ficha por cada relación, ni más ni menos", () => {
    expect([...FICHAS.keys()].sort()).toEqual(relaciones);
    expect(DICCIONARIO).toContain(`**Tablas y vistas encontradas:** ${relaciones.length}`);
  });

  it("cada tabla lleva la etiqueta de permisos que le toca según la base", () => {
    const mal: string[] = [];
    for (const tabla of tablasBase) {
      const linea = meta(FICHAS.get(tabla) ?? "");
      const dice = linea.includes("⚠️ **sin permisos por fila**") ? "sin permisos" : linea.includes("permisos por fila **activos**") ? "activos" : "nada";
      const debe = rls[tabla].rls ? "activos" : "sin permisos";
      if (dice !== debe) mal.push(`${tabla}: el diccionario dice «${dice}» y la base dice «${debe}»`);
      // «forzados» solo si la base los fuerza también para el dueño de la tabla.
      if (linea.includes("forzados también para el dueño") !== rls[tabla].forzado) mal.push(`${tabla}: mal el «forzados también para el dueño»`);
    }
    expect(mal).toEqual([]);
  });

  it("no hay una alerta «sin permisos por fila» de más ni de menos: tantas como tablas sin RLS", () => {
    const alertas = DICCIONARIO.match(/sin permisos por fila/g)?.length ?? 0;
    expect(alertas).toBe(tablasBase.filter((t) => !rls[t].rls).length);
  });

  it("una vista no lleva etiqueta de permisos (no tiene RLS propio) ni «Quién puede qué»", () => {
    const vistas = relaciones.filter(esVista);
    expect(vistas.length).toBeGreaterThan(0);
    for (const vista of vistas) {
      const ficha = FICHAS.get(vista) ?? "";
      expect(ficha.split("\n", 1)[0], `${vista} debe titularse como vista`).toContain("*(vista)*");
      expect(meta(ficha), vista).not.toMatch(/permisos por fila|filas/);
      expect(ficha, vista).not.toContain("Quién puede qué");
    }
  });

  it("una tabla con RLS y sin políticas dice que solo se entra por funciones; con políticas, las lista", () => {
    const conPolitica = new Set(politicas.map((p) => p.tablename));
    const mal: string[] = [];
    for (const tabla of tablasBase.filter((t) => rls[t].rls)) {
      const ficha = FICHAS.get(tabla) ?? "";
      const esperado = conPolitica.has(tabla) ? "**Quién puede qué** (políticas de fila)" : "**Quién puede qué:** ninguna política";
      if (!ficha.includes(esperado)) mal.push(`${tabla}: falta «${esperado}»`);
    }
    expect(mal).toEqual([]);
  });

  it("toda tabla base de retail tiene RLS encendido: sin él, cualquiera con la llave pública la lee entera", () => {
    // Si algún día una tabla debe quedar abierta a propósito, va aquí con su razón; hoy no hay ninguna.
    const SIN_RLS_A_PROPOSITO: string[] = [];
    expect(tablasBase.filter((t) => !rls[t].rls && !SIN_RLS_A_PROPOSITO.includes(t))).toEqual([]);
  });
});

describe("la foto de producción: fecha y conteos coinciden con lo que la acompaña", () => {
  it("retail_foto.json trae una fecha ISO válida y no del futuro", () => {
    expect(foto.leido_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const t = Date.parse(foto.leido_en);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it("dice cuántas relaciones tiene: las mismas que retail_columnas.json", () => {
    expect(foto.relaciones).toBe(Object.keys(columnas).length);
  });

  it("dice cuántas funciones tiene: las mismas líneas que funciones-produccion.txt (ni una firma repetida)", () => {
    expect(firmas.length, "la foto de funciones quedó vieja: vuelve a pedirla (COMO-REFRESCAR.md, consulta 7 y 9)").toBe(foto.funciones);
    expect(new Set(firmas).size).toBe(firmas.length);
  });

  it("la cabecera del diccionario imprime la fecha de la foto y el conteo de funciones, no un «ver COMO-REFRESCAR»", () => {
    expect(DICCIONARIO).toContain(`**Leído el:** ${foto.leido_en.slice(0, 19).replace("T", " ")} UTC`);
    expect(DICCIONARIO).not.toMatch(/Leído el:\*\* volcado/);
    expect(DICCIONARIO).toContain(`**Funciones en \`retail\`:** ${foto.funciones}`);
    expect(json<{ leido_en: string; funciones_en_produccion: number }>("inventario-produccion.json")).toMatchObject({
      leido_en: foto.leido_en,
      funciones_en_produccion: foto.funciones,
    });
  });
});

describe("glosario: toda glosa apunta a una columna que existe", () => {
  const huerfanas = Object.keys(glosario).filter((clave) => {
    const { tabla, columna } = partir(clave);
    return !existe(tabla, columna);
  });

  it("todas las claves son «retail.tabla.columna»", () => {
    expect(Object.keys(glosario).filter((k) => !/^retail\.[a-z0-9_]+\..+$/.test(k))).toEqual([]);
  });

  it("gastos y activos_fijos —las tablas que Finanzas F2 rehízo— no tienen ni una glosa huérfana", () => {
    expect(huerfanas.filter((k) => /^retail\.(gastos|activos_fijos)\./.test(k))).toEqual([]);
  });

  // Deuda de antes del refresco de 2026-09-25: glosas escritas para tablas o columnas que ya no existen (renombradas
  // `sede_id → ubicacion_id`, tablas movidas a Dynamic o retiradas). Cada una se RE-ATA a su columna nueva (si el texto
  // sigue siendo verdad) o se borra; nunca se agrega una. 247 = 175 (26 tablas que ya no están en `retail`) + 72 (17 tablas).
  const DEUDA_DE_GLOSAS: Record<string, string[]> = {
    // Tablas que ya no existen en `retail`:
    ajustes_efectivo: ["created_at", "fecha", "id", "monto", "motivo", "sede_id", "usuario_id"],
    asiento_lineas: ["asiento_id", "cuenta_id", "debe", "glosa", "haber", "id"],
    asientos: ["creado_por", "created_at", "fecha", "glosa", "id", "origen", "referencia_id", "referencia_tipo", "unidad_id"],
    bom_items: ["cantidad_requerida", "created_at", "id", "insumo", "precio_unitario", "producto_id", "unidad"],
    contenedores: ["codigo", "created_at", "id", "sede_id", "tipo"],
    conteo_lineas: ["actualizado_en", "cantidad_contada", "cantidad_sistema", "contado_en", "contado_por", "contenedor_id", "conteo_id", "diferencia", "id", "movimiento_id", "nota", "variante_id"],
    cuentas_contables: ["activo", "codigo", "created_at", "elemento", "es_contra", "explicacion", "id", "naturaleza", "nombre", "orden", "updated_at"],
    depositos_bancarios: ["created_at", "fecha", "id", "monto", "nota", "sede_id", "usuario_id"],
    importaciones: ["categorias_creadas", "colores_creados", "created_at", "deshecha_en", "estado", "id", "origen", "persona_id", "plan", "productos_creados", "token", "variantes_creadas"],
    migraciones_aplicadas: ["aplicada_at", "archivo", "nota"],
    ordenes_compra: ["created_at", "estado", "fecha", "fecha_estimada", "id", "monto_estimado", "nota", "proveedor", "proveedor_id", "sede_destino_id", "updated_at"],
    ordenes_compra_items: ["cantidad", "costo_unitario", "id", "orden_id", "variante_id"],
    ordenes_produccion: ["cantidad_planeada", "cantidad_producida", "created_at", "destino_sede_id", "estado", "etapa", "fecha_fin", "fecha_inicio", "id", "nota", "sede_id", "updated_at", "variante_id"],
    patrimonio_items: ["categoria", "created_at", "id", "monto", "nombre", "nota", "tipo", "updated_at"],
    personas: ["auth_user_id", "email", "estado", "id", "nombre", "rol", "sede_id"],
    producto_atributos: ["atributo_id", "producto_id", "valor_id", "valor_texto"],
    sede_datos_fiscales: ["departamento", "direccion", "distrito", "provincia", "sede_id", "telefono", "ubigeo", "updated_at"],
    sede_meta: ["created_at", "sede_id", "tienda_asociada_id", "tipo"],
    sedes: ["activo", "codigo", "id", "nombre", "tienda_asociada_id", "tipo"],
    stock_almacen: ["cantidad", "sede_id", "ultima_entrada", "ultima_salida", "updated_at", "variante_id"],
    taxonomia_atributos: ["descripcion", "handle", "id", "nombre"],
    taxonomia_categoria_atributos: ["atributo_id", "categoria_id"],
    taxonomia_categorias: ["id", "nivel", "nombre", "padre_id", "ruta", "vertical"],
    taxonomia_valores: ["atributo_id", "handle", "id", "nombre"],
    taxonomia_versiones: ["cargada_en", "es_activa", "version"],
    ventas_historicas_mensuales: ["anio", "id", "mes", "monto", "sede_id"],
    // Tablas que sí existen, con columnas que salieron:
    cajas: ["monto_cierre_contado", "monto_cierre_esperado", "sede_id"],
    categorias: ["created_at", "tallas_sugeridas", "taxonomia_categoria_id"],
    codigos_barras: ["creado_por", "nota"],
    colores: ["created_at", "taxonomia_valor_id"],
    comprobantes: ["sede_id"],
    conteos: ["abierto_en", "alcance_contenedor_id", "alcance_familia", "lineas_ajustadas", "nombre", "nota", "sede_id", "tratar_no_contado", "ubicacion", "unidades_diferencia"],
    lotes: ["created_at", "orden_compra_id", "origen", "proveedor", "sede_id"],
    movimientos: ["canal", "contenedor_id", "monto", "sede_destino_id", "sede_id", "venta_id"],
    produccion_lineas: ["cantidad"],
    producciones: ["cantidad", "detalle", "fecha", "precio_taller", "unidad_id", "variante_id"],
    productos: ["costo_mano_obra", "foto_url", "genero", "importacion_id", "marca", "material", "sku_padre", "updated_at"],
    proformas: ["sede_id"],
    proveedores: ["categoria", "direccion", "marca", "nota", "score", "updated_at"],
    series_comprobantes: ["sede_id"],
    stock: ["contenedor_id", "sede_id", "stock_minimo", "ultima_entrada", "ultima_salida", "ultima_venta"],
    variantes: ["color", "color_id", "foto_url", "precio_oferta", "precio_taller", "stock_minimo", "talla", "updated_at"],
    ventas: ["metodo_pago", "monto_total", "sede_id"],
  };
  const deuda = new Set(Object.entries(DEUDA_DE_GLOSAS).flatMap(([tabla, cols]) => cols.map((c) => `retail.${tabla}.${c}`)));

  it("no aparece ninguna glosa huérfana nueva: las únicas son las de la deuda congelada", () => {
    expect(huerfanas.filter((k) => !deuda.has(k))).toEqual([]);
  });

  it("la deuda solo se encoge: lo que ya se limpió sale de la lista (y son 247, ni una más)", () => {
    const yaLimpias = [...deuda].filter((k) => !huerfanas.includes(k));
    expect(yaLimpias, "estas glosas ya no son huérfanas: bórralas de DEUDA_DE_GLOSAS").toEqual([]);
    expect(deuda.size, "la deuda cambió de tamaño: actualiza el 247 del encabezado y de esta prueba").toBe(247);
  });

  // Glosas que se retiraron porque decían lo CONTRARIO de lo que la base ya hace (columna que sí existe, así que el filtro
  // de huérfanas no las ve). Cada una lleva el hecho de producción que la desmiente: si ese hecho desaparece la glosa
  // podría volver a ser verdad y hay que revisarla, y si alguien pega la frase vieja de vuelta, la prueba se pone roja.
  const FALSAS_RETIRADAS: { clave: string; frase: RegExp; desmentida: string; hecho: () => boolean }[] = [
    { clave: "retail.gastos.id", frase: /nada impide anotarla dos veces/i, desmentida: "gastos.token_cliente es UNIQUE: el doble clic no duplica",
      hecho: () => restricciones.some((c) => c.tabla === "retail.gastos" && /^UNIQUE \(token_cliente\)/.test(c.definicion)) },
    { clave: "retail.gastos.categoria", frase: /la base acepta cualquier texto/i, desmentida: "gastos.categoria es llave foránea a categorias_gasto",
      hecho: () => restricciones.some((c) => c.tabla === "retail.gastos" && /^FOREIGN KEY \(categoria\) REFERENCES retail\.categorias_gasto/.test(c.definicion)) },
    { clave: "retail.gastos.igv", frase: /todavía nadie usa/i, desmentida: "fn_igv_credito_fiscal ya usa el IGV de los gastos",
      hecho: () => firmas.some((f) => f.startsWith("fn_igv_credito_fiscal(")) },
    { clave: "retail.gastos.created_at", frase: /a qué mes se carga/i, desmentida: "el mes lo decide gastos.fecha, no created_at",
      hecho: () => existe("gastos", "fecha") },
    { clave: "retail.activos_fijos.estado", frase: /producción no tiene ese candado/i, desmentida: "activos_fijos_estado_check ya está en producción (con 'anulado')",
      hecho: () => restricciones.some((c) => c.tabla === "retail.activos_fijos" && c.conname === "activos_fijos_estado_check" && c.definicion.includes("'anulado'")) },

    // Segunda revisión (2026-09-25): las que seguían impresas en activos_fijos, lotes y demás tablas contra lo que producción
    // ya hace. Cada `frase` es el texto que se retiró, tal cual estaba.
    { clave: "retail.activos_fijos.valor_residual", frase: /nadie lo lee/i,
      desmentida: "fn_depreciacion_mes reparte (costo − valor_residual) y activos_fijos_costo_positivo lo acota",
      hecho: () => firmas.some((f) => f.startsWith("fn_depreciacion_mes(")) && candado("activos_fijos", "activos_fijos_costo_positivo").includes("valor_residual") },
    { clave: "retail.activos_fijos.vida_util_meses", frase: /ningún cálculo lo usa/i,
      desmentida: "fn_depreciacion_mes y fn_meses_depreciados reparten el costo en vida_util_meses",
      hecho: () => firmas.some((f) => f.startsWith("fn_meses_depreciados(")) && firmas.some((f) => f.startsWith("fn_depreciacion_mes(")) && candado("activos_fijos", "activos_fijos_costo_positivo").includes("vida_util_meses") },
    { clave: "retail.activos_fijos.cuenta_codigo", frase: /apunta a cuentas que no existen/i,
      desmentida: "retail.cuentas tiene 41 cuentas (333, 335 y 336 entre ellas) y cada tipo de activo trae su cuenta_pcge",
      hecho: () => (filas.cuentas ?? 0) > 0 && existe("tipos_activo", "cuenta_pcge") },
    { clave: "retail.lotes.proveedor_id", frase: /hoy nadie la llena/i, desmentida: "lotes.proveedor_id es NOT NULL y llave foránea a proveedores",
      hecho: () => laColumna("lotes", "proveedor_id")?.is_nullable === "NO" && candado("lotes", "lotes_proveedor_id_fkey").includes("REFERENCES retail.proveedores") },
    { clave: "retail.cajas.monto_apertura", frase: /acepta hasta un monto negativo/i, desmentida: "cajas_monto_apertura_check exige monto_apertura >= 0",
      hecho: () => /monto_apertura >= \(0\)/.test(candado("cajas", "cajas_monto_apertura_check")) },
    { clave: "retail.categorias.familia", frase: /séptima exige migración/i, desmentida: "categorias.familia es llave foránea a la tabla familias: una séptima es una fila",
      hecho: () => candado("categorias", "categorias_familia_fk").includes("REFERENCES retail.familias") },
    { clave: "retail.categorias.prefijo", frase: /obligatorio y único/i, desmentida: "categorias.prefijo acepta vacío (solo es único y de 3 letras cuando existe)",
      hecho: () => laColumna("categorias", "prefijo")?.is_nullable === "YES" },
    { clave: "retail.codigos_barras.variante_id", frase: /si se borra la prenda, el código también/i, desmentida: "la llave foránea a variantes no tiene ON DELETE CASCADE",
      hecho: () => candado("codigos_barras", "codigos_barras_variante_id_fkey").includes("REFERENCES retail.variantes") && !/CASCADE/i.test(candado("codigos_barras", "codigos_barras_variante_id_fkey")) },
    { clave: "retail.codigos_barras.origen", frase: /'cayla', 'proveedor' u 'otro'/, desmentida: "codigos_barras_origen_check admite 'propio' y 'fabrica'",
      hecho: () => /'propio'/.test(candado("codigos_barras", "codigos_barras_origen_check")) && /'fabrica'/.test(candado("codigos_barras", "codigos_barras_origen_check")) },
    { clave: "retail.comprobantes.tipo", frase: /ninguno más/i, desmentida: "comprobantes_tipo_check ya admite 'nota_venta'",
      hecho: () => candado("comprobantes", "comprobantes_tipo_check").includes("'nota_venta'") },
    { clave: "retail.comprobantes.estado", frase: /rechazado o anulado —/, desmentida: "comprobantes_estado_check tiene 8 estados (entre ellos 'no_emitido' y 'interna')",
      hecho: () => candado("comprobantes", "comprobantes_estado_check").includes("'no_emitido'") && candado("comprobantes", "comprobantes_estado_check").includes("'interna'") },
    { clave: "retail.conteos.alcance", frase: /'familia' o 'contenedor'|'familia', 'categoria' o 'contenedor'/, desmentida: "conteos_alcance_check solo admite 'todo' y 'categoria'",
      hecho: () => { const c = candado("conteos", "conteos_alcance_check"); return c.includes("'todo'") && c.includes("'categoria'") && !c.includes("'familia'"); } },
    { clave: "retail.conteos.alcance_categoria_id", frase: /hoy nadie la llena/i, desmentida: "conteos_alcance_categoria_coherente la exige cuando el alcance es 'categoria'",
      hecho: () => /alcance = 'categoria'::text\) AND \(alcance_categoria_id IS NOT NULL/.test(candado("conteos", "conteos_alcance_categoria_coherente")) },
    { clave: "retail.movimientos.tipo", frase: /nada más; define el signo/i, desmentida: "movimientos_tipo_check admite además 'apartado' y 'liberacion_apartado'",
      hecho: () => candado("movimientos", "movimientos_tipo_check").includes("'apartado'") },
    { clave: "retail.produccion_lineas.produccion_id", frase: /en cascada/i, desmentida: "la llave foránea a producciones no tiene ON DELETE CASCADE",
      hecho: () => candado("produccion_lineas", "produccion_lineas_produccion_id_fkey").includes("REFERENCES retail.producciones") && !/CASCADE/i.test(candado("produccion_lineas", "produccion_lineas_produccion_id_fkey")) },
    { clave: "retail.producciones.producto_id", frase: /acepta vacío por herencia/i, desmentida: "producciones.producto_id es NOT NULL",
      hecho: () => laColumna("producciones", "producto_id")?.is_nullable === "NO" },
    { clave: "retail.producciones.estado", frase: /el default dice terminado/i, desmentida: "el default es 'en_proceso' y el candado admite 'terminada' y 'anulada'",
      hecho: () => (laColumna("producciones", "estado")?.column_default ?? "").includes("en_proceso") && candado("producciones", "producciones_estado_check").includes("'anulada'") },
    { clave: "retail.productos.estado", frase: /agotada/i, desmentida: "productos_estado_check solo admite 'activo' y 'descontinuado'",
      hecho: () => { const c = candado("productos", "productos_estado_check"); return c.includes("'descontinuado'") && !c.includes("agotad"); } },
    { clave: "retail.productos.id", frase: /su receta de costo/i, desmentida: "bom_items (la receta de costo) ya no existe en retail",
      hecho: () => columnas.bom_items === undefined },
    { clave: "retail.proveedores.id", frase: /lo citan órdenes/i, desmentida: "ordenes_compra ya no existe en retail (hoy son compras)",
      hecho: () => columnas.ordenes_compra === undefined && existe("compras", "proveedor_id") },
    { clave: "retail.proveedores.nombre", frase: /nada impide dos fichas iguales/i, desmentida: "proveedores_nombre_clave_unica es un índice único sobre el nombre",
      hecho: () => unicoPor("proveedores", "proveedores_nombre_clave_unica") },
    { clave: "retail.proveedores.ruc", frase: /nadie lo valida/i, desmentida: "proveedores_ruc_check exige 11 dígitos y proveedores_ruc_unico lo hace único",
      hecho: () => /\[0-9\]\{11\}/.test(candado("proveedores", "proveedores_ruc_check")) && unicoPor("proveedores", "proveedores_ruc_unico") },
    { clave: "retail.series_comprobantes.tipo", frase: /nota_credito o nota_debito —/, desmentida: "series_comprobantes_tipo_check ya admite 'nota_venta'",
      hecho: () => candado("series_comprobantes", "series_comprobantes_tipo_check").includes("'nota_venta'") },
    { clave: "retail.variantes.producto_id", frase: /se van sus variantes/i, desmentida: "la llave foránea a productos no tiene ON DELETE CASCADE",
      hecho: () => candado("variantes", "variantes_producto_id_fkey").includes("REFERENCES retail.productos") && !/CASCADE/i.test(candado("variantes", "variantes_producto_id_fkey")) },
    { clave: "retail.ventas.id", frase: /lo guarda en venta_id/i, desmentida: "movimientos ya no tiene venta_id: apunta a venta_items con venta_item_id",
      hecho: () => !existe("movimientos", "venta_id") && existe("movimientos", "venta_item_id") && existe("venta_items", "venta_id") },
  ];

  it.each(FALSAS_RETIRADAS)("$clave: la frase retirada no vuelve ($desmentida)", ({ clave, frase, hecho }) => {
    expect(hecho(), "el hecho que desmentía la glosa ya no está en el volcado: revisa si la glosa vieja volvió a ser cierta").toBe(true);
    expect(glosario[clave] ?? "").not.toMatch(frase);
  });

  it("cada frase retirada apunta a una columna que existe (si no, la prueba no vigila nada)", () => {
    expect(FALSAS_RETIRADAS.filter(({ clave }) => { const p = partir(clave); return !existe(p.tabla, p.columna); })).toEqual([]);
  });
});

// Lo que dice una glosa VIVA es lo que el diccionario imprime como «Para qué sirve». Las tres reglas de abajo no juzgan si
// el texto es bueno: cierran las tres formas en que un texto escrito a mano deja de ser cierto sin que nadie lo toque.
describe("glosario: una glosa no afirma lo que un cambio de código o de candados deja falso", () => {
  const vivas = Object.entries(glosario).filter(([clave, texto]) => {
    const { tabla, columna: col } = partir(clave);
    return texto && existe(tabla, col);
  });

  // (1) Estado de USO. «Nadie la lee», «ninguna pantalla la muestra», «hoy siempre viene vacío»: es cierto el día que se
  // escribe y falso el día que alguien programa la pantalla. Fue lo que dejó a activos_fijos diciendo «nadie lo lee» con
  // fn_depreciacion_mes leyéndolo. Para qué SIRVE la columna sí va; quién la usa hoy vive en el backlog, no aquí.
  // Tampoco se afirma la AUSENCIA de un candado («sin candado», «la base no lo verifica», «nada impide…»): la siguiente
  // migración lo agrega y la glosa queda contradiciendo la llave foránea que tiene al lado (así pasó con gastos.categoria).
  const ESTADO_DE_USO = /(?<![\p{L}])(nadie|ning[uú]n[oa]?s?|hoy|todav[ií]a|a[uú]n|actualmente|por ahora|de momento|sin consumidor|nada impide|la base (?:no|acepta cualquier)|sin candado|siempre (?:viene|queda)|en la pr[aá]ctica|solo la llena|solo lo llena)(?![\p{L}])/iu;

  it("ninguna glosa dice quién usa, llena o muestra la columna hoy, ni afirma que un candado no existe", () => {
    expect(vivas.filter(([, texto]) => ESTADO_DE_USO.test(texto)).map(([clave, texto]) => `${clave}: ${texto}`)).toEqual([]);
  });

  // (2) Valores. «'cayla', 'proveedor' u 'otro'» siguió impreso cuando el candado pasó a 'propio' y 'fabrica'. Todo valor entre
  // comillas simples tiene que aparecer en un candado, un índice único o el valor por defecto de ESA tabla. Los ejemplos
  // libres («Remalladora Siruba») van entre comillas angulares.
  it("todo valor entre comillas simples existe en un candado de esa tabla", () => {
    const mal: string[] = [];
    for (const [clave, texto] of vivas) {
      const { tabla } = partir(clave);
      const definiciones = [
        ...restricciones.filter((c) => c.tabla === `retail.${tabla}`).map((c) => c.definicion),
        ...indicesUnicos.filter((i) => i.tablename === tabla).map((i) => i.indexdef),
        ...(columnas[tabla] ?? []).map((c) => c.column_default ?? ""),
      ].join("\n");
      for (const [, valor] of texto.matchAll(/'([^']+)'/g)) {
        if (!definiciones.includes(`'${valor}'`)) mal.push(`${clave}: '${valor}' no está en ningún candado de ${tabla}`);
      }
    }
    expect(mal).toEqual([]);
  });

  // (3) Referencias. «lo cita conteo_lineas.movimiento_id» siguió impreso con conteo_lineas ya fuera de retail, y «se copia a
  // stock.ultima_*» con esas columnas ya retiradas. Toda `tabla.columna` de una glosa tiene que existir hoy.
  it("toda referencia tabla.columna apunta a una columna que existe", () => {
    const yaNoExisten = new Set(Object.keys(glosario).map((k) => partir(k).tabla).filter((t) => !columnas[t]));
    const mal: string[] = [];
    for (const [clave, texto] of vivas) {
      for (const [, tabla, col] of texto.matchAll(/(?<![\p{L}\d_.])([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)/gu)) {
        if (yaNoExisten.has(tabla)) mal.push(`${clave}: cita ${tabla}.${col} y la tabla ya no existe en retail`);
        else if (columnas[tabla] && !existe(tabla, col)) mal.push(`${clave}: cita ${tabla}.${col} y esa columna no existe`);
      }
    }
    expect(mal).toEqual([]);
  });

  // (4) Regenerado. Editar glosario.json y olvidar `pnpm datos:generar:produccion` deja el diccionario imprimiendo la
  // glosa vieja: las tres reglas de arriba leerían la buena y el lector, la mala.
  it("el diccionario imprime cada glosa viva tal como está escrita: si no, falta regenerar", () => {
    const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
    const sinImprimir: string[] = [];
    for (const [clave, texto] of vivas) {
      const { tabla, columna: col } = partir(clave);
      const fila = (FICHAS.get(tabla) ?? "").split("\n").find((l) => l.startsWith(`| \`${col}\``));
      if (!fila?.endsWith(`| ${esc(texto)} |`)) sinImprimir.push(clave);
    }
    expect(sinImprimir, "corre pnpm datos:generar:produccion").toEqual([]);
  });

  it("las tres reglas miran algo: hay glosas vivas, con comillas y con referencias que revisar", () => {
    expect(vivas.length).toBeGreaterThan(100);
    expect(vivas.some(([, t]) => /'[^']+'/.test(t))).toBe(true);
    expect(vivas.some(([, t]) => /(?<![\p{L}\d_.])[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*/u.test(t))).toBe(true);
  });
});
