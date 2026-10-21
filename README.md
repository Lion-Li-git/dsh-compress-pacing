# dsh-compress-pacing

给上下文压缩节流：一次压缩就是一次整上下文重发 + 前缀缓存失效，所以同一个窗口内只允许一通 `compress`（外加一次被拒范围后的补清理）。

## 安装

```bash
dsh plugin --profile <profile> add dsh-compress-pacing
# 或直接从 GitHub 安装
dsh plugin --profile <profile> add github:Lion-Li-git/dsh-compress-pacing
```

## 规则

- 上一通 `compress` **真的回收了 token** 之后，15 分钟内再来一通会被拒，拒绝理由说明「每通都是一次整上下文重发，把要放弃的范围一次交出去」。
- 例外：上一通有 range 被拒（说明它折了一部分、剩下的需要重发），**2 分钟内允许一次补清理**，且只给一次。
- 上一通回收 0（全被拒、什么都没动）不武装窗口——那种情况本来就必须允许补。

## 为什么要这个

同一会话（b3a09167，4 天）实测：15 次压缩调用里，11 个压缩回合有 3 个在**同一分钟内连开 2–3 通**（其中一次 82k → 50k → 19k），每通都要把整段上下文重发一次；另外 8 次调用带 rejected span，需要重试。

这是节流，不是根治。真正的根因在上游 [billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh)：

- **#152** 原位折叠破坏 prompt caching，缓存命中率下滑、成本抬升；
- **#213** 可压缩范围表为空时仍然注入 nudge（长会话被注入行切碎，占用卡在 50–60%）；
- **#214** 跨 live carrier 的普通范围被硬拒后，模型反复重试同一个 span。

上游修好之前，这个插件能把「一串小压缩」压成「一次大压缩」。

## 配置

```yaml
- id: compress-pacing
  config:
    windowMs: 900000   # 15 分钟
    cleanupMs: 120000  # 补清理窗口 2 分钟
```

## 行为

- 失败即放行：非 `compress` 工具、结果文本解析不出来、服务缺失，一律 `next()`。
- 拒绝会让当前 `run_code` 程序中止（同 DSH 里任何未捕获的 `ToolCallError`）。
- 计数按 agent 隔离，子 agent 互不影响；进程重启后归零。

## 兼容性

DSH `>=0.2.0`，cordis `>=4`，Node `>=22.19`。无运行时依赖，纯 ESM。

## License

MIT
