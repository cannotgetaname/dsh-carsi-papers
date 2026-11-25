# dsh-carsi-papers

[![npm version](https://img.shields.io/npm/v/dsh-carsi-papers)](https://www.npmjs.com/package/dsh-carsi-papers)
[![license](https://img.shields.io/npm/l/dsh-carsi-papers)](LICENSE)

[English](README.md) | 中文

让 DeepSeek Harness 直接使用**你自己的浏览器**，在校园网订阅的数据库（IEEE Xplore / ScienceDirect /
Springer Nature Link）里检索、下载并校验全文——而不是只拿到公开的 OA 副本和预印本。

## 为什么做这个

文献类工具大多止步于开放获取，因为公开 API 只给得到这些。你真正需要的是学校订阅的版本，而订阅绑定在
浏览器会话上：CARSI / Shibboleth 机构登录，或者校园网 IP。

这个插件维护一个**专用 Chrome 配置**（独立 profile + 本地调试端口），让智能体就在那个已授权的会话里
工作：调用站点自己的接口检索、下载订阅 PDF、校验字节、按可读的名字落盘、导出引用。付费墙和人机验证只
如实报告，不绕过。

## 演示

```
papers_search   query="structure-function relationship spiking neural network"
                publishers=["ieee", "springer"] rows=4
→ 8 条合并命中，每条都标注来自哪些库

papers_fetch    publisher=springer url=https://link.springer.com/article/10.1038/s41467-025-62202-1
→ 已保存：refs/2025-Yang-Spiking dynamics of individual neurons ….pdf
  2.4 MB · 12 页 · PDF 校验通过

papers_export   format=bibtex
→ refs/carsi-records.bib（只导出已下载的记录）
```

## 工具

| 工具 | 作用 |
|---|---|
| `papers_status` | 浏览器是否在跑、端口、profile 目录、已开标签 |
| `papers_search` | 单库或多库检索，按 DOI 合并去重，标注访问状态 |
| `papers_fetch` | 下载 PDF、校验魔数与页数、命名落盘、写审计 |
| `papers_export` | 把会话记录导出为 BibTeX / RIS |
| `papers_access` | 报告机构身份 / 付费墙 / 人机验证状态 |
| `papers_login` | 打开机构登录入口，把窗口交给你（不代填凭据） |
| `papers_open` / `papers_eval` | 打开任意页面 / 页内执行 JS（未适配库的兜底） |

## 安装

```sh
dsh plugin --profile <profile> add dsh-carsi-papers
```

或在 **插件 → 添加插件** 里填写 `dsh-carsi-papers`。插件自带浏览器驱动（纯 CDP），无第三方运行时依赖。

## 授权与合规

- **登录永远由你完成**：不代填、不保存、不回放凭据。遇到登录页或人机验证时弹系统提醒、把窗口提到前台，
  最多等 90 秒，你点完自动继续。
- **只取已订阅内容**：付费墙与验证码只被报告，不被绕过。
- **下载要校验**：`%PDF-` 魔数 + `pdfinfo` 页数；限速 1500 ms、单会话最多 30 篇，每步写
  `carsi-audit.jsonl`。

## 测试

```sh
npm test          # 126 项离线检查（单测 + headless Chrome fixtures + schema）
npm run test:unit # 不需要浏览器
npm run test:live # 可选：真实检索与下载
```

## 已知限制

- 独立 profile 意味着每个库首次访问可能要手动登录一次，会话过期后同理。
- 人机验证只能由人完成。
- IEEE 页面没有 Highwire 元数据标签，文件名依赖检索时缓存的记录。

MIT License。
