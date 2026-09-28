# ADR-0258 · Color y talla de una variante se corrigen mientras no tenga historia

- **Fecha:** 2026-09-28 · **Estado:** Aprobado por Felipe («sí, permitirlo en variantes sin stock ni ventas»; confirmó
  el alcance —qué variantes, quién y qué campos— y que lo demás es cómo funciona eso).
- **Producción:** falta pegar `20260928235500_corregir_talla_color_de_variante_sin_historia.sql`. Va **ANTES** de
  fusionar la web (ver «Orden»).
- **Nace de:** la pregunta de Felipe «cuando se intenta editar un producto no se puede editar las tallas y/o colores
  existentes, ¿por qué?».
- **Actualiza:**
  - ADR-0243 D-133: su «SE ROMPE SI» («alguien necesita de verdad corregir la talla de una variante sin movimientos»)
    es justo este caso, y ahora tiene salida.
  - ADR-0025, invariante 1 («`codigo` nunca se recalcula»): sigue valiendo para toda variante con historia. Sin
    historia no hay etiqueta pegada ni nada que haya leído ese código, así que se recalcula.
- **Choca con:** la rama `claude/product-variant-editing-9307ed`, que reservó un «ADR-0254» con las decisiones D-136 a
  D-138 («se corrige siempre; si ya se vendió, solo un líder»; «el código viejo sigue sonando»). Esa rama no pasó del
  ADR (sin migración ni PR al 2026-09-28) y su número ya lo ocupa otro ADR en main. Felipe eligió la regla de este ADR.
  Esa rama no debe escribir su migración encima sin volver a preguntarle.

## Problema

1. **Un error de tipeo al crear una prenda no se podía corregir.** Por ejemplo, se creó la M donde iba la L y alguien
   se dio cuenta antes de recibirla. La ficha mostraba color y talla fijos (D-133), y la única salida era desactivar
   la fila y agregar otra. En producción, 86 de las 207 variantes no tienen ni un movimiento (2026-09-28).
2. **La regla vivía solo en la pantalla y en la RPC (hueco 3).** La política `variantes_write_lider` deja a quien edita
   catálogo hacer `update variantes set talla_id = …` por la API, aunque la variante tenga ventas.

## Decisiones

### D-139 · Color y talla se corrigen solo en una variante sin historia

```
DECIDÍ: en la ficha, una variante que ya existe y NO tiene historia (ningún movimiento, stock, venta, compra, traslado,
        apartado, conteo, producción ni cambio) muestra sus combos de color y talla, igual que una fila nueva. Al
        guardar, la base los cambia. Lo hace quien ya puede editar el catálogo. El SKU no se toca. Si tiene historia,
        sigue fija como en D-133.
DESCARTÉ: (a) dejar todo fijo (D-133 tal cual): un error de tipeo recién creado costaba desactivar y agregar;
        (b) corregir siempre, y solo un líder si ya se vendió (la rama de ADR-0254 reservado): Felipe eligió la
        regla estrecha.
SE ROMPE SI: la variante ya recibió stock y recién ahí se nota el error (el Body Amir sin color, con carga inicial).
        Sigue la receta de D-133: desactivar, agregar la correcta y ajustar el stock.
```

### D-140 · El código se recalcula y el viejo deja de leerse

```
DECIDÍ: al corregir, `codigo` se recalcula con el mismo formato que al crear (base-color-talla, `fn_asignar_codigo_variante`)
        y su fila en `codigos_barras` se RENOMBRA (no se borra ninguna). El código viejo ya no lee esa variante. Si la
        etiqueta ya se imprimió, la pantalla pide reimprimirla.
DESCARTÉ: dejar el código viejo apuntando a la variante. Una etiqueta «…-M» leería una variante que ahora es L.
SE ROMPE SI: alguien imprimió y pegó la etiqueta de una variante que nunca entró a una sede, y después la corrigió.
        Esa etiqueta ya no suena. No hay registro de impresiones que lo avise.
```

## Decisiones técnicas

