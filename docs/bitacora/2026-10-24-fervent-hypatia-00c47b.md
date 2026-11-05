# 2026-10-24 · Recibir mercadería: lista, detalle del envío y observaciones

- **Lista de envíos por recibir:** ahora es una tabla (número, estado, proveedor, guía, prendas, acción) con buscador; lo que hay que seguir recibiendo va primero y lo que la cuenta no puede recibir (hizo la orden) al final. «Sin Aviso» es un botón a la derecha del título que abre el formulario (antes siempre visible).
- **«Detalle» en vez de «Recibir»:** abre una hoja con lo que trae el envío (categoría, marca, cantidad) y «¿Vas a recepcionar una compra? Abre el fardo»; abrir salta directo a contar. El paso «¿Qué llegó?» salió del riel (ahora son dos: Contar y Cerrar).
- **Observaciones al contar (ADR-0507):** botón «Anotar observación» en cada categoría de Contar; siete tipos + mensaje; tabla nueva `despacho_observaciones` y dos funciones (migración `20261024235000`, solo en local). Prueba: `pnpm pruebas:observaciones-de-envio` (10/10).
