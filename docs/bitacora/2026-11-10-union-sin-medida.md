# 2026-11-10 · Probador: la medida que llega tarde se aplica, y sin medida el short no se esconde detrás de la blusa (ADR-0449)

- **Qué:** si un recorte tarda más de 4 s, la figura deja de esperar pero aplica la medida cuando llega; y mientras no hay unión, lo de abajo arranca en el bajo de la prenda de arriba, no en la cintura fija.
- **Por qué:** en el celular de Felipe dos looks salieron sin unir (short detrás del polo, asomando por la cintura): la medida que vencía quedaba nula toda la visita.
- **Verificado:** pruebas de `union-prendas`, `tsc`, `eslint`. **No verificado:** en el navegador ni en el celular (no se reprodujo la falla en el celular de Felipe).