- **Qué es «historia».** Es cualquier fila en una tabla que apunte a la variante con llave foránea, salvo
  `codigos_barras` y `variante_etiquetas`, que son parte de la ficha. La lista de tablas se lee de `pg_constraint` en
  cada llamada, así que una tabla nueva que cite variantes cuenta sola. Es por variante, no por producto:
  `fn_producto_historia` (ADR-0252) es por producto, está escrita a mano y separa lo borrable. Las dos coinciden en lo
  que cuentan a nivel de variante; no se unificaron.
  - `fn_variantes_con_historia(uuid[])` es SECURITY DEFINER, porque las tablas de operación tienen RLS por sede. Solo
    responde sí o no por variante.
- **Candado en la tabla.** El disparador `variantes_identidad_sin_historia` (BEFORE UPDATE OF color_codigo, talla_id,
  codigo) rechaza el cambio a una sesión de la API sobre una variante con historia (hint `variante_con_historia`).
  Cierra el hueco 3. Las funciones SECURITY DEFINER corren como su dueño y pasan, igual que en
  `fn_costo_hasta_la_primera_compra`.
- **La corrección.** `fn_corregir_identidad_variante` es SECURITY INVOKER, así que escribe con la RLS de quien edita.
  `catalogo_actualizar_producto` la llama por cada variante existente, con un parche por ancla sobre la definición viva.
  Toma la fila `for update`: una venta que entra a la vez espera, y la pregunta «¿tiene historia?» ve lo que esa venta
  dejó.
- **Historial.** `fn_registrar_cambio_producto`, parchada por ancla, anota `color_codigo`, `talla_id` y `codigo`.
- **Combinación repetida.** Si se corrige hacia una variante que ya existe, choca con
  `variantes_producto_talla_color_unico` y la web lo traduce con el aviso de siempre.
- **Web.** `getProducto` pregunta `fn_variantes_con_historia`. Si la función no existe (SQL sin pegar), `conHistoria`
  queda en null y la ficha muestra todo fijo, como antes. Al cambiar color o talla, la columna Código muestra el
  código que dará la base (`codigoVariantePrevisto`).

## Orden

Primero la migración, después la web:
- La web vieja con la base nueva funciona igual: manda el color y la talla que leyó, y no cambia nada.
- La web nueva con la base vieja no sabe qué variantes no tienen historia y las muestra todas fijas.

La migración va en UNA parte: sin políticas ni `drop trigger`, porque usa `create or replace trigger` (CLAUDE.md,
«Políticas y deadlocks»).

## Cómo se verifica

- `pnpm pruebas:corregir-identidad-variante` (en CI): 11 casos, cada uno con ROLLBACK. Incluye el CONTROL: sin el
  disparador, el update directo sí pasaba.
- Después de pegar en producción, abrir una prenda con una variante recién creada (sin stock). Sus combos de color y
  talla se pueden cambiar, y al guardar el código cambia. Una variante con stock sigue fija.

## Actualización 2026-09-28 (noche): superado por ADR-0263

Felipe eligió la regla de ADR-0263 («Integrar sobre main»): el color y la talla se corrigen SIEMPRE (si la variante ya
se vendió, solo un líder) y el código viejo SIGUE sonando en `codigos_barras`. D-139 y D-140 quedan superadas por D-136,
D-137 y D-138. La migración de este ADR (`20260928235500`) se queda en `main` y en producción; la de ADR-0263
(`20260929045000`) se construye encima: renombra el disparador `variantes_identidad_sin_historia` a
`variantes_identidad_solo_por_funcion` con la regla nueva, conserva la firma de `fn_corregir_identidad_variante` (ahora
SECURITY DEFINER), reemplaza el bloque del historial y borra `fn_variantes_con_historia` y
`fn_identidad_variante_sin_historia`. `pnpm pruebas:corregir-identidad-variante` se retiró (lo que seguía valiendo lo cubre
`pnpm pruebas:corregir-variantes`). `20260928235500` no se vuelve a pegar después de `20260929045000`: devolvería el
candado «solo sin historia».
