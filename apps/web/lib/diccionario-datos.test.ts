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

const DIR = new URL("../../../docs/datos/generado/", import.meta.url);
const leer = (archivo: string) => readFileSync(new URL(archivo, DIR), "utf8");
const json = <T>(archivo: string) => JSON.parse(leer(archivo)) as T;

type Rls = Record<string, { relkind: string; rls: boolean; forzado: boolean }>;
type Columnas = Record<string, { column_name: string }[]>;
type Restriccion = { conname: string; definicion: string; tabla: string };
type Politica = { tablename: string };

const rls = json<Rls>("retail_rls.json");
const columnas = json<Columnas>("retail_columnas.json");
const restricciones = json<Restriccion[]>("retail_constraints.json");
const politicas = json<Politica[]>("retail_policies.json");
const glosario = json<Record<string, string>>("glosario.json");
const firmas = leer("funciones-produccion.txt").split("\n").filter(Boolean);
const DICCIONARIO = leer("DICCIONARIO-RETAIL.md");

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

describe("glosario: toda glosa apunta a una columna que existe", () => {
  const existe = (tabla: string, columna: string) => columnas[tabla]?.some((c) => c.column_name === columna) ?? false;
  const partir = (clave: string) => {
    const [, tabla = "", ...resto] = clave.split(".");
    return { tabla, columna: resto.join(".") };
  };
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
  ];

  it.each(FALSAS_RETIRADAS)("$clave: la frase retirada no vuelve ($desmentida)", ({ clave, frase, hecho }) => {
    expect(hecho(), "el hecho que desmentía la glosa ya no está en el volcado: revisa si la glosa vieja volvió a ser cierta").toBe(true);
    expect(glosario[clave] ?? "").not.toMatch(frase);
  });
});
