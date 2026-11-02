## Liberar un apartado: lo hace quien ve Apartados (2026-11-02)
Estado: construido en la rama `claude/prenda-trujillo-inventory-d8248b`, **sin probar contra Postgres ni en el navegador** (Docker apagado). ADR-0599.
- [x] Migración `20261102152000` (reemplazo anclado de `liberar_separacion`: `fn_puede_gestionar_caja() or fn_ve_modulo('apartados')`). **No pegada en producción.**
- [x] «Liberar apartado» en el detalle de Entregar (`EntregarVista.tsx`) y «Liberar» de Historial sin pedir `puedeGestionar`.
- [x] Guía de Apartados al día (huella aceptada); `pruebas:separaciones` con el caso nuevo (quien ve Apartados libera) y el que sigue fallando (quien solo ve Vender).
- [ ] Correr `pnpm pruebas:separaciones` con el Postgres local (en esta sesión Docker estaba apagado). Cómo verificas tú: arranca el stack local y corre ese comando; deben pasar los dos casos de «liberar».
- [ ] Pegar la migración en producción (SQL Editor de cayla-dynamic, re-ejecutable) y fusionar el PR.
- [ ] **Caso real APT-TRU-0007** (placa apartada por error en Tienda TRU; el cliente pagó UNA sola vez, ya figura en la venta de Arequipa del 29-oct): después de lo anterior, liberar con «Fue un error al apartar», «Devolver el adelanto» como reverso sin movimiento de dinero (operación: «REVERSO sin movimiento de dinero: ya figura en la venta AQP del 29-oct») y ajustar Tienda TRU en −1 (nota «apartado hecho por error desde la sede equivocada»).
- [ ] Idea sin decidir: avisar cuando alguien opera en una sede distinta a la suya («Estás en Tienda TRU, tu sede es AQP») en Apartados, Vender y Existencias.
