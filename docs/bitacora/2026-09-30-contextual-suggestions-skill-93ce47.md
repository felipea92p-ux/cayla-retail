## 2026-09-30 (Los ejemplos de Nuevo producto ya siguen la categoría, y la regla es obligatoria en todo el ERP)

Qué hice: en Nuevo producto, elegir «Casacas» dejaba el nombre sugerido en «Blusa Aurora» y la descripción en «Manga globo…»: los ejemplos
estaban escritos a mano en el JSX y no miraban la categoría. Creé la skill `/sugerir` (`.claude/skills/sugerir/SKILL.md`) con su escáner
`pnpm sugerir` (`scripts/sugerir/escanear.mjs`, con pruebas), la corrí sobre `/productos/nuevo` y la volví obligatoria como la Guía de foco
(ADR-0290). Nombre y Descripción ahora salen de una ficha por categoría (`lib/sugerencias-alta-producto.ts`, 42 categorías en 6 familias);
«+ Nueva talla / tejido / patrón» sigue a la familia; «+ Nuevo color» sigue a la familia de color, con el código coherente con el nombre.
Ninguno repite lo que el catálogo ya tiene (los ejemplos de antes, «Palo de rosa» y «Verde botella», ya existían). La regla: `lib/sugerir.test.ts`
falla si un archivo nuevo trae un ejemplo escrito a mano sin derivarlo ni marcarlo `// sugerir-fijo: <por qué>`; los 69 archivos de antes
quedan como deuda en `lib/sugerir-archivos.ts`, que solo baja. Escáner probado en el CI.

Por qué así: las familias y categorías las crea un Líder sin deploy y se renombran, así que la clave es `prefijo`/`familia.codigo` y todo termina
en un texto neutro, nunca en el ejemplo de otra familia. Nombre y descripción salen de una tabla curada y no de un producto real, porque un dato real
invita a copiarlo y chocaría con el aviso de parecidos. La prueba web importa el escáner en vez de espejarlo, para que haya una sola definición de
«ejemplo estático». Recorrer la pantalla a 375 px encontró lo que el escritorio no: 24 de 42 descripciones se cortaban a media palabra; ahora hay
un tope de 36 caracteres con su prueba.

Felipe se lleva: las 42 categorías tocadas una por una en la interfaz real dan exactamente lo que dice la función (escritorio y 375 px, 0 recortes;
la más larga usa 256 de 279 px). Con texto ya escrito, cambiar de categoría no lo toca. Los textos de ejemplo los inventé yo y están en un solo archivo
para que los vetes: `FICHAS_POR_CATEGORIA` en `lib/sugerencias-alta-producto.ts`. Falta arreglar los 69 archivos de la deuda, de a una pantalla con `/sugerir <ruta>`.
