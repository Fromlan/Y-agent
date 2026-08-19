interface Props {
  title: string;
  hint: string;
}

export default function PlaceholderPage({ title, hint }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-text-secondary text-sm">{hint}</p>
        <p className="text-text-muted text-xs mt-3">M5 阶段实现</p>
      </div>
    </div>
  );
}
