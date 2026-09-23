# ADR-0183 — El costo de una prenda solo lo ve quien ve el dinero, y lo cierra la base

- **Fecha:** 2026-09-23
- **Estado:** aceptado (Felipe: opción C «cerrarlo en la base» + regla A «líder o permiso de dinero de compras»)
- **Migración:** `20260923193700_costo_solo_con_permiso_de_dinero.sql`
- **Relacionados:** ADR-0126 (el dinero de compras es de quien tiene ese permiso), ADR-0161 P5 (Existencias esconde el
  costo a quien no es líder), ADR-0181 (el catálogo compartido entre visitas)

## Problema

`variantes.costo` se podía leer con **cualquier** sesión: `authenticated` tenía `SELECT` sobre la tabla entera. En pantalla
casi no se veía, pero Conteo mandaba al navegador el costo de las 1.295 prendas a quien contara, y cualquiera con su sesión
podía pedirle a la base el costo —y con el precio, el margen— de todo el catálogo. Cuatro funciones con permisos propios
lo devolvían sin preguntar: `fn_productos` (Productos), `fn_resumen_comparacion` (Análisis), `fn_costo_historial` y
`censo_crear_variante`. La regla de negocio ya decidida (ADR-0126, P5) decía otra cosa; la base no la cumplía.

## Decisión

**Regla:** ve el costo quien pasa `retail.fn_puede_ver_dinero_de_compras()` — el líder, o un rol con Facturas de compra,
Por pagar o Notas de crédito. La misma regla que los montos de Compras: una sola definición de «dinero» en el ERP.

**Cómo lo cumple la base:**

1. **La columna se cierra:** `authenticated` lee todas las columnas de `variantes` menos `costo` (grant por columna).
2. **Una sola puerta para leerlo:** `fn_costos_variantes_json(p_ids)` → `{variante_id: costo}`, o `null` sin permiso.
   La web la usa en Conteo, Compras ▸ Nueva, la ficha y el alta de producto, y Atributos ▸ Etiquetas
   (`getCostosVariantes()` en `apps/web/lib/catalogo-v2.ts`).
3. **Las funciones que lo devolvían** lo mandan vacío (`null`) a quien no tiene el permiso. Nunca un 0: un 0 parece un dato.
4. **Las dos funciones INVOKER que lo leían** se adaptan: `fn_conteos_resumen` valoriza con
   `fn_soles_diferencia_conteo` (revisa el permiso una vez por conteo, no fila por fila), y `catalogo_actualizar_producto`
   no toca el costo cuando guarda alguien que no lo ve (antes lo habría pisado con 0).
5. Las funciones que usan el costo por dentro (registrar la venta, recepciones, producción, Existencias) ya eran
   SECURITY DEFINER: no cambian.

## Consecuencias

- **Quien cuenta sin permiso de dinero** revisa el cierre y el detalle en unidades; los soles salen «—».
- **Quien edita el catálogo sin permiso de dinero** no ve el campo costo; las variantes nuevas que cree quedan «sin
  costo» (0) hasta que alguien con permiso lo cargue.
- **Análisis sin permiso de dinero:** costo de ventas, rotación y márgenes «N/D»; unidades, ritmo y cobertura siguen.
- **El catálogo compartido entre visitas (ADR-0181) ya no lleva el costo:** se pide aparte y solo donde se usa. La copia
  sigue siendo segura de compartir.
- ⚠ **Una columna nueva en `variantes` no se lee hasta agregarla al `grant select (...)`**: ya no hay grant de tabla entera.
- ⚠ Si Dynamic leyera `retail.variantes.costo` con una sesión de usuario, dejaría de poder hacerlo. En la base no hay
  nada suyo que lo lea (verificado el 2026-09-23); su código no se pudo revisar desde este repo.

## Verificación (ensayo en producción con BEGIN/ROLLBACK, 2026-09-23)

| Prueba | Líder | Colaboradora | Terminal |
|---|---|---|---|
| Leer `costo` directo | denegado | denegado | denegado |
| Leer el resto de `variantes` | 1.296 | 1.296 | 1.296 |
| Puerta de costos | 1.296 costos | ninguno | ninguno |
| `fn_productos` con costo | 552 | 0 | 0 |
| Análisis con costo | 1.150 | 0 | 0 |
| Soles de un conteo real | 0,00 (dato) | null | null |

El líder lee su costo por la puerta, no directo: la web ya no pide `costo` a la tabla en ningún lado.
