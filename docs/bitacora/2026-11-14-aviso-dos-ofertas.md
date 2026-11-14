# 2026-11-14 · El aviso de Campañas: prendas con dos ofertas (ADR-0655, decisión 2, parte 3)

- **Qué:** `20261114170000` lista los pares de ofertas que comparten prendas sin resolver (`campanas_ofertas_que_chocan`) y guarda cuál queda,
  par por par (`elegir_oferta_que_queda`). Campañas y ofertas lo dice en un aviso, «N prendas tienen dos ofertas», con una hoja para elegir.
- **Por qué:** Felipe pidió avisarle a quien configura. Como Shopify, se elige por par de ofertas y vale para todas sus prendas («Dale»).
  `ceder_ofertas` no servía: le exige a la que gana no tener ningún otro choque abierto.
- **Verificado:** `pruebas:aviso-dos-ofertas` 9/9 (con su control: `ceder_ofertas` no resolvía el par), `campana-reglas` 92, guías 145.
  Aviso y hoja con datos inventados a 694 y 375 px.
