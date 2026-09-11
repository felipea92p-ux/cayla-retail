# ADR-0035 — La IA compila el mapeo, no procesa las filas

**Fecha:** 2026-09-11
**Estado:** Construido y verificado de punta a punta en el navegador — Excel,
CSV, Google Sheets, PDF y foto entran; el catálogo se escribe en una transacción
y se puede deshacer. 178 tests. Falta aplicar `0056` en producción.
**Numeración:** nació como ADR-0031 con la migración `0055_importar_catalogo.sql`; al
desduplicar `main` (2026-09-11) el ADR pasó a 0035 (0031 ya era `recalcular_stock`) y la
migración a `0056` (0055 ya era `recalcular_stock_almacen`, y Supabase se niega a aplicar
dos versiones iguales: `schema_migrations_pkey`).

## Contexto

El onboarding de cada marca nueva empieza con su inventario en un archivo propio.
ADR-0030 resolvió *hacia dónde* traducirlo (el estándar universal, con el
vocabulario propio colgando). Esta decisión resuelve *cómo* usar la IA para
hacerlo, y es la que determina el costo, la exactitud y la reproducibilidad de
todo el importador.

## La decisión

**DECIDÍ: el modelo produce un PLAN mirando las cabeceras y 40 filas de muestra;
código determinista aplica ese plan a las 3.000 filas.** El modelo nunca ve la
fila 2.847, y por eso no puede equivocarse en ella.

| | IA como ETL (lo obvio) | IA como compilador de mapeo (esto) |
|---|---|---|
| Qué ve el modelo | Las 3.000 filas | Cabeceras + 40 filas + los valores distintos |
| Costo medido (Haiku 4.5) | ~$1.20 por archivo | **$0.006 + $0.01 por archivo** |
| ¿Mismo archivo → mismo resultado? | No | Sí: el plan se guarda en `importaciones.plan` |
| ¿Puede alucinar un precio? | Sí | No — el precio lo copia `parsearNumero`, no el modelo |
| ¿Corregir cuesta? | Otra llamada | Gratis: el mismo endpoint aplica el plan sin IA |

Lo mismo para los valores: **se resuelve el diccionario, no las filas.** Un
catálogo de 3.000 prendas tiene ~40 colores distintos; de esos, los que ya están
en el vocabulario los cruza `claveTexto` gratis. Al modelo solo llega lo nuevo —
a veces, nada.

**DESCARTÉ: mandar el archivo completo al modelo.** Es lo primero que uno
pensaría y es 40 veces más caro. Pero el costo no es lo peor: es que cada fila
es una oportunidad de alucinar, y un precio alucinado no falla — importa una
blusa a S/ 1.23 y nadie se entera hasta que se vende.

**DECIDÍ: dos carriles, una salida.** Excel, CSV y Sheets se leen con código
(gratis, exacto). PDF y foto no tienen parser: los transcribe el modelo, y es el
carril caro (~2.000 tokens por página) y menos exacto. Los dos terminan en la
MISMA tabla, así que de ahí en adelante nada sabe de dónde vino — y la pantalla
avisa en ámbar cuando fue transcrito, en vez de esconder la diferencia.

**DECIDÍ: un solo RPC transaccional para escribir.** `crear_producto_con_variantes`
(0033) es de a uno: 900 productos son 900 round-trips a São Paulo (~322 ms,
ADR-0013), cinco minutos, y si el 600 falla quedan 599 a medias.
`importar_catalogo` (0055) escribe todo o nada.

**DECIDÍ: stock en cero, y por eso deshacer es descontinuar.** Decisión de Felipe
(2026-09-10): el catálogo entra, las cantidades las levanta el censo (ADR-0027).
Como no hay `movimientos`, deshacer es marcar `estado = 'descontinuada'` — nunca
`DELETE`, nunca reescribir historia. Y se niega si alguna prenda ya tuvo
movimiento: alguien la usó.

**DECIDÍ: la revisión va en el camino, no diferida.** Felipe pidió "mapear al
más cercano y marcar para revisión"; en autoservicio, una lista de revisión
diferida es un archivo que nadie abre. La última pantalla antes de escribir
muestra los valores nuevos y de qué universal cuelgan, y el botón que importa es
el mismo que los aprueba.

## Lo que se descubrió construyendo

1. **`parsearNumero` es donde se pierde dinero.** "1.234,56" (europeo) y
   "1,234.56" (americano) son el mismo importe, y `parseFloat` devuelve 1.234
   para el primero — mil veces menos. La regla es que manda el ÚLTIMO separador
   y 3 dígitos detrás son miles. Es la función más testeada del importador.
2. **La matriz de tallas es un formato, no un caso raro.** Una columna por talla
   con cantidades dentro es el formato clásico de confección. Leerlo como fila
   por variante crearía un producto con una talla llamada "S". Se detecta y cada
   fila se abre en una variante por talla con existencia.
3. **El `unique (producto_id, talla, color)` de 0047 hay que respetarlo ANTES.**
   Dos filas del archivo con la misma talla y color son un duplicado del
   cliente; se quita una y se dice en pantalla, en vez de que Postgres lo
   rechace a mitad de transacción.
4. **El SDK exige streaming por encima de 16.000 tokens de salida.** Para el
   carril de foto ese techo es el correcto (~400 prendas); un PDF que no quepa
   recibe el consejo de pedir el Excel.
5. **Un test con datos sintéticos no sirve de chuleta.** La primera prueba del
   RPC dio familias de color absurdas y la función era correcta: los IDs de mi
   SQL de prueba eran los inventados del test unitario.

## Verificación

- Excel sucio (título suelto, fila vacía, hoja de portada, `"0012"`, `"S/ 89.90"`)
  → hoja correcta, cabecera en la fila 1, texto intacto.
- Mapeo: dedujo que "TONO" es color mirando los datos; separó "P. COMPRA" de
  "PVP"; detectó la matriz de tallas y abrió 10 variantes. $0.006.
- Valores: "Azul marino"/"AZUL MARINO" reconocidos sin gastar un token;
  Terracota→Marrón, Kimonos→ruta exacta. $0.01.
- RPC: 3 productos, 6 variantes, 4 colores y 2 categorías creados con códigos
  derivados (TRR, KMN), códigos cortos asignados, CERO filas de stock. Deshacer:
  3 descontinuados, 0 borrados, vocabulario conservado.
- Foto de cuaderno (canvas): 7 filas y 4 columnas exactas, título saltado, $0.0036.
- Flujo completo en el navegador con la sesión real: subir → leer → columnas →
  valores → importar → "3 prendas · 6 variantes", confirmado en la base.

## Cómo se revierte

Las tablas y funciones de `0056` se pueden soltar sin tocar nada existente:
`importaciones`, `producto_atributos`, `productos.importacion_id` y las cinco
funciones. Ninguna pantalla vieja las lee.
