## 2026-09-29 (Nuevo producto guía a quien lo llena: qué falta y qué sigue, en el campo mismo)

Qué hice: probé «Nuevo producto» en el navegador como lo vería alguien nuevo y encontré por qué la trabajadora se perdía: el
«qué falta» vivía en letra chica al fondo de cada paso, los campos no decían nada, el paso 3 salía con ✓ «Listo» sin abrirlo y con
cero colores, y al elegir categoría el paso 2 se abría cortado y sin cursor. Ahora cada campo lleva una marca (✓ hecho, «Sigue
aquí» con un tinte suave, anillo = falta, punteado = opcional), el pie de cada paso dice «Faltan: Nombre · Marca · Tejido» con cada
cosa tocable (te lleva al campo y lo destella), la ficha y la barra del celular tienen un «Siguiente: …» tocable, y un paso solo
lleva ✓ si lo abriste (ADR-0284). Reglas puras en `lib/alta-producto-guia.ts` (41 pruebas).

Por qué así: la guía NO agrega reglas de negocio —una prueba obliga a que diga lo mismo que `problemasAlta` sobre lo que bloquea
crear—; solo hace visible lo que ya se sabía y en el lugar donde mira la persona. Los colores son «sugeridos»: se señalan pero no
bloquean (un llavero no lleva color). Nunca se desplaza la página mientras se teclea. En celular el pie no se pega (la barra de la
ficha ya lo hace). Movimiento como el ADR-0136: sin bucles ni rebote, apagado con movimiento reducido.

Felipe se lleva: correr `/productos/nuevo` con una cuenta real y pasar los cuatro pasos siguiendo solo la etiqueta «Sigue aquí»;
tocar un «Falta: …» del pie y ver que lleva al campo. En la base LOCAL hay que tener patrones (la de desarrollo no trae; yo sembré 3
de prueba). Tres decisiones tuyas quedan en el ADR: cuánto debe notarse, si Indumentaria exige color, y subir «Seguir →» a la barra
del celular. Solo web, sin migración; no se creó ningún producto en la prueba.

## 2026-09-29 (b) (Editar producto dice qué le falta a la ficha; los combos se despegan del fondo)

Qué hice: (1) la lista flotante de los combos ahora se distingue del fondo (borde de tinta suave y sombra de elevación, `.lista-flotante`)
y su opción activa se resalta en un terracota muy tenue (`.opcion-activa`, antes arena, casi el color del fondo): alcanza a los combos
de toda la app. (2) «Editar producto» gana una tira arriba, «Para completar esta ficha», con lo que le falta a la prenda —fotos por
color, tejido y patrón— como botones que llevan al campo; los campos que llegaron pendientes llevan su marca y pasan a ✓ al completarse;
si se completa todo, dice «Ficha completa». No bloquea guardar. Reglas en `lib/producto-ficha-guia.ts` (13 pruebas).

Por qué así: Editar no es un recorrido sino mantenimiento, y su barra «Tienes N cambios sin guardar» ya resolvía «qué sigue» al
cambiar algo; lo que faltaba era saber qué le falta a la prenda. Solo cuenta lo que importa (una lista que regaña por todo no se lee)
y una ficha que ya venía completa no muestra nada.

Felipe se lleva: abrir una prenda sin fotos ni tejido (p. ej. «Blusa Emma» en la base local), tocar «Fotos de 2 colores» y ver que
lleva a la tarjeta de fotos; elegir un tejido y ver que sale de la tira. Y mirar un combo fuera del alta (filtros de Productos o de
Compras) para decidir si el borde y la sombra nuevos se quedan en todos. Falta ver en pantalla el ✓ de fotos tras subir una.

## 2026-09-29 (c) (La skill /focus y los modales: el control que sigue se ilumina)

Qué hice: creé la skill `/focus` (recorre las pantallas en construcción, avisa cuáles no tienen la guía y después la implementa) con su
escáner `pnpm focus`, y la extendí a los **modales**. Dentro de un modal el control que sigue se **enciende**: halo suave alrededor, la
caja de texto o el combo de adentro más claros, marca «Sigue aquí»; al completarlo, la luz pasa al siguiente. Sirve a cualquier control
(caja, combo, chips, interruptor, un grupo). Piezas nuevas: `useGuiaCampos`, `CampoGuiado`, `PieGuia`; piloto en «Registrar clienta».
Los 90 modales con campos entraron al registro y a la prueba obligatoria: uno nuevo no puede nacer «pendiente».

Por qué así: la guía no cambia qué se puede confirmar en un modal (sale de su validación real), y una regla de grupo («basta uno de tres
datos») es un solo campo virtual que enciende el bloque. La luz se pinta por detrás y por fuera para no correr nada. Antes la prueba no veía
los modales y la única barrera era la casilla del PR; ahora es mecánica, igual que con las pantallas.

Felipe se lleva: abrir Clientas ▸ Registrar clienta y ver la luz en «Identificación»; escribir un DNI y ver que se apaga y el pie dice «Todo
listo». Decidir si los modales de un solo control (un motivo, una confirmación) llevan la luz o se declaran «no aplica» (la skill los propone
así). Quedan 89 modales por hacer, módulo por módulo, con `/focus <módulo>`.
