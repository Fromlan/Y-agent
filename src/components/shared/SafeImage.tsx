import { useEffect, useState } from "react";
import { resolveImageUrlSync, resolveImageUrl, prefetchImageUrl } from "@/lib/image-resolver";

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  /** P5：是否异步解析（默认 true）。同步用 resolveImageUrlSync 拿缓存或原值，避免 layout 抖动。 */
  resolveAsync?: boolean;
}

/**
 * 替代原生 <img>：
 * - src 是 http(s) / data: → 直接渲染
 * - src 是本地路径 → 优先用缓存；缓存未命中时用原值渲染一次，再异步解析替换
 * - src 为空 → 不渲染（由父组件决定 placeholder）
 */
export default function SafeImage({ src, resolveAsync = true, ...rest }: Props) {
  const [resolved, setResolved] = useState<string>(() => resolveImageUrlSync(src));

  // src 变化时立刻同步刷新一次（缓存命中就 OK；未命中也是原值），再异步解析
  useEffect(() => {
    setResolved(resolveImageUrlSync(src));
    if (!src) return;
    if (!resolveAsync) return;
    let cancelled = false;
    resolveImageUrl(src)
      .then((u) => {
        if (!cancelled && u) setResolved(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, resolveAsync]);

  // 预热：进入视口时把 src 加到预解析队列
  useEffect(() => {
    if (src) prefetchImageUrl(src);
  }, [src]);

  if (!src) return null;
  return <img src={resolved || src} {...rest} />;
}
