# Backlog · 2026-10-24 · Píldoras de ofertas al instante

- [ ] Verlo con las campañas reales tras publicar (Inicio de la tienda, 1440 px y 375 px).
- [ ] El catálogo (`/catalogo`) sigue pidiendo la página entera al servidor al cambiar de lista o filtro (2–9 s medidos): mismo problema, no tocado.
- [ ] `tienda_catalogo` cuesta ~0,5 s por tienda (`fn_tienda_precios` ~0,26 s); con la caché de 30 s casi todo toque cae vencido.
