# ADR-0372 — Plan de campaña: barra de rango, paso a paso, aviso de stock y exportar (entrega 1, solo web)

- Fecha: 2026-10-10
- Estado: aceptado y construido. Entrega 1 (solo web) y entrega 2: B1 y B2 **en producción desde el 2026-10-10** (OK de Felipe); B3 construida y probada en local, **sin pegar en producción** (espera su OK).
- Continúa a [ADR-0349](0349-plan-de-campana.md). Maqueta aprobada: `docs/maquetas/plan-de-campana-2026-10/` (con su `PROMPT.md`).
- Sin migración: todo sale de lo que `fn_plan_compra` y `fn_motor_demanda_preparacion` ya devuelven, más la tabla `familias`.

## Problema

La pantalla de ADR-0349 era correcta pero no decía por dónde empezar: 42 filas «Sin plan», cifras en cero, y «Empieza por las que más
venden» sobre una tabla que se ordenaba por stock. Quien llenaba los tres escenarios no veía contra qué (cuánto había vendido), no había
cómo llevar la lista al proveedor, y nada avisaba que **«comprar = lo que conviene tener − lo que hay hoy»** sale inflado si el «hay hoy»
está incompleto (a 2026-10-05 AQP tenía 13 unidades y LIM 1). Es el caso «algoritmo sobre stock falso» que ADR-0349 ya nombraba como
trampa, sin que la pantalla lo mostrara.

## Qué se construyó

1. **`BarraRango`** por categoría: verde = ya hay, negro = comprar (sobre la `BarraApilada` del sistema), banda del flojo al bueno y marca
   en el normal; en la campaña, un rombo con lo vendido. Reemplaza «flojo · normal · bueno» en texto, que sigue debajo en números.
2. **Las que más venden primero**: la lista nace ordenada por ventas de 90 días (`vendidoPorTalla` sumado), con puesto 1 a 10. Buscador,
   píldoras (sin plan, con plan, las que más venden, se agotaron), familia y orden; sin plan, stock ni ventas se pliegan en una línea.
3. **Cifras**: la primera filtra; la cuarta dice cuántas de las que más venden faltan (y lleva al paso a paso) o, en la campaña, lo vendido.
   Bajo la frase, el momento: «Faltan 52 días», «Día 15 de 31», «Terminó hace 8 días».
4. **Hoja de una categoría**: referencia («Vendiste N en 90 días, hay N en la red»), «Proponer el normal desde lo vendido», resultado con su
   barra y **«Guardar y seguir con …»**, que pasa a la que más vende y no tiene plan sin cerrar la hoja.
5. **Paso a paso** (`Tabla | Paso a paso`): una categoría a la vez, con avance, «Saltar por ahora» (va al final, no se pierde) y cierre.
6. **Aviso de stock**: por tienda, si el piso se cuadró y el almacén se contó (la lectura del motor, ADR-0346). Incompleto → nombra las
   tiendas y lleva a Conteo; no se pudo leer → «No se pudo verificar» (nunca «confiable» por omisión).
7. **Exportar**: lista de compra por categoría y talla, con total; CSV (el `descargarCsv` de Existencias) o papel (`#lista-compra-print`).

## Decisiones

**DECIDÍ** un solo `FormularioCategoria` para la hoja y el paso a paso, con el pie como parámetro.
**DESCARTÉ** copiar el formulario al paso a paso: la guía de foco, la validación y la cuenta en vivo son el mismo contrato (`camposDelPlan`
↔ `problemasDelBorrador` ↔ la base) y dos copias se separan en cuanto alguien toca una.
**SE ROMPE SI** el paso a paso necesita campos que la hoja no tiene (hoy no).

**DECIDÍ** que «Proponer» rellene **solo el escenario normal**: un diciembre normal = 3 meses normales (R-19), y un mes normal = ventas
de 90 días ÷ 3, o sea lo vendido en esos 90 días.
**DESCARTÉ** el ×2 del flojo y el ×4,5 del bueno que traía la maqueta: no tienen un dato detrás y alguien los tomaría como regla.
**SE ROMPE SI** la categoría es de temporada y esos 90 días (hoy, julio a setiembre) no dicen nada de diciembre: una chompa vende en
invierno, no en la gratificación. La propuesta es un punto de partida que la persona corrige; por eso nunca llena los tres a la vez.

**DECIDÍ** medir la confianza del stock con dos condiciones del motor (piso cuadrado y almacén contado) y no con la tercera (venta
identificada). **DESCARTÉ** usar `puedeHablar`: mide si las ventas dicen qué prenda fue, que es otro problema y llegaría tarde para diciembre.
**SE ROMPE SI** el stock que falta está en el Taller: el «Hay hoy» lo cuenta y el motor solo mira tiendas. Queda dicho en el código.

