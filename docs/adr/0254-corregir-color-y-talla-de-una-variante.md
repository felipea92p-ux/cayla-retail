# ADR-0254 · Corregir el color y la talla de una variante que ya existe (y editar variantes como matriz)

- **Fecha:** 2026-09-28 · **Estado:** aprobado por Felipe (tres preguntas, 2026-09-28), en construcción.
- **Pedido:** Felipe, 2026-09-28, con captura de BOD-0003 «Body Amir»: «una vez creado el producto la edición es muy
  limitada, no me deja editar color y demás variantes de una forma adecuada o mejor de lo que haría Shopify».
- **Migración:** `20260928233000_corregir_color_y_talla_de_variantes.sql` (sin pegar en producción).
- **Reemplaza:** ADR-0243 D-133 («color, talla y código de una variante existente son de solo lectura»).
- **Actualiza:** ADR-0025, invariante 1 (el código «nunca se recalcula, ni al corregir el color»).
- **Complementa:** ADR-0069 (identidad de la variante), ADR-0193 (edición simultánea), ADR-0212 (alta con stock),
  ADR-0218 (qué es «historia»), ADR-0246 (temporada por color), ADR-0228 (fotos).

## Problema

1. **BOD-0003 nació «Sin color» y no hay forma de ponerle el color.** D-133 dice «si está mal, desactívala y agrega la
   correcta», pero sus 3 variantes ya tienen su carga inicial (8/5/4 = 17 u. en TRU, ADR-0212). La receta obliga a:
   desactivar 3, crear 3, ajustar −17 y cargar +17 que nunca pasaron (y ajustar es solo del líder, ADR-0250), volver a
   poner la etiqueta «Nuevo», y reimprimir 17 etiquetas: las pegadas apuntan a la variante desactivada y en Vender salen
   «no encontrada». El «SE ROMPE SI» de D-133 era justo este caso.
2. **Agregar un color a S/M/L es escribir 3 filas a mano**, cada una con color, talla, SKU y precio. El alta arma la
   tabla talla × color en un clic: las dos pantallas resuelven lo mismo de dos formas (falla de integridad conceptual).
3. **La base no protege nada de esto.** D-133 es un candado de pantalla: por la API, cualquier cuenta que edita el
   catálogo cambia color, talla o código sin dejar rastro («hueco 3»). Y el candado de identidad dejó de tratar «Sin
   color» como un color el 17-sep (el índice `nulls not distinct` de ADR-0069 se fue con la columna `talla`).

Hechos que lo hacen seguro (medidos el 2026-09-28): las 19 tablas que citan una variante lo hacen por su id; SUNAT
declara `referencia · sku`, sin color ni talla; la pistola resuelve por `codigos_barras`. Corregir en su lugar no mueve
ni una unidad ni un sol: cambia cómo se LEE la historia de esa prenda, que es justo lo que se quiere cuando se registró
mal.

## Decisiones de Felipe (2026-09-28)

### D-136 · Se corrige siempre; si la variante ya se vendió, solo un líder

```
DECIDÍ: el color y la talla de una variante que ya existe se corrigen desde su ficha, en el mismo «Guardar cambios».
        Es la misma prenda física mal registrada: conserva su id, su stock, su historia y sus etiquetas. Si ya se vendió
        o una clienta la apartó, solo un líder la corrige (el permiso se le pregunta a la cuenta, no al responsable).
        Todo cambio queda en el historial de la prenda, con quién lo hizo.
DESCARTÉ: (a) «solo si nunca se vendió»: un error que se descubre tras la primera venta seguiría costando desactivar,
        agregar y ajustar stock a mano; (b) «siempre, cualquiera»: sin freno sobre variantes ya vendidas.
SE ROMPE SI: alguien «recicla» una variante vendida para OTRO producto (vendió 20 Negro S; llega Azul y le cambia el
        color en vez de agregarla). El análisis diría que se vendieron 20 Azul. El freno es humano (solo líder, y la
        pantalla separa «Corregir» de «Agregar color»), y el rastro queda en el historial.
```

### D-137 · Al corregir, el código se recalcula y el viejo sigue sonando

```
DECIDÍ: al corregir el color o la talla, la variante recibe el código de su identidad nueva (BOD-0003-S →
        BOD-0003-NEG-S) y el código anterior se queda en `codigos_barras` apuntando a la MISMA variante: toda etiqueta ya
        pegada sigue sonando en Vender, Conteo, Cambios y Traslados; las nuevas salen con el código correcto. Si el código
        nuevo ya lo tiene otra variante, se le agrega -2, -3… (lo mismo al crear una variante cuyo código ya existe).
DESCARTÉ: dejar el código igual para siempre (ADR-0025 tal cual): tras Negro→Azul la etiqueta nueva diría «…-NEG-S»
        con «Azul» al lado, y crear después una Negro S real chocaría igual con ese código.
SE ROMPE SI: se corrige Negro→Azul y después se crea una Negro S de verdad: nace BOD-0003-NEG-S-2, porque BOD-0003-NEG-S
        sigue siendo el código viejo (pegado en percha) de la que ahora es Azul.
```

### D-138 · Si la corrección cae sobre una variante que ya existe, se bloquea (unir, después)

```
DECIDÍ: corregir «Sin color S» a «Negro S» cuando Negro S ya existe (activa o no) se rechaza con un aviso que nombra la
        variante que ya está y qué hacer. No se unen variantes en esta entrega.
DESCARTÉ: unir las dos ahora (pasar el stock con un movimiento nuevo y redirigir los códigos): toca el motor de stock y
        hoy hay 0 casos reales (solo una prenda de prueba).
SE ROMPE SI: aparece un duplicado real con stock en las dos: hasta la fase «Unir variantes», se desactiva una y se ajusta
        su stock como hoy.
```

## Decisiones técnicas

_Se completan al cerrar la construcción (candado de identidad en la tabla, índice `nulls not distinct`, corrección dentro
de `catalogo_actualizar_producto`, fotos y temporada que siguen al color, edición como matriz)._
