import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type CommonProps = {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "default" | "large";
};

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  icon,
  className = "",
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      type={type}
      {...props}
    >
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

type ButtonLinkProps = CommonProps & {
  href: string;
};

export function ButtonLink({
  children,
  href,
  icon,
  className = "",
  variant = "primary",
  size = "default",
}: ButtonLinkProps) {
  return (
    <Link className={`button button--${variant} button--${size} ${className}`} href={href}>
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </Link>
  );
}
