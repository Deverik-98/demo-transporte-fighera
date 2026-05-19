import { cn } from "../ui/utils";
import { BRAND_LEGAL_NAME } from "../../lib/brand";
import logoTransporteFighiera from "../../../assets/brand/logo-transporte-fighiera.png";

export type BrandLogoVariant = "full" | "compact" | "header-light";

const sizeClasses: Record<BrandLogoVariant, string> = {
  compact: "h-8 w-auto max-w-[4.5rem] sm:max-w-[5rem]",
  full: "h-9 w-auto max-w-[min(100%,11rem)] sm:h-10 sm:max-w-[13rem] md:max-w-[15rem]",
  "header-light": "h-9 w-auto max-w-[9.5rem] sm:max-w-[11rem] brightness-0 invert",
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
};

/** Logo oficial (PNG). Archivo: src/assets/brand/logo-transporte-fighiera.png */
export function BrandLogo({ variant = "full", className, imgClassName, priority = false }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <img
        src={logoTransporteFighiera}
        alt={BRAND_LEGAL_NAME}
        width={200}
        height={48}
        className={cn("object-contain object-left", sizeClasses[variant], imgClassName)}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}
