## Recibir — Contar modelo por modelo (2026-11-02, ADR-0604)
En producción desde el PR #1602: categorías sin repetir, filtro por proveedor y marca, Dial por modelo, tres columnas, tallas en la misma pantalla. Sin migración.
**Desde este PR (2026-11-03, ADR-0604 act. c):** el costo en la placa, el número que no se transforma, abrir una categoría sin mover lo que se cuenta, Cerrar más corto, lo decidido que sobrevive a recargar y «Nos debe» por prenda. **La migración `20261103144000_nos_debe_por_prenda.sql` se pegó en producción el 2026-11-03 a las 11:33 de Lima, con el OK de Felipe** (`apply_migration` «nos_debe_por_prenda»; los md5 de las seis funciones son iguales a los de la base local). Producción tiene 0 diferencias de envío vigentes, así que todavía no hay ninguna deuda con la que verla funcionando allá. Falta refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): la foto es del 2026-10-29.
La maqueta del boceto ya está en el ERP (tres columnas, resumen, tallas en la misma pantalla). **Antes de confiar del todo:** probarlo con quien recibe de verdad.
**Decide Felipe:**
- ¿Que la base también rechace cerrar con prendas sin identificar? Hoy lo frena solo la pantalla (`gruposSinIdentificar`). Lleva migración en `cerrar_conteo_envio`.
- ¿Cerrar también junta cada categoría una sola vez? Hoy sigue por proveedor + categoría + marca (ahí las causas y los costos son por línea). Desde el 2026-11-03 lo que cuadra va plegado: con 75 líneas mide unos 2.200 px.
**Recomendaciones para seguir (2026-11-02, sin decidir; se revisó el código y se midió en local):**
- Ver lo que cuentan los demás: varias personas pueden contar a la vez, pero la pantalla no se refresca sola con lo de otra persona.
- «Llegaron todas» por categoría: bajaría de 146 toques a unos 22 en un envío de 73 modelos que cuadra, pero invita a no contar. Es decisión de negocio de Felipe.
**Deuda chica, sin decisión:**
- Una celda de la tabla de tallas llega hasta 9.999 (`leerCantidad`): un modelo con más de una sola talla y un solo color no se puede repartir (ADR-0604, límite 6).
- La tabla de tallas no se entera de lo que otra persona guarda en el mismo modelo hasta recargar (ADR-0604, límite 7).
- Una prenda en dos líneas con tallas puestas vuelve a quedar entera en la primera línea: al cerrar pregunta qué pasó (ADR-0604, límite 4).
- Base local: quedaron ENV-003055 (contado), ENV-003056 (intacto, para probar a mano), ENV-003057 (cerrado), las marcas «ZZ Marca Norte/Sur» y una ronda de compras abierta de Sandra (prueba). La foto `antes-contar-modelos` las borraría junto con todo lo demás escrito desde entonces.
- En un envío a medias con un conteo de antes, un modelo en 0 puede decir «No llegó» sin que nadie lo dijera (ADR-0604, límite 1). Al cerrar sale como faltante y pide su causa.
- `docs/maquetas/recibir-editable-2026-11/`: sus pantallas de Contar son de antes de este cambio; hay que recapturarlas si se sigue usando.

## Cantidades tecleadas: «2,5» ya no queda en 25 (2026-11-03)
En este PR: `limpiarCantidad`, `useCantidadEscrita`, `lib/cantidad-escrita-reglas.ts` y las tablas que los usan.
**Corregido en este PR (el error estaba en `main`):** en Recibir ▸ Contar, la tabla de un modelo con tallas guardadas se cerraba al recargar y teclear un número que dejaba de cuadrar. Ya sigue abierta, también al cambiar el número con el Dial, y lo repartido no se pierde. Sigue igual lo que decidió ADR-0604: las tallas se sueltan hasta que vuelva a cuadrar, y si alguien recarga antes, lo escrito se pierde; la pantalla pregunta antes de salir.
**Sin probar en su pantalla real:** Nueva orden y las hojas de la orden. A la base local le falta `producciones.ingreso_al_stock`, que ya está en `main`, y la pantalla de órdenes no carga. Se probó la misma tabla en una pantalla temporal, ya borrada, con Enter y flechas, y con `lib/orden-tabla-reglas.test.ts`.
**Límite conocido:** si alguien escribe «2,5» y hace clic directo en guardar, sin salir antes de la celda, se guarda lo que había. La celda ya estaba en rojo desde la coma, pero si la pantalla se cierra, el aviso de «no se guardó» no se alcanza a leer.
**Mismo error en otros campos, sin tocar:** `limpiarCantidadReposicion` (`lib/nos-debe-reglas.ts:498`), `components/existencias/AjusteDelModelo.tsx:663`, `components/existencias/FlujoTalla.tsx:681`, `components/CerrarCajaModalV2.tsx:425` (billetes), `lib/reponer-prenda-reglas.ts:81`. El código de recojo (`limpiarCodigo`, `lib/pedidos-web-reglas.ts:1293`) no es una cantidad: ignora a propósito un espacio o un guion dictado, y la base verifica el código.
