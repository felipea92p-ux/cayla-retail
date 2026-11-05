## 2026-11-03 — Recibir ▸ recepción sin aviso, de punta a punta (`/flujo-de-negocio`)

Qué hice: escribí el caso `docs/flujos/recibir/sin-aviso-de-punta-a-punta.md` con 35 casuísticas y lo corrí en local, con una pasada ciega y una informada. No cambié el ERP.
Por qué así: Felipe quería revisar el flujo entero y lo grave no se ve en pantalla. Se encontró un costo fuera de lo normal que entra sin aviso, por un NULL en el filtro de `fn_recepcion_entrar`.
Verificado: invariantes limpias tras cada cierre y base restaurada idéntica. Sin probar: 375 px, teléfono real, colaboradora real y el precio rechazado en pantalla.

## 2026-11-03 — Recibir ▸ lo que dictó Felipe al probar, y un modelo que sale sin cerrar el envío (ADR-0608)

Qué hice: Crear la prenda va por los pasos de Nuevo producto, la tabla de Cerrar es una fila por modelo con un solo costo, al reabrir lo que ya entró se ve con candado, y «Llevar al stock ahora» saca un modelo sin cerrar el envío, con su corrección, «Por confirmar» y el aviso de lo que quedó a medias.
Por qué así: la tanda entra por `fn_recepcion_entrar` y deja la forma de un envío reabierto: el cierre final y sus candados no cambian, y no nace otro camino al stock.
Verificado: `pruebas:envio-sin-aviso` 37/37, recepción y cancelar en verde, ataques en el navegador (5 clics, respuesta perdida, costos hostiles) con una sola entrada y las cuentas cuadradas. Sin probar: colaboradora real, teléfono real.
