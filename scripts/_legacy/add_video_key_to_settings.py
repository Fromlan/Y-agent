#!/usr/bin/env python3
"""Add a 视频 API Key section to SettingsPanel.tsx.

Mirrors the existing jimeng API Key section but for the video API.
Uses a separate state object so it doesn't interfere with image settings save.
"""
from pathlib import Path

SP = Path("E:/Pi/Y-agent/src/components/settings/SettingsPanel.tsx")


def main() -> int:
    s = SP.read_text(encoding="utf-8")

    # 1. Add imports for video key API
    if "getVideoApiKey" not in s:
        old = 'import { getApiKey, setApiKey, clearApiKey } from "@/lib/api-key";'
        new = (
            'import { getApiKey, setApiKey, clearApiKey } from "@/lib/api-key";\n'
            'import {\n'
            '  getVideoApiKey,\n'
            '  setVideoApiKey,\n'
            '  clearVideoApiKey,\n'
            '  hasVideoApiKey,\n'
            '} from "@/lib/video";'
        )
        s = s.replace(old, new)
        print("added video key imports")

    # 2. Add state hooks
    if "videoKey" not in s:
        marker = (
            "  // LLM 配置\n"
            "  const [llmProvider, setLlmProvider] = useState<keyof typeof LLM_PRESETS>(\"deepseek\");"
        )
        new_state = (
            "  // P8：视频 API Key 状态\n"
            "  const [videoKey, setVideoKey] = useState(\"\");\n"
            "  const [showVideoKey, setShowVideoKey] = useState(false);\n"
            "  const [hasVideoKey, setHasVideoKey] = useState(false);\n"
            "  const [savingVideoKey, setSavingVideoKey] = useState(false);\n"
            "\n"
            "  // LLM 配置\n"
            "  const [llmProvider, setLlmProvider] = useState<keyof typeof LLM_PRESETS>(\"deepseek\");"
        )
        s = s.replace(marker, new_state)
        print("added video key state")

    # 3. Load video key when panel opens
    if "setVideoKey(k ?? \"\")" not in s:
        # Find a good place to add the load — after the existing getApiKey().then(...)
        marker = (
            "      getApiKey()\n"
            "        .then((k) => {\n"
            "          setKey(k ?? \"\");\n"
            "          setHasKey(!!k);\n"
            "        })\n"
            "        .catch(console.error);"
        )
        new = (
            "      getApiKey()\n"
            "        .then((k) => {\n"
            "          setKey(k ?? \"\");\n"
            "          setHasKey(!!k);\n"
            "        })\n"
            "        .catch(console.error);\n"
            "      // P8：加载视频 API Key\n"
            "      getVideoApiKey()\n"
            "        .then((k) => {\n"
            "          setVideoKey(k ?? \"\");\n"
            "          setHasVideoKey(!!k);\n"
            "        })\n"
            "        .catch(console.error);"
        )
        s = s.replace(marker, new)
        print("added video key load on open")

    # 4. Add save / clear video key handlers
    if "onSaveVideoKey" not in s:
        # Insert after onClear
        marker = (
            "  const onClear = async () => {\n"
            "    const ok = await confirmDialog(\"确认清除 API Key？\", { kind: \"warning\", okLabel: \"清除\" });\n"
            "    if (!ok) return;\n"
            "    try {\n"
            "      await clearApiKey();\n"
            "      setKey(\"\");\n"
            "      setHasKey(false);\n"
            "      toast.success(\"已清除\");\n"
            "    } catch (e: any) {\n"
            "      toast.error(`清除失败：${e?.message ?? e}`);\n"
            "    }\n"
            "  };"
        )
        new = (
            "  const onClear = async () => {\n"
            "    const ok = await confirmDialog(\"确认清除 API Key？\", { kind: \"warning\", okLabel: \"清除\" });\n"
            "    if (!ok) return;\n"
            "    try {\n"
            "      await clearApiKey();\n"
            "      setKey(\"\");\n"
            "      setHasKey(false);\n"
            "      toast.success(\"已清除\");\n"
            "    } catch (e: any) {\n"
            "      toast.error(`清除失败：${e?.message ?? e}`);\n"
            "    }\n"
            "  };\n"
            "\n"
            "  // P8：保存视频 API Key\n"
            "  const onSaveVideoKey = async () => {\n"
            "    if (!videoKey.trim()) {\n"
            "      toast.warn(\"请输入视频 API Key\");\n"
            "      return;\n"
            "    }\n"
            "    setSavingVideoKey(true);\n"
            "    try {\n"
            "      await setVideoApiKey(videoKey.trim());\n"
            "      toast.success(\"视频 API Key 已保存\");\n"
            "      setHasVideoKey(true);\n"
            "    } catch (e: any) {\n"
            "      toast.error(`保存失败：${e?.message ?? e}`);\n"
            "    } finally {\n"
            "      setSavingVideoKey(false);\n"
            "    }\n"
            "  };\n"
            "\n"
            "  const onClearVideoKey = async () => {\n"
            "    const ok = await confirmDialog(\"确认清除视频 API Key？\", { kind: \"warning\", okLabel: \"清除\" });\n"
            "    if (!ok) return;\n"
            "    try {\n"
            "      await clearVideoApiKey();\n"
            "      setVideoKey(\"\");\n"
            "      setHasVideoKey(false);\n"
            "      toast.success(\"视频 API Key 已清除\");\n"
            "    } catch (e: any) {\n"
            "      toast.error(`清除失败：${e?.message ?? e}`);\n"
            "    }\n"
            "  };"
        )
        s = s.replace(marker, new)
        print("added video key save/clear handlers")

    # 5. Add the JSX section for video API Key
    if "视频（MiniMax H3）API Key" not in s:
        # Insert right after the existing API Key section
        marker = (
            "          {/* API Key */}\n"
            "          <section>\n"
            "            <h3 className=\"text-xs font-semibold text-text-muted uppercase tracking-wider mb-2\">\n"
            "              API Key\n"
            "            </h3>\n"
            "            <div>\n"
            "              <label className=\"label flex items-center justify-between\">\n"
            "                <span>即梦（豆包 Seedream）API Key</span>\n"
            "                {hasKey && (\n"
            "                  <span className=\"text-[10px] text-accent-success\">● 已配置</span>\n"
            "                )}\n"
            "              </label>\n"
            "              <div className=\"relative mt-1.5\">\n"
            "                <input\n"
            "                  type={show ? \"text\" : \"password\"}\n"
            "                  value={key}\n"
            "                  onChange={(e) => setKey(e.target.value)}\n"
            "                  placeholder=\"ark-...\"\n"
            "                  className=\"input pr-10\"\n"
            "                  autoComplete=\"off\"\n"
            "                />\n"
            "                <button\n"
            "                  type=\"button\"\n"
            "                  onClick={() => setShow((s) => !s)}\n"
            "                  className=\"absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary\"\n"
            "                >\n"
            "                  {show ? <EyeOff className=\"w-4 h-4\" /> : <Eye className=\"w-4 h-4\" />}\n"
            "                </button>\n"
            "              </div>\n"
            "              <p className=\"text-[11px] text-text-muted mt-1.5\">\n"
            "                在\n"
            "                <a\n"
            "                  className=\"text-accent hover:underline mx-1\"\n"
            "                  href=\"https://console.volcengine.com/ark/region:cn-beijing/apiKey\"\n"
            "                  target=\"_blank\"\n"
            "                  rel=\"noreferrer\"\n"
            "                >\n"
            "                  火山方舟控制台\n"
            "                </a>\n"
            "                获取 Key。\n"
            "              </p>\n"
            "            </div>\n"
            "          </section>"
        )
        new = (
            "          {/* API Key */}\n"
            "          <section>\n"
            "            <h3 className=\"text-xs font-semibold text-text-muted uppercase tracking-wider mb-2\">\n"
            "              API Key\n"
            "            </h3>\n"
            "            <div>\n"
            "              <label className=\"label flex items-center justify-between\">\n"
            "                <span>即梦（豆包 Seedream）API Key</span>\n"
            "                {hasKey && (\n"
            "                  <span className=\"text-[10px] text-accent-success\">● 已配置</span>\n"
            "                )}\n"
            "              </label>\n"
            "              <div className=\"relative mt-1.5\">\n"
            "                <input\n"
            "                  type={show ? \"text\" : \"password\"}\n"
            "                  value={key}\n"
            "                  onChange={(e) => setKey(e.target.value)}\n"
            "                  placeholder=\"ark-...\"\n"
            "                  className=\"input pr-10\"\n"
            "                  autoComplete=\"off\"\n"
            "                />\n"
            "                <button\n"
            "                  type=\"button\"\n"
            "                  onClick={() => setShow((s) => !s)}\n"
            "                  className=\"absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary\"\n"
            "                >\n"
            "                  {show ? <EyeOff className=\"w-4 h-4\" /> : <Eye className=\"w-4 h-4\" />}\n"
            "                </button>\n"
            "              </div>\n"
            "              <p className=\"text-[11px] text-text-muted mt-1.5\">\n"
            "                在\n"
            "                <a\n"
            "                  className=\"text-accent hover:underline mx-1\"\n"
            "                  href=\"https://console.volcengine.com/ark/region:cn-beijing/apiKey\"\n"
            "                  target=\"_blank\"\n"
            "                  rel=\"noreferrer\"\n"
            "                >\n"
            "                  火山方舟控制台\n"
            "                </a>\n"
            "                获取 Key。\n"
            "              </p>\n"
            "            </div>\n"
            "\n"
            "            {/* P8：视频 API Key */}\n"
            "            <div className=\"mt-3 pt-3 border-t border-border/40\">\n"
            "              <label className=\"label flex items-center justify-between\">\n"
            "                <span>视频（MiniMax H3）API Key</span>\n"
            "                {hasVideoKey && (\n"
            "                  <span className=\"text-[10px] text-accent-success\">● 已配置</span>\n"
            "                )}\n"
            "              </label>\n"
            "              <div className=\"relative mt-1.5 flex gap-2\">\n"
            "                <div className=\"relative flex-1\">\n"
            "                  <input\n"
            "                    type={showVideoKey ? \"text\" : \"password\"}\n"
            "                    value={videoKey}\n"
            "                    onChange={(e) => setVideoKey(e.target.value)}\n"
            "                    placeholder=\"eyJ...\"\n"
            "                    className=\"input pr-10\"\n"
            "                    autoComplete=\"off\"\n"
            "                  />\n"
            "                  <button\n"
            "                    type=\"button\"\n"
            "                    onClick={() => setShowVideoKey((s) => !s)}\n"
            "                    className=\"absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary\"\n"
            "                  >\n"
            "                    {showVideoKey ? <EyeOff className=\"w-4 h-4\" /> : <Eye className=\"w-4 h-4\" />}\n"
            "                  </button>\n"
            "                </div>\n"
            "                <button\n"
            "                  onClick={onSaveVideoKey}\n"
            "                  disabled={savingVideoKey || !videoKey.trim()}\n"
            "                  className=\"btn btn-primary text-xs h-[38px] px-3\"\n"
            "                >\n"
            "                  {savingVideoKey ? \"保存中…\" : \"保存\"}\n"
            "                </button>\n"
            "              </div>\n"
            "              <p className=\"text-[11px] text-text-muted mt-1.5\">\n"
            "                在\n"
            "                <a\n"
            "                  className=\"text-accent hover:underline mx-1\"\n"
            "                  href=\"https://platform.minimaxi.com/user-center/basic-information/interface-key\"\n"
            "                  target=\"_blank\"\n"
            "                  rel=\"noreferrer\"\n"
            "                >\n"
            "                  MiniMax 开放平台\n"
            "                </a>\n"
            "                获取 Key（与即梦 Key 独立）。以\n"
            "                <code className=\"px-1 bg-bg-elev rounded\">demo-</code>\n"
            "                开头走 Demo 模式不消耗 token。\n"
            "                {hasVideoKey && (\n"
            "                  <button\n"
            "                    onClick={onClearVideoKey}\n"
            "                    className=\"ml-2 text-text-muted hover:text-accent-danger text-[10px] underline-offset-2 hover:underline\"\n"
            "                  >\n"
            "                    清除\n"
            "                  </button>\n"
            "                )}\n"
            "              </p>\n"
            "            </div>\n"
            "          </section>"
        )
        if marker in s:
            s = s.replace(marker, new)
            print("added video API Key section in JSX")
        else:
            print("WARN: API Key JSX marker not found")

    SP.write_text(s, encoding="utf-8")
    print(f"updated {SP}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
