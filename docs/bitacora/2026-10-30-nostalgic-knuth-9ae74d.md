## 2026-10-30 (Las otras 41 pruebas que eligen «la primera prenda que encuentres» no están rotas)

Qué hice: medí, sorteo por sorteo, las 41 pruebas de `scripts/pruebas/` que —como hacían las de CLAURE antes de
`bff3954ea`— toman «la primera variante o el primer producto por id». Ninguna es una bomba: 41 de 41 en verde en
todos los sorteos que su propia consulta admite: 1 190 corridas válidas de 1 500 hechas (las otras 310 son offsets que se pasaron del número de candidatas). Lo que estaba mal era la hipótesis, no el código:
las de CLAURE no fallaban por elegir una prenda al azar, sino por elegirla **y cambiarle el dueño**
(`update retail.productos set empresa_id`), que reescribe hacia atrás de quién era la historia que ya había en la
base. Estas 41 solo **suman** sobre la prenda que les toca, o miden en relativo (una foto «antes» en tabla temporal,
«más lo que ya hubiera hoy»), o se crean su propia variante dentro de la transacción.

Por qué así: una bomba del sorteo se enumera poniendo `offset K` donde la prueba dice `order by … id limit 1` y
corriéndola con cada K. Antes de creerle al barrido lo hice contra una suite de CLAURE en su forma ANTERIOR al
arreglo: salió roja en 9 de 42 sorteos con la firma exacta del CI (`se esperaba 3|1 y salió 2|1`), así que el arnés
ve la bomba cuando la hay. Dos trampas que costaron corridas enteras: psql responde en el idioma de la máquina (la
primera versión contaba cada `\gset no retornó renglón alguno` como fallo y daba «43 de 49 rojos» donde la verdad
era 0 de 6), y varias pruebas atrapan el error de psql y lo reportan como fallo propio (`ERROR_DE_SCRIPT`), así que
el fin del rango no se reconoce por el mensaje sino por la forma: una cola contigua que llega hasta el último
sorteo y empieza justo en el número de candidatas. Se verificó contando las candidatas en la base: 42, 6 y 3.

Felipe se lleva: el rojo intermitente del CI no era «cualquier prueba que elige una prenda al azar» — era una
prueba que le cambia el DUEÑO a una prenda prestada. Elegir al azar y sumar encima es inofensivo; elegir al azar y
reinterpretar lo que ya estaba escrito es lo que descuadra. Esa es la regla para la próxima prueba que se escriba,
y es más barata de respetar que 41 archivos cambiados sin necesidad.
