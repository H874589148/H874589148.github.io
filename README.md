# EE工具箱：电子工程师一站式工具网站

![code size](https://img.shields.io/github/languages/code-size/h874589148/h874589148.github.io)
![top language](https://img.shields.io/github/languages/top/h874589148/h874589148.github.io)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?logo=githubpages&logoColor=white)
![last commit](https://img.shields.io/github/last-commit/h874589148/h874589148.github.io)
![author](https://img.shields.io/badge/author-hawkeye-blue)

## 项目简介

**EE工具箱** 是一个面向电子工程师、IC 设计从业者和相关专业学生的在线工具集合，覆盖模拟电路计算、抖动与 PLL 分析、芯片热估算、版图与封装寄生、科研绘图、逻辑分析、仿真结果整理、技术写作和学术分享等日常场景。

项目采用原生 HTML、CSS 和 JavaScript 构建，无需账号、无需后端服务，绝大多数计算和编辑操作均在浏览器本地完成。网站以手绘风格、实时反馈、结果可导出和开箱即用为主要特点。

**在线访问：** <https://h874589148.github.io/>

### 核心特点

- **纯静态站点**：可直接部署到 GitHub Pages，无应用服务器和数据库；
- **计算与可视化联动**：修改参数后实时更新数值、曲线、热图、波形或表格；
- **科研绘图与导出**：多个模块支持 SVG、PNG、CSV、Excel、Markdown 或 LaTeX 等格式；
- **跨页面图纸复用**：电路示意图编辑器与传递函数、真值表等模块之间可传输图纸副本；
- **本地工作状态**：部分工具使用 `localStorage` 保存输入、草稿、主题和用户偏好；
- **统一交互体验**：支持日间/夜间主题、首页中英文搜索、响应式布局和共享 SVG 图标；
- **内容 Markdown 化**：知识分享和论文分享均由 Markdown 源文件生成清单并渲染；
- **自动化回归**：使用 Node.js 内置测试运行器验证计算核心、页面接线、数据导入导出和共享组件。

## 功能总览

### 1. 计算工具

| 模块 | 当前功能 |
| --- | --- |
| [Bandgap 计算集](tools/bandgap/index.html) | 带隙基准参数链、Trim 位和 VBE(T) 设计计算 |
| [电流镜失配计算](tools/current-mirror/index.html) | MOS 电流镜失配率与版图参数快速估算 |
| [传递函数计算](tools/transfer-function/index.html) | 在共享画布中连接四端 gm、R/C 和耦合电容，求符号式、电压增益或跨阻、复数零极点及 Bode 图 |
| [噪声快速计算](tools/noise-calc/index.html) | 热噪声、散粒噪声、闪烁噪声等常用参数计算 |
| [Jitter 综合计算](tools/jitter-calc/index.html) | 时间/相位/UI 换算、RMS 抖动预算、相噪积分、整数 N 电荷泵 PLL 噪声与稳定性、ADC SNR/SINAD/ENOB、TIE 与边沿时间戳统计 |
| [DPI 计算](tools/dpi-calc/index.html) | 直接功率注入拓扑、网络阻抗频响以及 dBm/mW 实时换算 |
| [滤波器设计](tools/filter-design/index.html) | 6 种架构的最小面积 RC 求解，并提供幅频和噪声分析 |
| [NTF 绘制](tools/ntf-plot/index.html) | z 域系数输入、NTF 频谱绘制和带内积分噪声计算 |
| [最小二乘拟合](tools/least-squares/index.html) | x/y 数据直线拟合，给出斜率、截距和 R²，支持坐标范围调整 |
| [科学计算器](tools/calculator/index.html) | 表达式解析、三角函数、对数、阶乘以及 DEG/RAD 切换 |
| [芯片发热估算](tools/chip-thermal/index.html) | 导通温升、热约束电流、恒压降功耗、多热源二维瞬态热图、探针与 TSV 导出 |

### 2. 版图与封装

| 模块 | 当前功能 |
| --- | --- |
| [版图失配计算](tools/layout-match/index.html) | 网格阵列与浓度梯度建模，评估组间失配以及 INL/DNL |
| [版图寄生计算](tools/wire-res/index.html) | 走线段电阻与对衬底电容累加，支持逐段独立电流和 IR 压降显示 |
| [封装/PCB 寄生估算](tools/package-pcb-parasitic/index.html) | 键合线和微带走线 R/L 估算，包含趋肤效应、公式适用边界与常见参数表 |

### 3. 绘图工具

| 模块 | 当前功能 |
| --- | --- |
| [电路示意图编辑器](tools/circuit-sketch/index.html) | Razavi 教材风格器件库、器件拖放、参数编辑、正交连线、撤销/重做、图纸导入和 SVG/PNG 导出 |
| [波形编辑器](tools/wavedrom/index.html) | 图形化时序波形编辑、点击改电平、总线填字填色以及 SVG/PNG/PDF 导出 |
| [零极点 Bode 图](tools/bode-plot/index.html) | 零极点与 RC 换算、幅频/相频曲线、自适应刻度、交越频率和裕度标注 |
| [密勒补偿 Bode 图](tools/miller-comp/index.html) | 两级运放极点分裂、零点和相位裕度实时分析 |

### 4. 常用工具

| 模块 | 当前功能 |
| --- | --- |
| [逻辑真值表](tools/truth-table/index.html) | 文本布尔表达式或画布组合逻辑输入，位并行枚举、中间信号查看和 CSV 导出 |
| [FMEA 工作台](tools/fmea/index.html) | 失效模式中英查询、S/O/D 打分参考以及 FMEDA/ASIL 相关计算 |
| [LaTeX 实时渲染](tools/latex-render/index.html) | 公式实时预览、常用符号查询以及 SVG/PNG/JPG 导出 |
| [电力电子波形](tools/power-electronics/index.html) | Buck、Boost、Buck-Boost、Flyback、LLC、DSD 等拓扑的稳态波形、参数统计和 CSV 导出 |
| [进制转换](tools/base-converter/index.html) | 二、八、十、十六进制互转，支持小数与浮点数 |
| [反码补码转换](tools/complement-code/index.html) | 原码、反码、补码互转，支持自定义位宽 |
| [正态分布置信区间](tools/gaussian/index.html) | 通过可调区间计算正态分布概率并显示阴影 |
| [随机数生成](tools/random-gen/index.html) | 范围随机数批量生成、卡片展示和摇骰子动画 |
| [仿真结果收集](tools/sim-log/index.html) | 仿真设置格式化、截图本地 OCR 转表格、结果校对与行列编辑，支持 Word/Excel/Markdown/LaTeX 复制及真实 `.xlsx` 下载 |
| [代码格式化工具](tools/code-formatter.html) | 自动检测语言、代码格式化、高亮和一键复制 |

### 5. 学术分享与资源

| 模块 | 当前功能 |
| --- | --- |
| [知识分享](blog/index.html) | 电路、算法、工具链和工程经验等 Markdown 技术笔记 |
| [论文分享](blog/index.html?m=papers) | 论文精读、方法拆解、公式推导和结果复现笔记 |
| [资源导航](links/index.html) | IC 设计常用网站与友情链接 |

知识分享和论文分享共用列表及详情页框架，但分别维护源文件和清单；标签、作者、来源、摘要和阅读时间由文章 front matter 提供。

### 6. 趣味游戏与音乐

- [24 点计算器](games/24point/index.html)：手动输入或随机发牌，精确分数求解、解法去重、计时与历史记录；
- [小游戏合集](games/index.html)：本地小游戏、网页游戏、识谱练习、节拍器以及阿瓦隆/狼人杀/谁是卧底等派对助手；
- **YueXinMao 看板娘**：共享动画、气泡、快捷入口和本地音乐播放清单。

首页当前直接展示 24 点入口；完整游戏合集仍可通过 `games/index.html` 和看板娘快捷入口访问。

## 全站共享能力

### 主题与搜索

- 首页搜索会同时匹配卡片标题、描述和中英文扩展关键词；
- 回车可进入第一个可见结果，Esc 可清空搜索；
- 主题偏好保存在 `ee-theme` 中，各页面通过共享 CSS 变量适配日间/夜间模式；
- 图标由 `js/common.js` 中的 `Icons` 对象统一维护，首页通过占位元素注入。

### 图纸与模块协作

`circuit-sketch` 是共享电路画布，传递函数和真值表等工具可接收图纸副本进行进一步分析。跨页传输与嵌入场景由以下共享脚本协作：

- `js/circuit-handoff.js`：图纸跨页传输、会话与副本隔离；
- `js/circuit-connectivity.js`：电路连通性和网络识别；
- `razavi/`：器件符号 JSON、目录和共享渲染器。

### 本地存储与导出

不同工具可能保存输入参数、图纸、表格、主题或历史记录。浏览器清除站点数据后，这些本地状态也会被清除；重要结果请及时使用页面提供的导入/导出功能备份。

## 技术栈

| 层次 | 实现 |
| --- | --- |
| 页面与样式 | HTML5、CSS3、CSS 自定义属性、响应式 Grid/Flex 布局 |
| 交互与计算 | 原生 JavaScript，无前端框架，无后端运行时 |
| 图形绘制 | SVG、Canvas、共享 Razavi 器件符号库 |
| 本地第三方库 | `lib/chart.min.js`、`lib/marked.min.js`、`lib/rough.min.js` |
| 数学公式 | MathJax，具体加载方式以各页面为准 |
| 浏览器能力 | Fetch、Web Worker、FileReader、Clipboard、localStorage、Blob 下载等 |
| 内容构建 | Node.js 内置 `fs`、`path` 等模块，无 npm 运行依赖 |
| 自动化测试 | Node.js 内置 `node:test`，配合项目自有 DOM/Worker 测试替身 |
| 部署 | GitHub Pages 静态托管，根目录包含 `.nojekyll` |

> 大多数工具不需要编译或打包。Node.js 主要用于生成博客/音乐清单以及运行测试，不是线上网站的服务器依赖。

## 目录结构

```text
H874589148.github.io/
├── index.html                 # 首页：功能卡片、图标注入、站内搜索与主题入口
├── css/                       # 全站基础样式、布局、组件、光标和看板娘样式
│   ├── base.css               # CSS 变量、字体、颜色及暗色主题
│   ├── layout.css
│   ├── components.css
│   ├── cursor.css
│   └── yuexinmiao-widget.css
├── js/
│   ├── common.js              # 共享图标、主题等公共能力
│   ├── circuit-connectivity.js
│   ├── circuit-handoff.js
│   ├── cursor.js
│   ├── yuexinmiao-widget.js
│   └── tests/                 # Node 自动化测试与测试替身
├── lib/                       # 本地 Chart.js、Marked、Rough.js
├── tools/                     # 计算、绘图和常用工具
│   ├── <module>/              # 通常包含 index.html、style.css、script.js
│   ├── circuit-sketch/        # 共享电路示意图编辑器
│   ├── transfer-function/     # 传递函数计算
│   ├── jitter-calc/           # Jitter 综合计算
│   ├── chip-thermal/          # 芯片热分析
│   ├── build-blog.js          # 生成博客双模块清单
│   ├── build-blog.bat         # Windows 双击构建入口
│   ├── build-music-list.js    # 生成音乐播放清单
│   └── code-formatter.html    # 单文件工具页
├── blog/
│   ├── index.html             # 知识分享/论文分享共用列表页
│   ├── post.html              # 共用 Markdown 详情页
│   ├── posts/                 # 知识分享 Markdown 与插图
│   ├── papers/                # 论文分享 Markdown 与插图
│   ├── posts.json             # 自动生成，请勿手动维护
│   └── papers.json            # 自动生成，请勿手动维护
├── games/                     # 本地游戏、音乐练习和派对助手
├── links/                     # 资源导航
├── razavi/                    # 电路符号 JSON、catalog 和渲染脚本
├── assets/                    # 字体、图标、图片、音乐及生成的播放清单
└── .nojekyll                  # 禁止 GitHub Pages 使用 Jekyll 改写站点
```

部分早期游戏和单文件工具采用自包含 HTML，不强制遵循三文件目录结构。

## 本地运行

### 环境要求

- 现代浏览器：Chrome、Edge、Firefox 或 Safari；
- 仅在构建清单或运行测试时需要 Node.js，建议使用支持 `node:test` 的 Node.js 18 或更高版本；
- 不需要执行 `npm install`。

### 启动静态 HTTP 服务

请通过 HTTP 访问站点，不要直接双击 HTML 使用 `file://` 打开。博客清单、Markdown、符号 JSON、跨页 iframe 和 `fetch()` 资源在 `file://` 下可能无法加载。

在项目根目录任选一种方式：

```bash
# 方式一：使用 npx 启动静态服务器，按终端提示访问本地地址
npx --yes serve .

# 方式二：如果本机已安装 Python
python -m http.server 8000
```

使用第二种方式时访问 <http://localhost:8000/>。

若 Windows 已安装 Node.js 但未加入 `PATH`，构建和测试时请使用本机 `node.exe` 的绝对路径。`tools/build-blog.bat` 也提供了当前开发环境的 VS 2022 Node.js 回退路径。

## 内容维护

### 发布知识分享或论文分享

1. 在对应目录新增 UTF-8 编码的 Markdown 文件：
   - 知识分享：`blog/posts/*.md`；
   - 论文分享：`blog/papers/*.md`。
2. 添加 front matter；
3. 将插图放入与文章同名的资源目录，例如 `blog/posts/img/<文章名>/`；
4. 执行构建脚本，重新生成两份清单；
5. 通过本地 HTTP 服务检查列表、标签、详情、公式和插图。

示例：

```yaml
---
title: 示例文章
date: 2026-01-01
tags: [analog, tools]
authors: Hawkeye
source: Tools
abstract: 文章摘要。
readtime: 6
---
```

必需字段为 `title`、`date` 和 `tags`。知识分享的 `authors` 缺省时由构建脚本填入 `Hawkeye`；论文分享可显式填写作者和来源。`readtime` 缺省时由脚本估算。

```bash
node tools/build-blog.js
```

Windows 也可以双击 `tools/build-blog.bat`。脚本会同时生成：

- `blog/posts.json`；
- `blog/papers.json`。

这两份 JSON 均为构建产物，**不要手动编辑**。两个文章目录中的文件名应保持唯一，避免详情页路由歧义。

常用路由：

```text
blog/index.html                         # 知识分享
blog/index.html?m=papers                # 论文分享
blog/post.html?p=<文件名>.md             # 自动识别文章所属模块
```

### 更新音乐清单

增删 `assets/music/` 中的音频后运行：

```bash
node tools/build-music-list.js
```

脚本递归扫描 MP3、M4A、OGG 和 WAV 文件，并生成 `assets/music/playlist.js`。该文件同样不要手动维护。

## 测试与验证

在项目根目录执行：

```bash
# 运行全部 Node 自动化测试
node --test

# 重建博客清单，同时检查 front matter 和跨目录重名
node tools/build-blog.js

# 对单个 JavaScript 文件做语法检查
node --check path/to/script.js
```

测试覆盖计算核心、单位换算、异常输入、页面 DOM 接线、Worker 生命周期、图纸传输、导入导出、主题切换和静态资源约定等。修改共享脚本或复杂交互后，除自动化测试外，还应通过本地 HTTP 服务进行实际浏览器验证。

建议重点检查：

1. 首屏是否出现控制台异常或资源 404；
2. 默认输入是否立即产生正确结果；
3. 非法输入是否被明确提示，而不是显示旧结果或伪成功；
4. 日间/夜间主题、窗口缩放和导出是否正常；
5. 使用 `localStorage`、Worker、Clipboard 或 iframe 的功能是否完成实际交互验证；
6. 新增博客文章是否同时检查桌面排版、代码块、公式和相对插图路径。

## 新增工具页的集成约定

一个独立工具页只有完成以下集成，才会在首页具备完整入口：

1. **页面本体**：通常放在 `tools/<name>/`，使用 `index.html`、`style.css`、`script.js`；
2. **首页卡片**：在 `index.html` 对应分区增加 `.nav-card` 和唯一图标占位 ID；
3. **图标注入**：在首页 `ICON_TARGETS` 中登记占位 ID 与图标键的映射；
4. **搜索关键词**：在首页 `SEARCH_KEYS` 中增加路径前缀和中英文关键词；
5. **共享图标**：在 `js/common.js` 的 `Icons` 对象中增加同名 SVG 图标；
6. **游戏额外入口**：若新增游戏，还应同步维护 `games/index.html` 中对应分区。

页面通常按相对路径引入共享资源：

```text
../../css/base.css
../../css/layout.css
../../css/components.css
../../js/common.js
```

开发约定：

- 颜色、间距、圆角等优先使用 `base.css` 中的 CSS 变量，确保暗色主题同步生效；
- 共享脚本必须在使用它的每个宿主页和 iframe 页面中按依赖顺序显式引入；
- 图标注入应保留目标元素存在性检查，避免可选卡片下线导致整段初始化中断；
- 新增共享脚本或修改公共接口时，应同步检查所有调用页和自动化测试；
- 计算结果、草稿和页面状态应明确区分，输入失效时不能继续展示未标记的旧结果。

## 数据、网络与使用边界

- 网站没有账号体系和业务后端，多数计算、编辑和导出在本地浏览器完成；
- 本地存档不等于云端备份，更换浏览器、设备或清除站点数据后不会自动迁移；
- Google Fonts、访问统计、部分公式渲染或第三方组件可能产生外部网络请求，具体以各页面实际引入为准；
- 如需完全离线使用，应先检查目标页面的外部脚本、字体和资源依赖；
- 计算结果用于学习、方案评估和工程估算，不替代 PDK 文档、电路仿真、热仿真、实测或签核流程。

## 贡献

欢迎通过 Issue 或 Pull Request 反馈计算错误、交互问题和功能建议。提交修改时建议：

1. 说明问题复现步骤、输入数据和预期结果；
2. 为计算核心或回归问题补充自动化测试；
3. 保持现有原生 JavaScript、共享样式和目录约定；
4. 完成 `node --test` 以及相关页面的浏览器验证；
5. 新增文章或音乐后运行对应构建脚本，并提交生成的清单。

## 如何引用

如果本工具箱对您的科研工作、论文、报告或设计文档有所帮助，欢迎引用。

### 论文 / 参考文献（GB/T 7714 格式）

```text
hawkeye. EE工具箱: 电子工程师一站式工具网站[EB/OL]. [引用日期]. https://h874589148.github.io/.
```

### LaTeX / BibTeX 格式

```bibtex
@misc{eetoolkit,
  author       = {hawkeye},
  title        = {{EE工具箱}: 电子工程师一站式工具网站},
  howpublished = {\url{https://h874589148.github.io/}},
  year         = {2026},
  note         = {Accessed: 引用日期}
}
```

### 文中引用示例

```latex
本文的噪声计算借助 EE工具箱~\cite{eetoolkit} 完成。
```

## 作者

**hawkeye**

- GitHub：[H874589148](https://github.com/H874589148/)
- 知乎：[猫与向日葵](https://www.zhihu.com/people/h874589148/)
- B 站：[醉醉萌不萌](https://space.bilibili.com/520240681)
