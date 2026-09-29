## 2026-09-29 (Tejido, Patrón, Temporada y Etiquetas se ven con la misma grilla en «Nuevo producto»)

Qué hice: Felipe mostró dos capturas del paso 3 del alta y pidió que Temporada y Etiquetas se vean igual que Tejido
y Patrón (grilla de tarjetas con imagen + «Ver todos»), y que a Etiquetas además se le quite la barra de búsqueda
que tenía siempre visible. Antes de tocar código le hice preguntas concretas (`AskUserQuestion`) sobre qué,
exactamente, corregir en cada campo. Con la respuesta: extraje el marco de tarjeta que ya usaban Tejido/Patrón a un
archivo propio (`GrillaMuestras.tsx`), lo reusé sin cambiarles el comportamiento, y lo apliqué a los otros dos:
Temporada reemplaza su `<select>` por la misma grilla (con «Ninguna» como una tarjeta punteada más, para heredar la
de la categoría); Etiquetas pasa a una grilla chica (lo marcado y lo que «ya aplica sola» nunca se esconden) + «Ver
todos», y el buscador/crear se mudó dentro de esa hoja, agrupado como ya estaba (Rotación/Artesanal/Campaña/General).
ADR-0276.

Por qué así: cuatro filas de un mismo paso resolviendo «elegir de una lista con imagen» de tres maneras distintas es
exactamente el problema que ADR-0261 ya había resuelto en Atributos — acá faltaba resolverlo en el alta. Un solo
archivo con el marco de tarjeta evita que las cuatro deriven otra vez con el tiempo (el mismo error que motivó
ADR-0261).

Verificado sin tocar la base (el Supabase local de este repo está compartido con otras sesiones y quedó a mitad de
migrar — no se le aplicó nada): página temporal bajo `/login` (fuera del `proxy.ts` de sesión) con las tres piezas
montadas con datos de mentira, a 1440 px y a 375 px; se borró al cerrar la tarea. Patrón queda pixel-igual al de
antes. `pnpm typecheck`, `pnpm lint` y las 227 suites (152.704 casos) en verde.

Felipe se lleva: sin migración, nada que pegar en producción — es solo la web. El Supabase local de `cayla-retail`
quedó atrás en migraciones (sin `retail.etiquetas` ni `retail.temporadas`, 0 categorías): si alguien necesita probar
esta pantalla contra datos reales en local, primero hay que ponerlo al día (o confirmar que nadie más lo está usando
antes de tocarlo).
