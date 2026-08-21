import { useEffect, useState } from "react";
import { resolveImageUrlSync, resolveImageUrl, prefetchImageUrl } from "@/lib/image-resolver";

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  /** P5：是否异步解析（默认 true）。同步用 resolveImageUrlSync 拿缓存或原值，避免 layout 抖动。 */
  resolveAsync?: boolean;
  /**
   * 是否跳过默认的 `block + 100%` 约束。
   * 99% 的用例应该让 SafeImage 严格被父容器约束；只有少数情况
   * （如在 inline text 流里嵌入小图标）才需要传 true 关闭。
   * 默认 false。
   */
  unconstrained?: boolean;
}

/**
 * 替代原生 <img>：
 * - src 是 http(s) / data: → 直接渲染
 * - src 是本地路径 → 优先用缓存；缓存未命中时用原值渲染一次，再异步解析替换
 * - src 为空 → 不渲染（由父组件决定 placeholder）
 *
 * **P-fix：默认加 `block` class + 显式 `width: 100%; height: 100%` style。**
 *
 * 原因：`<img>` 默认 `display: inline-block`，部分浏览器在 `<img>` 加载前会
 * 短暂回退到"天然宽高"作为布局占位 — 当父 div 的 `width: 100%; height: 100%`
 * 还没生效、或者图层 PNG 天然尺寸(如 287×1351)远大于父容器(如 27.9%×87.9%)
 * 时，图片会按天然尺寸渲染，溢出后被外层 `overflow-hidden` 裁掉，视觉上变成
 * "图层被放大到撑满"。LayerCompositeStage / LayerBboxMini / AssetThumbnailMini
 * 都靠父 div 的百分比定位 + objectFit 缩放，必须保证 `<img>` 完全被父 div
 * 约束住。
 *
 * 调用方如果传了 `className` 会跟 `block` 合并；如果传了 `style` 也会保留。
 * 唯一例外：调用方主动想 inline 排版时，可以传 `unconstrained: true` 关闭默认 block。
 */
export default function SafeImage({
  src,
  resolveAsync = true,
  unconstrained = false,
  className,
  style,
  ...rest
}: Props) {
  const [resolved, setResolved] = useState<string>(() => resolveImageUrlSync(src));

  // src 变化时立刻同步刷新一次（缓存命中就 OK；未命中也是原值），再异步解析
  useEffect(() => {
    setResolved(resolveImageUrlSync(src));
    if (!src) return;
    if (!resolveAsync) return;
    let cancelled = false;
    resolveImageUrl(src)
      .then((u) => {
        if (cancelled || !u) setResolved(u);
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

  // 合并 className：默认加 `block`，保留调用方传的
  const finalClassName = unconstrained
    ? className
    : [className, "block"].filter(Boolean).join(" ");

  // 合并 style：默认加 `width: 100%; height: 100%`，保留调用方传的
  // (调用方可以传更具体的 width/height 来覆盖默认值)
  const finalStyle = unconstrained
    ? style
    : { width: "100%", height: "100%", ...style };

  return (
    <img
      src={resolved || src}
      className={finalClassName}
      style={finalStyle}
      {...rest}
    />
  );
}
