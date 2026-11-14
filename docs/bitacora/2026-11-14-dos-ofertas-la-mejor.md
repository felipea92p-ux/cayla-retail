# 2026-11-14 · Una rebaja y un 3x2 en la misma prenda: la que más ahorra (ADR-0655, decisión 2)

- **Qué:** `20261114155000` enseña a LA cuenta de las ofertas de grupo (`fn_repartir_grupos`) a comparar, por oferta, «todas con la oferta»
  contra «las rebajadas fuera con su rebaja», y a cobrar la que más le ahorra al cliente, nunca las dos. La caja, Apartar y la bolsa web
  hacen la misma cuenta y lo dicen en el ticket («ahorra S/ 49.90 en vez de su −20 %»).
- **Por qué:** una prenda podía quedar con una rebaja y un 3x2 por una puerta de fuera de la hoja (marcar una insignia, mover un modelo,
  reactivar una campaña) y se cobraban las dos. Felipe eligió «Como Shopify: la mejor» mientras nadie elige en Campañas.
- **Verificado:** `pruebas:caja-ofertas-de-grupo` 30/30, `apartados-ofertas-de-grupo` 18/18, `tienda-ofertas-de-grupo` 12/12, y 9 suites
  más corridas como en el CI (todas las migraciones puestas): en verde, salvo una de `frescura_bajadas` que falla igual sin el cambio (la
  carga inicial de Tienda Trujillo cerrada en la base local). `vitest` 44 + 38. Ticket a 375 px con datos inventados.
