# 2026-10-27 · Una campaña que solo tiene ofertas también sale en la Tienda web (rama campanas-tienda-catalogo-42d8de)

- **Qué quedó:** migración `20261027221000_campana_con_ofertas_en_tienda_web.sql` (ADR-0541): la lista de Tienda web ▸ Campañas, la portada y el diseño de la tienda
  leen las ofertas activas (la portada, solo las que rigen hoy, con el mayor %); una sola ganadora (`fn_campana_portada`) para portada y diseño. Prueba nueva:
  `pnpm pruebas:campana-con-ofertas` (32 escenarios, en el CI). Aplicada en el Postgres local y **pegada en producción el 2026-10-27** (OK de Felipe).
- **Decisión de Felipe (2026-10-27):** el % que anuncia la portada es el mayor entre el descuento de siempre y las ofertas que rigen hoy (no un texto sin %).
  Salió de su prueba en local: «Día del perro», con 1 oferta y «sin descuento», cobraba en caja y no salía en Tienda web ▸ Campañas.
- **Verificado:** sin ofertas, portada, diseño y lista dan lo mismo antes y después de la migración; siguen en verde `campanas-web`, `campana-reglas`,
  `tienda-puerta`, `campanas-llave-unica`, `campanas-por-sede`. **Producción:** `tienda_portada()` sigue dando `{"campana":null}`, igual que antes. **Falta:** mirar la tienda real con una campaña con ofertas; `tienda-ficha` 47/48 en local por
  una foto duplicada de los datos locales (ajeno).
