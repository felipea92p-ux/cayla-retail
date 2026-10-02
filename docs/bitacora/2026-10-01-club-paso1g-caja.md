## 2026-10-01 (Club, tanda 1g: la caja ya no registra el club; ella se une desde el cartel)

Qué hice: Cobrar y Clientas ▸ Nueva clienta registran solo con el documento (DNI con el nombre del padrón; carné o
pasaporte con el nombre escrito). Si la clienta no es socia, su tarjeta dice «Pídele que escanee el cartel del club» y
se actualiza sola cuando ella se une. El vale de aniversario se usa en Cobrar como el cupón de cumpleaños, y va uno de
los dos por compra. Se retiraron «Invitar», el QR personal y «Llegó un mensaje de WhatsApp». La BAJA sigue en la ficha.

Por qué así: G-1, G-2, G-7 y G-13 del ADR-0288 (act. g). El vale se reparte entre las prendas en proporción a lo que
cobra cada una, en céntimos exactos, con una regla que la base puede repetir igual (`lib/club-aniversario-canje-reglas.ts`).

Felipe se lleva: la web espera la migración de la 1g (`resumen_clienta_caja` con el vale y `registrar_venta` con
`p_canjear_aniversario`), y la base tiene que repartir el vale con la MISMA regla, o la venta no cuadra.
