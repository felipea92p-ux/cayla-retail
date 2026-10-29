## 2026-10-28 · «Compré ropa» pasa a llamarse «Apunte de compras»
- **Qué se hizo:** Felipe pidió el cambio de nombre de la pantalla de Mis compras donde la compradora registra lo que compró. Cambia en la tarjeta de Mis compras, en el título de `/compras/mi-plata/compra` y su cabecera, en el texto de la ronda vacía y en las dos guías interactivas. La frase de la tarjeta («A un proveedor, en la calle o por pedido») no cambia.
- **Qué no cambia:** rutas, claves de módulo, funciones de la base y los comentarios e ADR que dicen «Compré ropa» (son historia). Ninguna regla de negocio.
- **Cómo se verifica:** `vitest` de guías, guía de foco, unificar y mi-plata en verde (325 pruebas); falta mirarlo en el navegador a 375 px por si el título más largo se parte en la cabecera.
