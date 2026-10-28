## Reponer solo con Existencias (ADR-0306, 2026-10-02)
- **Pegar en producción** `20261002120000_bajada_y_ajuste_dentro_de_existencias.sql` DESPUÉS de publicar la web; pide OK de Felipe. Verificar luego con un select que ningún rol tenga `bajada_piso`/`ajustar_stock` y que el Terminal de ventas pueda reponer.
- Regularizar lo que las tiendas ya bajaron sin registrar: reponer esas prendas desde Existencias (el piso queda con stock).
- Revisar si otras funciones internas (apartar desde Existencias) deben dejar de pedir su propio módulo: hoy Apartados sí tiene menú.
