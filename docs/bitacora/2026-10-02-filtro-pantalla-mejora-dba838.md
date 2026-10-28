# 2026-10-02 · La barra de filtros de Productos dice la verdad (tanda 1, ADR-0308)

- QUÉ HICE: `/pantalla` de la barra con datos de producción (máximo real S/ 119 contra un control de 0 a 999; 179 de 284 opciones llevan a 0; «Sin stock» medido en la red) y 19 decisiones de Felipe. Tanda 1, sin migración: el estado sigue a la URL, la píldora compartida dice su nombre en seis pantallas, un solo «Ordenar por» con «Más recientes» por defecto, «Activos» por defecto, cajas de precio con límites reales, panel abierto en la computadora en filas «Prenda / Gestión», hoja en el celular, «/» y «Copiar enlace».
- POR QUÉ ASÍ: la URL es la única verdad y lo escrito se aplica sobre la URL vigente (un clic dentro de los 350 ms se perdía); la base de la tanda 2 se agrega al lado de `fn_productos` para no dejar caída la web entre pegar y fusionar (#444).
- QUÉ SE ROMPERÍA SIN ESTO: un chip «Hasta S/100» sobre una lista sin filtrar, un precio que no existe, y una colaboradora que no sabe si «ADIDAS» es la marca o el proveedor.
- Verificado con Chrome sin ventana contra una base propia al día con `main` (`supabase start` en `/Volumes/CAYLA-SSD/Developer/.pila-filtro-dba838`, puertos 546xx): la base local compartida va ~60 migraciones atrás (le falta `20260929180000`, el orden «recientes») y no se tocó.

## Tanda 2 (la base)

- QUÉ HICE: dos migraciones nuevas, sin tocar `fn_productos`: un filtro único por variante (color, talla, precio, temporada y «hay en la sede» exigidos a la MISMA variante), el listado con Talla, Color por familia, Temporada, «Por completar» y Disponibilidad en la sede y en la red, un buscador sin tildes por categoría y color, y los conteos por opción con tramos de precio. La pantalla esconde las opciones vacías.
- POR QUÉ ASÍ: conjuntos, no adivinanzas: la intersección se hace sobre la variante (si no, «negra hasta S/ 80» trae una negra de S/ 120) y cada conteo se calcula sin su propio filtro, sobre la misma definición que la lista; la prueba exige que cada número sea el total al elegir esa opción.
- QUÉ SE ROMPERÍA SIN ESTO: el 63 % de las opciones seguiría llevando a «Ningún producto calza», y Lima seguiría sin poder preguntar «¿qué no hay aquí?».
- Verificado contra la base propia `cayla-filtro-dba838`; las pruebas SQL vecinas (orden, cifra única, sin marca, alertas, estado en bloque) siguen en verde. Felipe pegó las dos en producción ANTES de fusionar (huellas verificadas); #724 se fusionó y Vercel lo publicó el 2026-10-02 a las 22:06 UTC.
