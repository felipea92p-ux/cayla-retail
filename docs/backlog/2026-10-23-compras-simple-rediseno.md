## Compras simple: rediseño, pago y ronda (rama `claude/compras-simple-rediseno`, ADR-0480)

**EN PRODUCCIÓN desde el 2026-10-23** (orden de Felipe, antes de fusionar el #1286): `20261023180000`, `20261023181000` y `20261023183000`, en orden y verificadas por md5 de funciones. Mientras la web nueva no esté publicada, «Compré ropa» y «Gasté en otra cosa» piden una ronda que la pantalla vieja no abre (producción no tenía ninguna compra ni ningún cierre de Compras simple).

Pendiente:
- [ ] **Vencimiento de lo que paga Compras:** hoy queda a 7 días de la fecha del papel (provisional, nadie lo decidió). Decide Felipe.
- [ ] **Ronda:** ¿Compras puede ver todas las rondas abiertas (quién está comprando ahora)? ¿Una ronda abierta muchos días debería avisar? Hoy no hay ni lo uno ni lo otro.
- [ ] El texto del movimiento al recibir un cierre todavía dice «al terminar de comprar el DD/MM» (`recibir_cierre_compras`): que diga la ronda.
- [ ] Prueba ciega (/formidable) del recorrido nuevo: Mi plata con la ronda, la hoja de la prenda, Revisar compras en bandeja y Recibir con «¿Son estas?».
- [ ] Las miniaturas de «Mandar a la tienda» no tienen categoría (dibujan la percha).
- [ ] Refrescar el diccionario (`docs/datos/generado/`): las tres ya están en producción.
