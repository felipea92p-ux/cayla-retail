## Compras simple: rediseño, pago y ronda (rama `claude/compras-simple-rediseno`, ADR-0480)

**POR PEGAR (2026-10-23), después de fusionar el PR #1286 y con el OK de Felipe:** `20261023180000`, `20261023181000` y `20261023183000`, en ese orden.
Pegar la ronda antes rompería la web de hoy: «Compré ropa» pediría una ronda que la pantalla vieja no sabe abrir.

**No está en producción:** las migraciones `20261023180000` (foto opcional), `20261023181000` (pagar ahora o después) y `20261023183000` (ronda de compras). Se pegan en ese orden, con el OK de Felipe. La ronda conviene pegarla junto con la publicación de la web: con la base nueva y la web vieja, «Compré ropa» pide abrir una ronda que la pantalla vieja no sabe abrir.

Pendiente:
- [ ] **Vencimiento de lo que paga Compras:** hoy queda a 7 días de la fecha del papel (provisional, nadie lo decidió). Decide Felipe.
- [ ] **Ronda:** ¿Compras puede ver todas las rondas abiertas (quién está comprando ahora)? ¿Una ronda abierta muchos días debería avisar? Hoy no hay ni lo uno ni lo otro.
- [ ] El texto del movimiento al recibir un cierre todavía dice «al terminar de comprar el DD/MM» (`recibir_cierre_compras`): que diga la ronda.
- [ ] Prueba ciega (/formidable) del recorrido nuevo: Mi plata con la ronda, la hoja de la prenda, Revisar compras en bandeja y Recibir con «¿Son estas?».
- [ ] Las miniaturas de «Mandar a la tienda» no tienen categoría (dibujan la percha).
- [ ] Refrescar el diccionario (`docs/datos/generado/`) cuando las tres migraciones estén en producción.
