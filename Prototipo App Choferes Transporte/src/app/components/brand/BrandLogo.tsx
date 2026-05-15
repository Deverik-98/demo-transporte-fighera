import { cn } from "../ui/utils";
import logoTransporteFighera from "../../../assets/brand/logo-transporte-fighera.png";

export type BrandLogoVariant = "full" | "compact" | "header-light";

const sizeClasses: Record<BrandLogoVariant, string> = {
  compact: "h-8 w-auto max-w-[4.5rem] sm:max-w-[5rem]",
  full: "h-10 w-auto max-w-[min(100%,12rem)] sm:h-11 sm:max-w-[14rem]",
  "header-light": "h-9 w-auto max-w-[9.5rem] sm:max-w-[11rem] brightness-0 invert",
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
};

/** Logo oficial (PNG). Archivo: src/assets/brand/logo-transporte-fighera.png */
export function BrandLogo({ variant = "full", className, imgClassName, priority = false }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <img
        src={logoTransporteFighera}
        alt="Transporte Fighera S.R.L."
        width={200}
        height={48}
        className={cn("object-contain object-left", sizeClasses[variant], imgClassName)}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
