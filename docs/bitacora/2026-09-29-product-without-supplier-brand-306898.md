## 2026-09-29 (Un producto se puede crear sin marca ni proveedor, y se completa después — ADR-0283)

Qué hice: la mercadería llega a almacén antes de que alguien registre de qué marca es o quién la trajo, y el sistema no la dejaba entrar (marca y proveedor
eran obligatorios). Ahora Nuevo producto deja **Marca** y **Proveedor** vacíos —cada uno por separado— y la prenda se crea igual. Los dos campos se filtran entre
sí: elegir la marca deja solo a sus proveedores, elegir el proveedor deja solo sus marcas, y si hay uno solo se pone solo (con una línea que lo dice). Lo que falta
se ve con un chip ámbar «Sin marca ni proveedor» en Productos, con opciones «Sin marca» / «Sin proveedor» en los filtros, y en la pantalla final del alta con el
enlace a Editar. Al editar se completa lo que faltaba; lo que ya estaba guardado se cambia por otra cosa, no se deja en blanco. Un producto por reponer sin
proveedor sale en «A quién pedirle» como «Sin proveedor», para que no desaparezca del radar. Migración `20260930020000` **ya en producción** (2026-09-29).

Por qué así: vacío real y no una marca comodín «Por identificar», porque «no sabemos» no es una marca: el comodín metía un proveedor falso en Compras y en «A quién
pedirle» y la etiqueta habría impreso «Por identificar» a la clienta. Y no hizo falta un candado nuevo: la llave que ata marca con proveedor solo se comprueba
cuando hay **los dos**, así que «una pareja que nadie registró» sigue siendo imposible, aun con un INSERT directo. Se relajó una sola función (la que las cuatro
puertas de alta ya llamaban) en vez de reescribir las cuatro.

Felipe se lleva: (1) la migración ya está en producción (ensayo que se revirtió solo, aplicada y verificada por efectos); falta desplegar la web; (2) el censo de Conteo
(`AltaAlVuelo.tsx`) sigue exigiendo marca y proveedor —lo está reescribiendo otra sesión—; son 3 líneas cuando se libere, y es donde más pega (el censo de TRU);
(3) verificado en el navegador de punta a punta en local (crear sin marca → chip → filtro → editar y completar) y 19/19 pruebas SQL; la web todavía no se probó contra producción.
