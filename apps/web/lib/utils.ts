// `cn` es el único utilitario que shadcn/ui exige (ADR-0037). El CLI actual lo importa
// desde el paquete `cn` (de shadcn-ui, reemplazo compilado de clsx + tailwind-merge), así
// que esta ruta `@/lib/utils` y `"cn"` tienen que ser LA MISMA implementación — de lo
// contrario un componente generado y uno escrito a mano fusionarían clases distinto.
export { cn } from "cn";
