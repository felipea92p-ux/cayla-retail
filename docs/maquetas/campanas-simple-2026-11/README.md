# Maqueta · Campañas y ofertas, más simple (2026-11-16)

> **Estado: propuesta para Felipe. Solo maqueta:** no toca el código del ERP, ni la base, ni producción. Datos inventados (el repo es público).

`index.html` se abre con la config `maqueta-referentes` (puerto 3031) o con doble clic. Va sobre la base de vidrio
(`../vidrio-base-2026-10/`). La barra negra elige la cara de los descuentos, abre cada hoja y cambia tema, ancho y movimiento.
`?ciego=1` esconde la barra y el análisis, para la prueba ciega.

## Lo que pidió Felipe

1. La fila de «Poner un %» con tres tarjetas: «Parecen 3 tarjetas sueltas al azar.» El escáner de arriba «no tiene mucha relevancia».
2. **Los descuentos, lo principal.** Cada uno dice «Descuento» y solo cambia su %. Al tocarlo se ven sus prendas, como en las
   campañas, y se agregan o se quitan sin drama, buscando por nombre o, en el celular, con la cámara.
3. **La configuración de una oferta, sin texto de más** («un 3x2 o un descuento se entienden a simple vista»), y una maqueta nueva
   de todo el módulo.

## Qué propone

| Hoy | En la maqueta |
|---|---|
| Escáner suelto arriba y tres tarjetas con el nombre de su campaña («Prendas de 10%», «Para liquidar», «Top ventas») | **Descuentos** es lo primero de la lista: «Descuento −10 %», «−15 %», «−20 %», cada uno con cuántas prendas tiene, y «Nuevo descuento» |
| Tocar un % abría un cajón con una lista de texto y «Quitar» por fila | Se abre a la derecha **igual que una campaña**: el % en grande, el buscador (también lee la pistola) y la grilla con la × de cada prenda. Lo último que entra va primero. Todo se deshace |
| Escanear abría una hoja con tres preguntas (a qué, cuánto, quién) | El % ya lo dice el descuento abierto: al leer un código solo pregunta **«Solo esta» o «Todo el modelo»**, y Enter repite la última respuesta. Quién lo hace se elige una vez (el responsable, a la vista) |
| En el celular, los pases montados uno sobre otro | Lista → descuento → **«Escanear prendas»**: la cámara lee varias seguidas, cada una con su «Deshacer», y «Listo» vuelve |
| La hoja de ofertas: 4 pasos, «Ya registradas», una franja de la campaña, frases de ayuda, «Regalo» y «Club» en «Pronto» | **Una sola hoja**: el ejemplo es la opción (−20 %, 3x2, 2 por S/ 60, 2.ª −50 %, −S/ 30), los números se cambian ahí mismo, las prendas en un toque, fechas y tiendas con atajos, y la caja de la derecha cobra una compra de ejemplo en vivo. Lo que no funciona no se muestra |
| El pase abierto: chips, barra de días, «vendidas en 30 días» (siempre «—»), «en las tiendas», «Ver sus ofertas», «Más» | El nombre, tres chips (estado, fechas, tiendas), **sus ofertas como carteles** («3x2 · Polos») y sus prendas. Lo demás, en «Más» |

## Las caras (lo único que se elige)

| Pieza | Caras |
|---|---|
| Los descuentos | **A · En la lista** (recomendada: descuentos y campañas son la misma fila, se aprende una vez) · B · Etiquetas colgadas (un riel con una etiqueta por %, más «de tienda», pero dos formas en la misma pantalla) |

Todo lo demás (el panel, la grilla, la cámara, las hojas) es igual en las dos.

## Medido (2026-11-16, en local, con los medidores de las skills)

- **Texto.** Contado en el navegador con el mismo criterio en la pantalla real (copia local) y en la maqueta:
  - frases de 8 palabras o más: hoy 6 en la pantalla y 7 en la hoja de ofertas; en la maqueta, 0 y 0;
  - palabras de la hoja de ofertas, en su primer paso: de 205 a 102, y lo que queda son nombres de opciones y precios de ejemplo.
