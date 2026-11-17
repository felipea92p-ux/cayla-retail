// El monto como lo dice la caja: «S/79.90», sin espacio (así lo escribe Vender desde V1).
//
// Vive aquí, solo, y NO dentro de `components/PuntoDeVenta.tsx` (ADR-0674, actividad 7): estaba exportado desde la pantalla de Vender, y
// toda pieza que lo importaba —Caja, Apartados, hasta las fichas de medio de pago de Mis compras— se llevaba con él la pantalla de Vender
// entera (298 archivos). Lo vigila `lib/vender-no-se-arrastra.test.ts`.
export const money = (n: number) => `S/${n.toFixed(2)}`;
