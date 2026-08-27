import { CLINIC_LOGO_SRC, CLINIC_NAME } from "@/lib/clinic-branding";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
  xl: "h-36 w-36",
} as const;

type Props = {
  size?: keyof typeof sizeClass;
  className?: string;
};

export function ClinicLogo({ size = "md", className }: Props) {
  return (
    <img
      src={CLINIC_LOGO_SRC}
      alt={`${CLINIC_NAME} logo`}
      width={144}
      height={144}
      className={cn("object-contain", sizeClass[size], className)}
    />
  );
}
