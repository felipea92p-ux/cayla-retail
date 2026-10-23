# Maqueta · El stock se carga en Existencias (2026-10-23)

**Estado: propuesta para que Felipe elija mirando. Nada construido todavía.** Abrir `index.html` con doble clic.

## El pedido

Felipe, 2026-10-23: las colaboradoras ingresan el stock desde Catálogo ▸ Productos y él quiere que lo hagan desde Existencias,
con Catálogo obsoleto para eso. Saben que se puede desde los dos lados, pero Catálogo les resulta más cómodo.

## Por qué prefieren Catálogo (leído en el código, no medido en producción)

| | Catálogo ▸ Editar producto | Existencias |
|---|---|---|
| Qué se ve | Todo el modelo: tabla color × talla con − N + (`components/ficha-producto/MatrizStockFicha.tsx`) | Una talla a la vez (`lib/existencias-flujos.ts:131`) |
| Pasos | Motivo, lugar y responsable una vez por visita; un solo guardado (`useStockFicha.ts`) | Por cada talla: Dónde → Sumar o quitar y cuántas → Motivo → Quién |
| Qué se escribe | El número contado | La diferencia |
| Prenda que la tienda nunca tuvo | Aparece | No aparece: Existencias solo lista lo que tiene fila de `stock` en la sede o viene en camino (`lib/inventario-v2.ts:270`) |
| Al terminar | «Etiquetas de lo que entró» | Nada |
| Dónde está | Lo primero que se abre en la ficha | En «Más ⌄» y como acción 6 de 7 del modal |

Además, la ficha arranca en «Conteo físico» (`lib/ficha-cambio-de-sede.ts:18`): lo que se carga ahí sin cambiar el motivo queda en
Movimientos como conteo. No se midió en producción (las lecturas estaban bloqueadas en la sesión).

## Lo que ya decidió Felipe (2026-10-23)

1. Hoy hacen las dos cosas (ingresar y corregir), y sobre todo **correcciones al contar**, porque Recibir mercadería espera a Compras
   y todavía se está cuadrando el inventario. → La tabla arranca en «Conté y hay otro número».
2. **Nuevo producto sigue poniendo las unidades del día** en que la prenda nace.
3. **Editar producto queda con los números a la vista y «Ajustar en Existencias»**, sin − ni +.
4. **Primero esta maqueta**, antes de construir.

## Las tres formas

La tabla, sus reglas y su guardado son los mismos en las tres; cambia dónde vive.

- **A · En el modal de la prenda (recomendada).** «Ajustar stock» convierte la columna derecha del modal de ADR-0391 en la tabla de todo
  el modelo; la foto se achica. Todo lo de la prenda queda en un solo lugar y es un modal que ya conocen.
- **B · Una hoja propia.** La tabla de Editar producto tal cual, en su propia hoja. Cero aprendizaje y más ancho, pero es una hoja más.
- **C · En la misma tarjeta.** La tarjeta se abre a lo ancho de la fila con la tabla adentro. Sirve para recorrer la lista mientras se
  cuadra, pero las tarjetas vecinas bajan al abrirla.

Lo común: el botón «Ajustar stock» en la cabecera, que pregunta la prenda y encuentra también las que la tienda nunca tuvo; «Etiquetas
de lo que entró» al guardar, y la ficha de Catálogo de solo lectura.

## Reglas que la maqueta respeta (de la base, no inventadas)

- Una sola llamada a `ajustar_inventario` por guardado (ADR-0240), firmada por el responsable (ADR-0161).
- «Encontré unidades» (`reposicion`) solo suma y solo en el almacén de una tienda que separa piso y almacén (`reposicionCerrada`).
- Una talla que nunca estuvo en la tienda, con la carga inicial cerrada, entra solo con «Encontré unidades» (`textoProblemaMotivo`).
- Lo apartado no se quita. «Se dañó» no se resta: se reporta.
- Los motivos son los de Existencias (`motivosDeAjuste`) y viajan a la base como sus cuatro motivos (`motivoParaLaBase`).

**Una decisión nueva de la maqueta, que Felipe confirma al elegir:** un lugar por vez. Lo contado es del almacén o del piso, y para cambiar
de lugar primero se guarda o se descarta.

## Datos

La prenda «Blusa Emma BLU-0142», sus cuatro colores y todas las cantidades son inventados. Colores: los tokens de `apps/web/app/globals.css`
y `apps/web/app/estilos/tema.css`.
