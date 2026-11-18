## 2026-10-28 (Prendas dañadas en tienda: separarlas con un botón, saber dónde están, mandarlas a arreglar y volver arregladas al piso)
Qué hice: sobre lo que ya existía (`reportar_danada` y la lista de Dañadas, ADR-0328) agregué, en 8 actividades con su commit: el tipo de daño elegido de una lista
corta; el lugar donde cada tienda deja las dañadas; el botón «Separé una dañada» a la vista en Vender y en el Inicio de almacén (las cuentas que no usan el teléfono);
«Salió a arreglar» (cerca o Taller) sin mover stock; «Se arregló» con destino piso o almacén y costo opcional, y «No se pudo»; el aviso en rojo a los 7 días; y la foto
opcional del daño. 6 migraciones locales, 66 pruebas de Postgres, y la verificación en el navegador de punta a punta (también a 375 px y en modo oscuro).
Por qué así: nada de lo nuevo frena a una colaboradora con la tienda abierta (foto y nota opcionales, un botón a la vista); la prenda en arreglo NO sale del inventario de la sede
(la fila dice dónde está) para no tocar Frescura, Movimientos ni el conteo; volver «al piso» son dos traslados internos en una transacción para que Frescura cuente la edad desde ese
momento; el costo solo se anota (el asiento en Finanzas es otra decisión, de dinero). Las funciones cambiaron de firma con parámetros por defecto para que la web vieja siga valiendo.
Felipe se lleva: nada está en producción. Hay que pegar 6 archivos de `supabase/migrations/20261029*` (orden en el ADR-0564) y, para que el botón aparezca en la caja, darle el módulo
Existencias al rol de la terminal de ventas en Roles y accesos (hoy no lo tiene). Quedan pendientes dichos en `docs/backlog/2026-10-28-damaged-items-store-process-88b6c0.md`.

## 2026-10-29 (Dañadas en tienda: el costo del arreglo va a Finanzas, el Inicio del líder avisa y las migraciones quedaron en producción)
Qué hice: con las respuestas de Felipe, (1) el costo de un arreglo registra su gasto en Finanzas con `registrar_gasto` en la misma transacción (Mantenimiento y reparaciones, del cajón, Yape o Plin); (2) el Inicio
del líder suma «Dañadas sin decidir» (7 días); y (3) pegué las 6 migraciones en producción por el MCP, una por una, comparando el md5 de cada función con el de la base local y verificando después firmas, columnas, RLS y bucket.
Por qué así: el gasto usa la puerta que ya usa Caja (una sola fuente de verdad: el cajón y el diario lo ven sin una regla nueva) y es todo o nada; las migraciones llevan parámetros por defecto, así que la web que
está publicada sigue funcionando mientras la nueva espera su PR.
Felipe se lleva: falta darle Existencias al rol `terminal_ventas` en Roles y accesos (en producción no lo trae; lo intenté por SQL y el sistema lo frenó) y abrir el PR para publicar la web. Las versiones registradas en producción están en el ADR-0564.
