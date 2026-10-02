## Carta de colores: SQL por pegar y lo que queda (ADR-0313, 2026-10-02)

- [ ] **POR PEGAR 2026-10-02** en producción, en cualquier orden y antes o después de desplegar la web:
  - `20261002190000_colores_neutro_mas_corto.sql` → verificación: `neutro 10, tierra 11`.
  - `20261002191000_colores_hex_mas_distinguibles.sql` → verificación: `PER = #DBDDD9`, `AMM = #FEDF87`.
- [ ] **Fusionar en este orden:** primero #736 (quita el renglón «Otros» de producción al desplegarse), luego este PR. Este PR sale de
  la rama de #736 y no compila sin ella.
- [ ] **Moka–Tostado (ΔE2000 7,9)** queda justo por debajo del umbral 8 del aviso «se confunde con»; los dos son canónicos. Si
  molesta, se decide con la muestra física en la mano.
- [ ] **Perla**: si algún día se quiere una Perla de verdad perlada (blanco cálido) distinta de Crudo, habría que retirar a Crudo
  o hacer una familia «Crema»; con un hex solo no alcanza (ADR-0313, «Descarté»).
