## 2026-10-05 (Mix de categorías: cómo lo deciden Zara, Gap, LVMH y Ralph Lauren, con matemática, antes de construir la actividad 12)
Qué hice: investigué, con 5 investigadores web y un escéptico que abrió las fuentes, qué modelos y algoritmos publican las grandes casas
para el mix por categoría y los apliqué a las cifras de TRU. Quedó en `docs/investigacion/2026-10-05-como-deciden-el-mix-zara-gap-lvmh-ralph-lauren.md`.
Resultado: nadie publica su mix de piso ni existe un modelo que lo decida; con la elasticidad de espacio medida (0,17, supermercado) afinar el mix vale
entre ≈ 0,5 % y ≈ 3 % de ventas. El primer mix del 4-oct no cambia (el 48 % de polos cae dentro de la horquilla 47–51 % que dan los datos).
Por qué así: el peso `días ÷ (días + 28)` de la venta propia cuenta días y no ventas, y equivale a decir que TRU y la industria difieren ±1,7 puntos;
el tope de ±3 puntos al mes tiene el tamaño del ruido de un mes de ventas, así que necesita una zona muerta. Se corrigieron tres cosas ya escritas (Sport Obermeyer
30 % no era la práctica, Levi's reexpresó cifras y no la definición, y dos cifras mías del chat).
Felipe se lleva: tres decisiones por tomar antes de construir (peso en prendas confirmadas con τ visible, zona muerta del tope, registrar el espacio por
categoría y semana desde ya) y una cifra por reconciliar: la cobertura de TRU da ≈ 3,5 semanas con los 4 días de venta contra «7 a 9» del ADR-0329.

## 2026-10-05 (Plan del piso, primera entrega: grupos del mix, propuesta frente al piso real y foto semanal del espacio)
Qué hice: construí en Inventario ▸ Plan del piso lo que decidimos tras la investigación, en solo lectura y en tres cortes verificados: **Grupos** (a qué grupo
del mix va cada una de las 42 categorías; la propuesta queda «por revisar» y el líder la confirma o cambia con su firma), **Propuesta** (por sede, qué le tocaría a
cada grupo en las prendas que caben, frente a lo que cuelga y a lo que vendió la sede) e **Historia** (la foto del espacio que el cron toma cada lunes). ADR-0352.
Por qué así: el peso de la venta propia se mide en prendas confirmadas y no en días, y cada porcentaje de venta lleva su rango, porque con tan pocas ventas un 0 % no
dice «no se vende» sino «todavía no sabemos»; y la foto del espacio es lo único que permitirá medir cuánto rinde el lugar en ropa (nadie lo ha medido).
Felipe se lleva: pegar las dos migraciones en producción (`20261006100000` y `20261006110000`, en ese orden y antes de publicar la web), darle el módulo «Plan del piso» a
quien corresponda, confirmar las 42 categorías en la pestaña Grupos, decidir si la foto pasa de semanal a diaria, y reconciliar la cobertura de TRU (≈ 3,5 semanas con
4 días de venta contra «7 a 9» del ADR-0329).
