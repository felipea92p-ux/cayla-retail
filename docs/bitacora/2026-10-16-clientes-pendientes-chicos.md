## 2026-10-16 (Clientes: el celular fijo ya no se disfraza y la lista pagina de 20 en 20 sin dejar la tabla vacía)
Qué hice: cerré dos pendientes chicos de Clientes. (1) `enmascararCelular` (`lib/proveedores-reglas.ts`, la pieza compartida con Proveedores,
los avisos del club y Clientes) tomaba cualquier número de 9 dígitos por celular: un fijo «044 123456» salía «9•• ••• 456». Ahora solo
enmascara lo que `validarCelular` da por celular (9 dígitos que empiezan con 9); todo lo demás, «•••», que es lo que ya hacía con un número
que no es de 9 dígitos. (2) Traje de `claude/clientas-pagination-bbf082` el cambio de 50 a 20 fichas por página (`POR_PAGINA`; esa rama
era del 10-oct y nunca llegó a `main`) y cerré el pendiente que ella misma dejó: una `?pagina=` que ya no existe (se archivaron fichas, o
la URL quedó vieja) mostraba la tabla vacía con el aviso de «no hay clientes» estando llena. `leerPaginaQueExiste`
(`lib/clientas-lista-reglas.ts`) baja a la última página que existe, y una `?pagina=` de nueve cifras (que desbordaba el `integer` de
`p_desde`) se recorta a `MAX_PAGINA`.
Por qué así: el celular era una mentira chica a quien no es líder (parecía un celular que no era) en una pieza de tres pantallas, así que
se arregló en la pieza y no en cada pantalla. La página que no existe se resuelve en el servidor, sin redirigir: `fn_clientas_lista` solo
trae el total junto a una fila, así que una página vacía no dice cuántas hay; se lee la 1 para saberlo y se lee la última, solo en ese caso
raro (una lectura normal sigue siendo una). La decisión vive en una función con la lectura inyectada para probarla sin base.
Felipe se lleva: nada que pegar (solo web, sin migración). Probado: `vitest` de la regla de la lista (con una base de juguete: la página 7
de 3 baja a la 3, una sola ficha en la última página al archivarla deja en la anterior, una lista sin fichas no insiste, una falla de la base
no se reintenta), de Proveedores (lo que enmascara como celular es exactamente lo que `validarCelular` acepta), de documento y de avisos del
club; `tsc`, `eslint`, `knip` y `knip:produccion` limpios. **No verificado en el navegador:** esta máquina no tiene Docker ni base local
(`supabase` no levanta), así que la pantalla no se vio con datos; para verlo, en `/clientas` con más de 20 fichas, `?pagina=99` debe caer en
la última y «Página X de X» debe coincidir con el pie.