**DECIDÍ** que «Exportar» solo aparezca cuando hay al menos una categoría con plan (quitar antes de agregar). **DESCARTÉ** un botón
apagado sin motivo a la vista.

## Lo que se apartó de la maqueta, a propósito

- La cifra «Categorías con plan» no lleva barra de avance: la `TarjetaCifra` solo trae el relleno en rojo o ámbar (urgencia), y el avance es
  verde. El avance vive en el paso a paso.
- El «Hay hoy» por sede, el precio y el costo del catálogo, «vendiste N en 30 días», el tope de inversión, el selector de campañas y «Finanzas
  dice…» **no están**: piden migración (o tocan dos módulos) y esperan el OK de Felipe (`PROMPT.md`, entrega 2).

## Cómo se verificó

- `plan-compra-reglas.test.ts`: 84 pruebas (45 de la cuenta de ADR-0349, intactas; el resto, de lo nuevo). Suite completa: 395 archivos en verde.
- Navegador local, con datos del seed: la tabla, filtros y buscador; la hoja (proponer, guardar y seguir); el paso a paso completo con una
  saltada hasta el cierre; el aviso con Lima y Trujillo sin cuadrar; «Durante»; la lista, el CSV real (BOM, total 443 y S/ 12,508.00) y la hoja
  impresa (simulando `@media print`). Modo oscuro con contraste medido (5,2:1 a 15:1).
- **No se hizo**: `tema:auditar` (a Playwright le falta descargar su navegador), abrir el CSV en Excel, `/formidable` ni `/chaos`.
- Aprendido: Turbopack no recogió un `@import` nuevo en `globals.css` hasta borrar `apps/web/.next`.

## Actualización 2026-10-10 — entrega 2 (migraciones B1, B2 y B3)

Migraciones `20261010190000` (B1), `20261010191000` (B2) y `20261010192000` (B3); `pnpm pruebas:plan-compra`: 16 casos (de 6).

- **B1, lectura ampliada.** `fn_plan_compra` SUMA `catalogo` (precio y costo promedio, solo activos y sin pruebas; un 0 es «sin dato»), `stock_sedes` y
  `vendido_30`. No cambia ninguna clave de antes. La hoja precarga el precio y el costo («Del catálogo · revísalo»), dice dónde está el stock y cuánto se
  vendió en 30 días. **En producción** (versión registrada `20261010174829`, huella de la función `9315c4b2…`, igual a local).
- **B2, tope de inversión.** `planes_compra.tope_inversion` con autor y hora (CHECK: positivo, y nunca sin autor), `guardar_plan_compra_tope` (módulo **y**
  líder; firma con el responsable; NULL lo quita) y `plan.tope_inversion` en la lectura. El tope **avisa, no bloquea**. La cifra de Inversión lleva su
  barra (`BarraApilada total=`, top 5 + «Otras») y «Poner / Editar el tope» (solo líder). **En producción** (`20261010175004`, huellas `73df8d9b…` de
  `fn_plan_compra` y `e16562ef…` de `guardar_plan_compra_tope`, iguales a local). Antes se ensayó en transacción con rollback.
- **B3, varias campañas.** Felipe eligió que la campaña nazca de una etiqueta (Catálogo ▸ Etiquetas) y que el selector pase entre las existentes.
  **DECIDÍ** `planes_compra.etiqueta_id` (única por etiqueta) + `crear_plan_compra(etiqueta, nombre, desde, hasta)` (módulo y líder) + `fn_planes_compra()` para el selector.
  **DESCARTÉ** la fecha única literal: «Navidad» en Etiquetas es del 11 al 25 de diciembre (campaña de venta con descuento) y «Diciembre 2026» es del 1 al 31
  (ventana de compra, a propósito: diciembre triplica un mes entero); atarla a la etiqueta movería el plan ya sembrado. El plan arranca con las fechas de la
  etiqueta y se pueden ajustar; si difieren, la hoja lo dice. «Diciembre 2026» queda sin etiqueta.
  **DESCARTÉ** copiar precios y costos de otra campaña (lo que traía la maqueta): una línea exige sus tres escenarios (CHECK), no se guarda a medias; el
  catálogo (B1) ya lo resuelve.
  **SE ROMPE SI** alguien crea en Etiquetas una campaña con las mismas fechas de otra y espera dos planes: el índice único es por etiqueta, no por fechas.
- **Fuera:** «Finanzas dice…» (toca dos módulos).
- **Verificado:** SQL 16/16; 102 pruebas de reglas y suite completa; navegador local: tope (poner, quitar, firma en la base), hoja con stock por sede y
  ventas de 30 días, crear «Navidad 2026» desde su etiqueta y volver con el selector. La precarga del catálogo se probó con pruebas unitarias y SQL (en la base
  local las únicas categorías con catálogo ya tenían plan de otra persona).
