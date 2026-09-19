# Spike visual — Comprobantes de proveedores con movimiento (2026-09-19)

Prototipo **vivo** de `/compras` (misma pantalla que `../compras-2026-09/01-comprobantes`), con la
interacción y las animaciones propuestas. **No toca código de la app**; es una maqueta para decidir
qué se lleva a producción.

Ábrelo con doble clic en `comprobantes-vivo.html` (necesita `cayla-isotipo.png` al lado y conexión
para las fuentes de Google). Datos de ejemplo; «hoy» está fijo en 19/09/2026.

## Qué probar

| Gesto | Qué debería pasar |
|---|---|
| Cargar / «Repetir entrada» | Tarjetas y filas entran en cascada; las cifras cuentan desde 0 |
| Clic en una tarjeta «Por pagar» / «Por recibir» | Cambia de pestaña y baja a la lista |
| Cambiar pestaña u orden | El subrayado / la pastilla se deslizan y las filas se reacomodan (FLIP) |
| Escribir en la búsqueda (`/` para enfocar) | Filtra en vivo y resalta lo encontrado; sin resultados → estado vacío |
| `j` / `k` / `Enter` / `Esc` | Recorrer filas, abrir detalle, cerrar |
| Clic en una fila | Detalle encima de la lista con línea de tiempo Registrado → Mercadería → Pago |
| Detalle → «Registrar pago» | Segundo modal encima del detalle: **cuenta del proveedor** (banco, cuenta, CCI, Yape/Plin con «Ver completos» y «Copiar»), fecha, **medio(s) de pago**, monto y **N.° de operación** (opcional). Pago parcial o total, uno o varios medios, saldo a favor. Al confirmar: giro → visto → el pago entra al historial del detalle → chip, fila y «Por pagar» se actualizan |
| «+ Registrar comprobante» | Pantalla completa `/compras/nueva`: Documento → Líneas → Pago, con resumen pegado a la derecha, lista de pendientes y botón que solo se activa con los 4 requisitos. Al registrar, vuelve a la lista con la fila nueva parpadeando |
| Menú lateral → «Proveedores» | Lista con 5 KPIs, búsqueda, filtro por rubro y por «Sin datos de pago», orden con pastilla deslizante, chip ámbar «Sin datos de pago», desactivados con «Reactivar». «+ Comprobante» abre el registro con ese proveedor ya elegido |
| Clic en un proveedor | Ficha: métricas de 12 meses, **«Datos para pagar»** (cuenta, CCI, Yape/Plin con Copiar, «Ver completos» y «Editar»), evolución del costo, últimos comprobantes |
| «Registrar proveedor» / «Editar» | Modal con razón social, RUC, contacto, teléfono, rubro, plazo y el bloque de **datos para pagar** (banco, cuenta, CCI, celular Yape/Plin, billeteras, medio preferido) |
| «Editar» / «Agregar…» desde el pago o el registro de comprobante | Editor rápido encima del pago; al guardar, el pago se repinta solo con el dato nuevo |
| Panel inferior | «Ver carga» (esqueleto), «Movimiento reducido» (simula `prefers-reduced-motion`), «Reiniciar datos» |

## Lo que es simulación (no confundir con el diseño)

- Los pagos y comprobantes nuevos solo viven en memoria: al recargar la página vuelven los datos de ejemplo.
- **Ir a recibir** solo muestra un aviso. En la app real abre `/compras/recibir` con las cantidades
  **vacías** (D1, ADR-0111): el detalle nunca marca mercadería como recibida por su cuenta.
- Las cuentas bancarias, CCI y Yape son inventados. «Copiar» copia el valor completo al portapapeles.
- El panel oscuro de abajo y los números de la leyenda no forman parte de la interfaz.

## Reglas de pago (acordadas con Felipe)

- El **N.° de operación es opcional** (como hoy en `LineasPago.tsx`): se ofrece siempre que haya banco de por medio,
  pero nunca bloquea el registro del pago. El único bloqueo es el monto.

## Qué ya existe en la app y qué es nuevo

- **Ya existe:** medios de pago (`ETIQUETA_METODO`), varios medios por pago (`LineasPago`), saldo a favor, campo
  «Referencia», `proveedores.banco` / `cuenta_bancaria` / `forma_pago_preferida` / `plazo_credito_dias`, y el formulario
  `/compras/nueva` (`CompraFormV2`). La maqueta 03 ya diseñaba el bloque «Paga por».
- **Nuevo en el spike:** el bloque de cuenta también en el pago individual; historial de pagos con medio y N.° de
  operación en el detalle; ayudas en el registro (costo vs último costo, documento duplicado, checklist de pendientes);
  todo el movimiento.
- **Datos:** las columnas de CCI, Yape/Plin y titular ya existen en producción (ADR-0129, aplicada el 2026-09-19) y la aplicación real las usa
  (pago, registro de comprobante, ficha y formulario de Proveedores). Este prototipo sigue siendo la referencia visual y de movimiento.

## Si se aprueba: costo de llevarlo a producción

- Sin librerías nuevas (la app ya usa `--ease-cayla`; esto es CSS + WAAPI). GSAP queda para lo que ya lo usa.
- `page.tsx` sigue siendo Server Component. Piezas cliente pequeñas: cifras que cuentan
  (`TarjetaCifra`), indicador de `Pestanas`/`SegmentoEnlaces`, y el FLIP de la lista.
- La barra de avance dentro de la celda usa datos que `celdaRecepcion`/`celdaPago` ya calculan
  (`recibidoCantidad/facturadoCantidad`, `pagado/total`); hay que exponer el `pct` en `CeldaEstado`.
- Todo respeta `prefers-reduced-motion`. Regla del repo: el rojo es acento (máx. 2 por pantalla) — la
  única animación infinita es el punto de «Vencida».

## Validaciones de datos para pagar (todas opcionales; si vienen, deben ser válidas)

CCI = 20 dígitos (banco deducido de los 3 primeros: 002 BCP, 003 Interbank, 009 Scotiabank, 011 BBVA, 018 Banco de la
Nación, 038 BanBif, 049 Mibanco, 055 Pichincha; avisa si no coincide con el banco elegido) · celular = 9 dígitos que
empiezan con 9 y al menos una billetera (Yape/Plin) · cuenta = 8–20 dígitos · con cuenta o CCI debe haber banco.

## Archivos de esta carpeta

`comprobantes-vivo.html` (el spike) · `cayla-isotipo.png` · `PROPUESTA-CUENTAS-PROVEEDOR.md` (el análisis previo del esquema; ya **aplicado** — ver ADR-0129).
