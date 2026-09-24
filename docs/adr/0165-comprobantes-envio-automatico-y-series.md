# ADR-0165 — Comprobantes: el envío a SUNAT es automático y la pantalla es de series

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, en el chat del 2026-09-22: «Ok empieza»). Construido y verificado en local contra el sandbox; **producción espera el OK explícito** para las migraciones `20260922193700` y `20260922234100` · Relacionado: D-60, ADR-0005, ADR-0009, ADR-0093, ADR-0124 (las cuatro vistas de Facturación, que esto reemplaza), ADR-0164 (nota de venta). Diseño: `docs/superpowers/specs/2026-09-22-comprobantes-series-y-envio-automatico-design.md`. Maqueta: `docs/maquetas/comprobantes-series-spike-2026-09/`.

## Contexto

Felipe pidió que «Facturación» pase a llamarse Comprobantes, que solo muestre las series (en qué número va cada una, crear nuevas) y que el envío a SUNAT sea automático al cobrar, sin botón «Transmitir». D-60 ya lo había decidido, y la migración `20260922151500` había dejado el esquema de la cola de reintento sin conectarlo.

Lo que se encontró al hacerlo:

- En producción había 20 boletas de prueba sin transmitir (S/ 11 056,10, 14 al 22 de setiembre): nadie presionó «Transmitir». Felipe: todo es prueba, no se envían; quedaron `no_emitido` con motivo.
- Los 2 comprobantes que sí se transmitieron (8 y 9 de setiembre) fueron a la **SUNAT real** (`LUCODE_ENTORNO=produccion` en Vercel). Con el envío automático, cada venta de prueba se declararía sola.
- **Ninguna boleta nacida de una venta se había podido transmitir nunca**: `registrar_venta` guarda cada línea como `{variante_id, precio con IGV, descuento}` y la ruta de Lucode exigía `{descripcion, precio sin IGV}`. El único aceptado se había emitido a mano como «Venta de mercadería».
- `registrar_serie_comprobante` «cambiaba» la serie de una tienda conservando el contador (B004 → B010 arrancaba en el 24).

## Decisión

1. **Envío al cobrar, en segundo plano.** Vender llama a `POST /api/lucode/emitir { venta_id }` justo después de `registrar_venta` (y al subir una venta guardada sin conexión), con `keepalive` y `x-espera: no`: la vendedora no espera a Lucode. La lógica vive en `lib/transmitir-comprobante.ts`, compartida por las dos rutas.
2. **Si Lucode no responde, a la cola, nunca perdido.** La ruta marca el comprobante `pendiente_reintento` (`fn_marcar_reintento_transmision`) con el error y un backoff. El número no cambia.
3. **Reintento sin cron.** `fn_tomar_comprobantes_para_reintento` toma lo vencido (y los `pendiente` de 2 minutos a 3 días que nunca salieron) y lo **reserva 5 minutos en la misma operación** (`for update skip locked`): dos pasadas a la vez nunca envían el mismo comprobante. La llaman Vender tras cada cobro (su sede) y Comprobantes al abrirse (todas, si es líder), hasta 3 por vez. Con cobros todo el día no hace falta un cron; si la cola se queda quieta de verdad, se agrega uno de Vercel que llame a la misma ruta.
4. **Las líneas de una venta se declaran bien.** `itemsParaLucode` nombra cada línea con referencia + SKU y declara `(precio − descuento) / 1,18` con 6 decimales, que vuelve al total cobrado al céntimo.
5. **La pantalla es Comprobantes, con Series de base.** `/vender/comprobantes` (redirige desde `/vender/facturacion/**`), pestañas Series · Emitidos · Por reintentar · Proformas. Salen el Resumen del día, los Códigos de descuento (el código al cobrar sigue igual) y «Transmitir»; queda «Reintentar» para lo rechazado y lo que está en cola. Aviso rojo arriba si algo lleva más de 1 hora en cola. Pastilla «Pruebas» mientras el envío vaya al sandbox.
6. **Una serie se archiva, no se reemplaza.** Una activa por tienda y tipo (índice único parcial); un nombre de serie no se reusa nunca para el mismo tipo (sus números chocarían con `unique (tipo, serie, numero)`). `fn_reservar_numero_serie` toma solo la activa, con la misma firma.

