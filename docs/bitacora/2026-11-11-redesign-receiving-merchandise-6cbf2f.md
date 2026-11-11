# 2026-11-11 · Recibir mercadería, maqueta «ordenada» (tres direcciones)

- **Qué:** maqueta de Recibir en `docs/maquetas/recibir-ordenada-2026-11/`, sobre el marco real del ERP (lateral abierto o plegado, cabecera y CSS
  compilado capturados de local) y con las piezas reales (`rc-*`). Tres direcciones de Contar con un orden distinto —A · Mesa de tres, B · Tablero,
  C · Mostrador— más Revisa y cierra, Cerrado, Sin aviso, celular y oscuro; «Hoy» alterna con la captura quieta de producción local del mismo
  envío. Solo maqueta: el ERP no cambia. Se agregó la configuración `cayla-retail-dev-base-prod` a `.claude/launch.json` (el ERP contra la base
  aislada con esquema de producción, puerto 59421).
- **Por qué:** Felipe: muchos campos y textos repartidos, nadie lee el resumen de la derecha, y con el menú plegado sobra espacio «que se lo queda
  un simple contador». Decidió 10 cosas antes de empezar (ver el README) y después pidió tres maquetas muy elaboradas con órdenes distintos,
  saltándose reglas si hace falta.
- **Falta:** que Felipe elija mirando (una, o qué de cada una) y decida lo del README («Lo que hay que decidir antes de pasarla a local»). Pasarla a
  local es un cambio de `components/recepcion-conteo/` y `vidrio/recibir-mesa.css`, sin migración ni RPC.

## Tarde · «Dos mitades» (la que pidió Felipe al ver las tres)

- **Qué:** maqueta nueva en `docs/maquetas/recibir-dos-mitades-2026-11/`: solo las categorías y el contador, del mismo tamaño y con el mismo esqueleto
  (cabeza · cuerpo · pie); las tallas y los colores se reparten en una hoja de 880 px. Trae 15 casos para probar (número raro, repartió de más, sin
  conexión, otra persona contó, llegó algo que no estaba, envío de 36 modelos…), «Deshacer» en lo que pisa o borra, y «Por qué así» con las técnicas.
  Usa el CSS y el marco de `recibir-ordenada-2026-11` (las dos carpetas van juntas).
- **Por qué:** Felipe: las tres direcciones se veían «muy apretujadas»; quiere que se entienda al instante y que nadie busque media hora una opción.
- **Falta:** que Felipe la mire y decida lo de su README (umbral del número raro, guardar tallas a medias desde la hoja, crear la prenda aquí, el
  conflicto entre dos personas). Verificada a 1440, 1920 y 375 px, en claro y oscuro.

## Noche · tres ajustes de Felipe a «Dos mitades»

- **Qué:** (1) los filtros se condensaron en un botón «Filtros» al lado del buscador y se abren solo cuando se piden; el filtro puesto queda dicho en una
  línea. (2) «Llevar al stock ahora» es el botón principal al terminar de repartir (antes vivía en «Más»), se puede llevar una parte, y la hoja de tallas
  trae «Guardar y llevar N al stock»; caso nuevo `llevar` y filtro «Por llevar al stock». (3) Quedó un solo «Revisar y cerrar», en el pie de la lista; en
  el último modelo el contador lleva al que quedó pendiente, y en el celular lo trae la isla cuando ya está todo contado.
- **Por qué:** Felipe: el buscador muy largo y muchos filtros; casi siempre llevan la prenda al stock desde el conteo para venderla ya; y dos botones
  «Revisar y cerrar» a la vez eran redundantes.
- **Falta:** lo mismo de arriba, más confirmar el punto 7 del README (el peso de «Llevar al stock» es stock: lo decide Felipe). Verificado a 1440 y 375 px.

## En local · Contar en dos mitades (ADR-0645)

- **Qué:** la maqueta «dos mitades» pasó al ERP en siete actividades con su commit cada una (`/construir`), solo web: la lista se queda con
  todo lo del envío (avance, buscador, un botón «Filtros», quién cuenta y el único «Revisar y cerrar»); el contador va en tres bloques con
  pie fijo; las tallas y colores se reparten en una hoja que se guarda sola, y «Agregar talla o color» abre la hoja completa de la prenda;
  «Llevar al stock ahora» es el botón principal; «¿Pasó algo con esta prenda?» va a la vista; en el celular la pantalla es el contador, con
  la lista en una hoja y la isla abajo. Se fueron `ResumenDelEnvio` y `TiposDelEnvio`. El cierre encontró y corrigió cuatro cosas: el ✓ de la
  carta de colores no se leía en oscuro, el aviso de asistencia aplastaba la lista, «Llegaron las N» medía 40 px y no 52, y una fila
  agregada a mano cortaba «10 contadas» en la lista angosta.
- **Por qué:** Felipe: nadie leía el resumen, había texto por todos lados y con el menú plegado sobraba media pantalla. Las hojas se
  diseñaron con él al llegar a cada una («las de la maqueta no me convencen»): por eso «Agregar talla o color» no usa combos.
- **Falta:** que Felipe mire el celular y las mitades apiladas; `/chaos` (a la base local compartida le faltan 51 migraciones de esta
  rama, y sus instrumentos solo conocen esa base); la prueba ciega de `/formidable` (un filtro de la API frenó al agente) y sus tres
  cambios propuestos; las decisiones abiertas del backlog de la rama; y el PR, que se abre con `/abrir-pr` cuando Felipe lo pida.
