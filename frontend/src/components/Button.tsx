import type { ComponentPropsWithRef } from "react";

type Variant = "primary" | "accent" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong focus-visible:outline-primary",
  accent: "bg-accent text-white hover:bg-accent-strong focus-visible:outline-accent",
  ghost:
    "border border-line bg-paper text-ink hover:bg-paper-deep focus-visible:outline-primary",
};

/** 撞色按鈕；min-h-11（44px）以符合觸控區規範（SC-008）。 */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-4 py-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
}
