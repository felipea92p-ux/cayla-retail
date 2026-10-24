# 2026-10-24 · Proveedores: tipo mercadería / servicios (ADR-0501)

- Nuevo campo `proveedores.tipo` (migración `20261024222000`) con `cambiar_tipo_proveedor` y `fn_proveedor_servicio_resumen`; la web separa la lista en pestañas, el alta pregunta el tipo y la ficha de servicios muestra lo que se le paga.
- Las cifras de la lista ya no cuentan a Entel, luz y agua como «proveedores sin compras» (`resumenSoloMercaderia`).
- Probado en local (base + navegador + 608 archivos de pruebas); la migración YA está en producción (17 servicios, 102 mercadería); falta fusionar la web y que Felipe clasifique a los 28 proveedores activos sin rubro.
