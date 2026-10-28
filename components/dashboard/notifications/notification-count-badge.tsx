import { cn } from "@/lib/utils";

interface NotificationCountBadgeProps {
  count: number;
  className?: string;
}

export function NotificationCountBadge({ count, className }: NotificationCountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] leading-none font-bold text-destructive-foreground ring-2 ring-background",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
