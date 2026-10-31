import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SectionCard({
  title,
  description,
  icon,
  className,
  action,
  headerLeft,
  children,
}: {
  title: string;
  description?: string;
  icon: IconSvgElement;
  className?: string;
  action?: ReactNode;
  headerLeft?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        {headerLeft}
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={icon}
            color="#FFFFFF"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyRow({ label }: { label: string }) {
  return (
    <p className="rounded-md px-3 py-14 text-center text-sm text-white">
      {label}
    </p>
  );
}
