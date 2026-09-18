export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="text-lg font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">This screen is being rebuilt on the new design system.</p>
      </div>
    </div>
  );
}
