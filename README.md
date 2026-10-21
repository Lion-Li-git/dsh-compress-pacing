# dsh-compress-pacing
Paces context compression in DeepSeek Harness: one compress call per window plus a single cleanup call, because every compress re-sends the whole context and invalidates the prefix cache. 压缩一次就重发一次上下文。
