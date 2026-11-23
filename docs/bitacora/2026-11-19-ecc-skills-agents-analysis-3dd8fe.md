
## 2026-11-19 (Qué sirve del repo de skills `affaan-m/ecc`, y qué reglas nuestras convendría cambiar)
Qué hice: revisé las 327 skills, los 74 agentes, los hooks y las reglas de `affaan-m/ecc` contra las 35 skills de `main`, con
tres revisores en paralelo cuyas citas comprobé en el código. No se instala nada: ninguna pieza reemplaza a una skill propia, y
sus hooks corren en cada herramienta (uno guarda en disco lo que devuelve cada llamada). Quedaron 8 ideas para adaptar, 3 tareas
de una vez y 3 decisiones de negocio (`docs/backlog/2026-11-19-ecc-skills-agents-analysis-3dd8fe.md`). Después juzgué cada choque
de ecc con nuestras reglas contra lo que hacen los mejores (`docs/investigacion/2026-11-19-ecc-reglas-que-chocan.md`).
Por qué así: en la mayoría de los choques gana CAYLA, porque ecc escribe para volúmenes que no tenemos. Pero cuatro reglas
compensan con texto o candados un diseño que se podría cambiar: `CLAUDE.md` de 143 KB (el 91 % ya lo vigila una prueba), el SQL
pegado a mano con su aparato de deriva, el movimiento con 29 excepciones en seis semanas y el loader que tapa también el lateral.
Un revisor escéptico tumbó en parte cada propuesta, y sus objeciones comprobadas quedaron escritas. El pipeline de migraciones
tal como lo proponen ecc y Supabase no es seguro aquí: el CLI aplica todo en una sola sesión (`pg_temp`, 2026-10-23) y las
pegadas no dejan fila en su historial (ADR-0251).
Felipe se lleva: el orden recomendado (primero partir `CLAUDE.md` en `.claude/rules/` dejando las reglas transversales en la
raíz; después la lista de movimiento a un registro; un solo canal a producción) y, para cada propuesta, qué gana, qué paga y que
la decisión es suya. No se tocó configuración, código ni producción.
Segunda vuelta, a pedido de Felipe (diseño, color y flujo, aunque haya que romper reglas): el problema de la estética no es una
pieza sino que faltan escalas debajo (13 opacidades de tinta, 37 tamaños sueltos, 16 radios de desenfoque, el mismo azul con
cuatro significados). Un escéptico frenó con evidencia sacar la Aurora, reabrir las versalitas y el título de 46 px, y cambiar el
movimiento apagado por defecto: Felipe ya los eligió mirando, con alternativas delante. En el flujo: el tablero de sesiones tiene
143 filas «activas» a mano, los choques vienen de los archivos donde escriben todos y no de los componentes grandes, y las skills
obligatorias sin CI casi no se marcan. Se corrigieron en la memoria tres PR que figuraban abiertos y ya estaban fusionados.
2026-11-23, la lámina de escalas (`/milimetro proponer`, `docs/milimetro/laminas/2026-11-23-escalas/`): dos preguntas con fotos de
pantallas reales del ERP local (datos inventados, sin guardar nada) y el contraste medido en cada foto. El tono del texto que acompaña
(hoy, tinta en tres tonos, o tinta y café): ninguna baja de 4,5:1, y en oscuro la tinta en tres tonos deja la mitad de textos débiles para
APCA (46 contra 94). Las cifras: DM Sans no trae tabulares (medido), Inter y la Garamond sí. Al medir se retiró el tamaño óptico de DM
Sans, que no cambia nada visible en la letra de lectura. Falta que Felipe elija.