- **Estados** (`/milimetro`): 0 hallazgos. Lo elegido lleva su ✓ además del color (WCAG 1.4.1).
- **Foco:** 27 de 27 controles con anillo y ninguno tapado. La × de la prenda lleva un anillo doble, oscuro y claro, que se ve sobre
  cualquier color de prenda (antes medía 1,06:1 sobre las claras).
- **Color** (`/color`, claro y oscuro): 38 textos en la pantalla y 45 en la hoja, ninguno bajo 4,5:1. Lo único que marca APCA (una segunda
  mirada, que no reprueba) son las versalitas de 11 px de los títulos de grupo, que son la pieza ya decidida.
- **Letra** (`/tipografia`): nada de lectura bajo 14 px; las versalitas, desde 11 px.
- **Espacio** (`/espacio`): múltiplos de 4. A 375 px todo se toca en 44 px; la × se dibuja de 36 y se toca en 44 (lo que hace `area-dedo`).
- **Movimiento:** al agregar o quitar solo entra lo nuevo y lo que se va sale corto. Nada se repite; la única excepción es la
  línea del visor de la cámara, que es la señal de espera. Quieto, todo responde igual.
- **Prueba ciega** (`/formidable`): ver la sección siguiente.

## Prueba ciega (`/formidable`, un agente sin contexto, 2026-11-16)

- **A los 5 segundos** entendió que la pantalla «sirve para manejar los descuentos de la tienda», y que podía agregar o quitar prendas,
  crear un descuento o abrir una campaña.
- **Tres tareas en palabras de tienda, las tres terminadas sin perderse:** −10 % a una blusa (2 toques), quitarle el descuento a un top
  (3 toques) y un «lleva 2 y paga 1» en blusas dentro de Black Friday (8 toques).
- **Lo que falló, ya arreglado:**
  - la tarjeta no cambiaba su nombre al pasar de 3x2 a 2x1;
  - la compra de ejemplo seguía con 3 prendas en un 2x1;
  - «Polos» no se desmarcaba al primer toque;
  - no veía «2x1» entre las opciones: ahora la tarjeta dice «3x2 · 2x1»;
  - no entendió «Insignias»: ahora va dentro de «Prendas», como «O por insignia».
- **Sin probar:** una colaboradora real. La nota de «sin manual» no llega a 10 sin ella.

## Lo que no cambia

Una prenda en un solo descuento por tienda (al agregarla a otro, se mueve), hasta 70 %, «todas las tiendas» solo para un líder,
el responsable que firma, el aviso «bajo costo», las cinco formas de oferta (−%, 3x2, N por S/ X, la N.ª al X %, por monto con escalones),
en qué prendas (toda la campaña, categorías, prendas, insignias), fechas y tiendas, los choques entre ofertas, el borrador,
repetir el año siguiente, imprimir etiquetas, cómo se ve en la web y desactivar.

## Lo que decides tú antes de construir

1. **Las campañas que hoy hacen de descuento** («Prendas de 10%», «Para liquidar», «Top ventas»): ¿pasan a ser Descuentos con sus mismas
   prendas? Tienen fecha de fin y un Descuento no la tiene.
2. **Dos descuentos con el mismo %** (uno solo de la tienda y otro de todas): ¿se ven como uno solo?
3. **«Regalo» y «Club»** desaparecen de la hoja hasta que funcionen.

## Para construir (después de elegir)

- La base ya tiene el Descuento: cada cajón de «Poner un %» (`rebaja_cajones`, ADR-0669, en producción desde el 2026-11-16) es un % por
  tienda. Lo nuevo es la pantalla: reemplaza `RebajasDeTienda`, `PonerUnPct` y `HojaRebaja` (PR #1898), y rehace `SellosPantalla` y `OfertasHoja`.
- Antes del código, `/milimetro diseñar` de las piezas nuevas (la fila de descuento, la oferta como cartel, la hoja). Después, `/chaos`,
  `/guia` y `/focus`.
- Del inventario del módulo, lo que conviene arreglar en el mismo trabajo: «vendidas en 30 días» y «en las tiendas» salen siempre «—»;
  una campaña cuyas ofertas eligen prendas dice «sin prendas»; textos que nombran botones que ya no existen («Configurar», «Editar»);
  desactivar falla si hay prendas marcadas a mano (también un cajón); imprimir y «ver en la web» dependen del descuento de siempre.
