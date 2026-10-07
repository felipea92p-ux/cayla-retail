## 2026-10-07 (La píldora de las pestañas calza con la elegida desde la primera carga)
Qué hice: `IndicadorDeslizante` (la píldora oscura de `Pestanas`, ADR-0358) ya no ignora a ciegas el primer aviso de su `ResizeObserver`:
lo compara con la última posición que puso y, si la pestaña elegida quedó en otro lugar, la recoloca sin viajar. Además observa todas las
opciones por su borde, no solo la elegida. Verificado en Chromium contra el ERP local, Análisis a 1280 px: con DM Sans llegando justo después
de colocarse la píldora, antes quedaba corrida 21,7 px en 4 de 4 cargas y ahora en 0; a 375 px, con la fila desbordada y una pestaña anterior
que se ensancha, antes quedaba 30 px corrida tapando la cuenta de la vecina y ahora calza. Barrido con la fuente retrasada de 0 a 3 s en
caché vacía: 0 de 13 corridas. El viaje entre pestañas no cambió (450 ms, en Análisis y por enlace en Movimientos). Tipos, lint y las 375
suites de vitest en verde.
Por qué así: si la fuente terminaba de cargar entre la medida del efecto y el primer aviso, ese aviso ya traía el tamaño nuevo y se
descartaba (Análisis, primera carga: 24 px a la izquierda). Comparar con lo puesto conserva lo que buscaba el descarte (no cortar el viaje en
curso, porque ese primer aviso coincide) sin perder un cambio real. `document.fonts.ready` habría tapado solo la fuente, no una cuenta que
llega ni una pestaña que se ensancha; y observar solo la elegida no ve que se corre cuando crece una de antes y la fila ya no puede crecer.
Felipe se lleva: ninguna pantalla cambia de aspecto ni de movimiento; la píldora de toda pestaña de vista (Análisis, Movimientos,
Comprobantes, Finanzas…) calza desde la primera carga. Sin migración.
