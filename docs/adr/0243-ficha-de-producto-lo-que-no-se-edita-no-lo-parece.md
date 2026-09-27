# ADR-0243 · Ficha de producto: lo que no se edita no lo parece, y el costo se corrige a mano solo hasta la primera compra

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe. «Vamos en orden» cubre los puntos 1a y 1c de la revisión de
  Productos. En el costo eligió «Hasta la primera compra», entre tres opciones.
- **Producción:** falta pegar `20260927190000_costo_se_corrige_hasta_la_primera_compra.sql`. Va **ANTES** de fusionar:
  la web nueva con la base vieja muestra todos los costos de solo lectura.
- **Nace de:** la revisión de Productos del 2026-09-26, hecha con capturas de producción (Blusa V, CMS-0005).
- **Complementa:**
  - ADR-0067 (costo promedio ponderado).
  - ADR-0183 (el costo solo lo ve quien ve el dinero).
  - ADR-0193 (edición simultánea con versión).

## Problema

1. **La ficha dejaba cambiar color, talla y SKU de una variante que ya existe, y el cambio se perdía.**
   - `catalogo_actualizar_producto` solo actualiza precio, costo y «activa» en las variantes existentes, y el guardado
     decía «guardado».
   - El encabezado de `ProductoForm.tsx` ya decía que así debía ser; la pantalla nunca lo aplicó.
2. **El costo oficial se podía pisar.** `variantes.costo` es el promedio ponderado de las compras y del Taller, y dos
   caminos lo escribían por fuera de ese cálculo:
   - La ficha: con el campo vacío guardaba **0**, y el margen decía 100 %.
   - El update directo de un líder por la API.
   - `20260919141804` ya lo medía («Esta función NO lo cierra — eso exige decidir cómo se corrige un costo mal cargado»).
3. **Corregir un costo de la carga inicial dejaba la prenda «alterada» para siempre.** Con una sola prenda así, Resumen
   deja de mostrar el «Capital en inventario». Justo en la carga inicial, que es cuando más se corrige.

## Decisiones

### D-133 · Color, talla y código de una variante existente son de solo lectura

```
DECIDÍ: en la ficha, una variante que ya existe muestra su color, su talla y su CÓDIGO (el que lee la pistola:
        CMS-0005-CEL-L) como texto, no como campos. Si está mal, se desactiva y se agrega la correcta: la pantalla lo
        dice. Las filas nuevas siguen igual.
DESCARTÉ: dejar que la base acepte el cambio. Una variante puede tener stock, ventas y etiquetas impresas con ese
        código; cambiarle la talla reescribe la historia de todo eso.
SE ROMPE SI: alguien necesita de verdad corregir la talla de una variante sin movimientos. Hoy se hace igual:
        desactivar y agregar.
```

### D-134 · El costo se corrige a mano solo hasta la primera compra

```
DECIDÍ: mientras la prenda nunca entró por Compras ni por el Taller (no tiene filas en `costo_historial`), su costo es
        DECLARADO y se corrige desde la ficha. Desde su primera entrada con costo, es el promedio ponderado y no se toca a
        mano. La base lo exige con un disparador en `variantes` que aplica a las sesiones de la API; las funciones
        SECURITY DEFINER, que son el camino oficial, pasan. Un campo de costo vacío conserva el costo que había.
DESCARTÉ: (a) «nunca a mano»: un costo mal declarado en la carga inicial no se podría corregir desde ninguna pantalla;
        (b) «siempre, con aviso»: el costo oficial se seguiría pudiendo pisar.
SE ROMPE SI: una compra entró con un costo equivocado. Eso no se corrige a mano en la ficha. Se corrige en su origen
        (nota de crédito, o anular y volver a registrar), y así la corrección queda en `costo_historial`, como todo
        lo demás.
```

### D-135 · Corregir un costo declarado no es «alterarlo»

```
DECIDÍ: `fn_registrar_cambio_producto` anota la corrección de un costo sin compras con campo 'costo_declarado'. Resumen
        (`fn_resumen_variantes`, `fn_resumen_comparacion`) solo lee 'costo' para decir «alterado», así que la prenda sigue
        «declarado». No se reescribieron esas dos funciones.
DESCARTÉ: cambiar la regla dentro de las dos funciones de Resumen: son las más largas del esquema y producción puede
        tener otro cuerpo.
SE ROMPE SI: alguien lee el historial buscando solo 'costo'. Las correcciones de antes de esta decisión siguen como
        'costo' (el historial no se reescribe) y esas prendas siguen «alteradas» hasta su primera compra. La migración
        trae la consulta para contarlas.
```

## Verificación

- **`pruebas:costo-hasta-primera-compra`:** 15/15 en una base aislada, construida desde cero con todas las migraciones.
  - Dos controles: sin el disparador, el hueco existía; y una corrección anotada como 'costo' deja la prenda «alterada».
  - Cubre el camino de la ficha, el update directo, la recepción (SECURITY DEFINER) y Resumen.
- **`fn_resumen_variantes`:**
  - F4 pasa a «declarado», que es la decisión de hoy.
  - F4b conserva «alterado» para una corrección anotada antes: 39/39.
- **Pruebas de compras, producción, recepciones y la ficha que siguen en verde:** 20 pruebas, en la misma base.
- **Ficha en el navegador, contra esa base:**
  - Las variantes con compras muestran el costo como texto.
  - Las que no tienen compras lo dejan corregir; se guardó 30 → 28, anotado como 'costo_declarado'.
  - Los costos oficiales no se tocaron.