## Consecuencias

- El día de salir a producción son tres pasos, visibles en Series mientras se esté en sandbox: `LUCODE_ENTORNO=produccion` y volver a desplegar; archivar las series usadas en pruebas y registrar series nuevas (empiezan en 1); una venta chica y ver que SUNAT la aceptó.
- La migración de archivar va **después** de `20260922224300_nota_de_venta.sql` a propósito: esa siembra las series NV con `on conflict (ubicacion_id, tipo)`, que necesita el índice completo.
- Sin cron, un comprobante que Lucode rechaza a las 23:00 espera al primer cobro o a la primera apertura de Comprobantes del día siguiente.

## Se rompe si

- Alguien vuelve a poner un «Transmitir» que no pase por `transmitirComprobante` o por `motivoParaNoTransmitir`.
- Se pega en producción el código antes que `20260922193700`: el barrido falla sin ruido (403) y no reintenta nada; el envío al cobrar sí funciona.
- Una tienda corrige boletas **y** facturas con nota de crédito: con una sola NC activa por tienda, SUNAT rechazaría la que no lleve la letra del documento que corrige. Resolverlo exige que `emitir_nota` y `aprobar_devolucion` digan qué letra quieren (BACKLOG).

## Actualización 2026-09-23 — el cron que el punto 3 dejaba para después (PL-113 y PL-114)

Felipe decidió en el plano maestro (PL-113) que el reintento no puede depender de que alguien abra una pantalla. Se agregó, encima de lo mismo y sin duplicarlo:

- **Trabajo programado de Vercel cada 5 minutos** (`apps/web/vercel.json` → `GET /api/lucode/reintentar`; el plan del equipo es Pro, así que la frecuencia no tiene tope diario). Usa la misma `fn_tomar_comprobantes_para_reintento` y la misma reserva de 5 minutos: el cron y los barridos del navegador nunca mandan el mismo comprobante (ese es el «token de idempotencia» del acta).
- **Entra con la llave de servicio, protegido por `CRON_SECRET`** (lo exigen la ruta y `proxy.ts`). Las tres funciones que usa (`fn_tomar_…`, `fn_marcar_reintento_transmision`, `actualizar_transmision_comprobante`) aceptan `auth.role() = 'service_role'` en su candado de sede y le dan `execute` (`20260924113817_sunat_reintento_por_cron.sql`). La llave ya saltaba RLS; así escribe por las mismas guardas que la pantalla.
- **4 horas y suelta** (`HORAS_REINTENTO_AUTOMATICO`, el mismo número en la base): pasado eso el cron deja el comprobante y el **Inicio del líder** lo avisa en «Por atender» (PL-114: «Comprobantes sin llegar a SUNAT», enlace a Por reintentar). La «campanita de campañas» que citaba la pregunta no existe (`lib/etiqueta-campana.ts` son las reglas de las campañas de descuento); el aviso usa el camino que ya usan ADR-0179 y ADR-0186. Los barridos del navegador siguen como estaban (un pendiente, hasta 3 días): el líder que entra por el aviso todavía puede empujarlo.
- **Solo sandbox.** Mientras toda venta sea de prueba, el cron no transmite si `LUCODE_ENTORNO` no es `sandbox` (`cronNoTransmite`, con su prueba). Salir a producción suma un cuarto paso a los tres de arriba: cambiar esa regla a propósito.

Se rompe si: falta `CRON_SECRET` en Vercel (el cron responde 401 y no hace nada — la cola vuelve a depender de las pantallas); o se sube la web antes de pegar `20260924113817` (el cron falla con `permission denied for function fn_tomar_comprobantes_para_reintento`, sin tocar nada).
