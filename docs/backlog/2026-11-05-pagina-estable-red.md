# 2026-11-05 — La red en la regla de PaginaEstable

- **Probar en un iPhone real**: se midió en Chrome emulando 375 px.
- No se recorrió el ERP entero con la red puesta. Si una lista se cambia un instante por un esqueleto muy corto, estando abajo la vista ahora sube (ADR-0185, act. 2026-11-05 b). Si alguien lo ve, esa pantalla debe reservar su alto o no plegarse.
- Las quince llamadas a `soltarPaginaEstable()` se quedan: varias además llevan la vista al título. Algunas podrían simplificarse; no se revisó cuáles.
