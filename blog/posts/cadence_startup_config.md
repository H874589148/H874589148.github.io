---
title: Cadence Virtuoso 启动配置：.cdsinit、.cdsenv 与 .cshrc 的区别及常用命令
date: 2026-11-15
tags: [analog, tools]
authors: Hawkeye
source: Tools
abstract: 系统梳理 Cadence Virtuoso 中 .cshrc、.cdsenv、.cdsinit 的加载阶段、语法和覆盖关系，并汇总 ViVA 白底与线宽、Symbol 默认模板、Layout 网格与十字光标、ADE 仿真目录、快捷键和故障排查等常用配置。
readtime: 20
---

# Cadence Virtuoso 启动配置：`.cdsinit`、`.cdsenv` 与 `.cshrc`

刚接触 Virtuoso 时，最常见的困惑是：同一个选项似乎既能写进 `.cdsenv`，也能写进 `.cdsinit`；改了文件却不生效，又有人让你去检查 `.cshrc`。其实三者处在完全不同的阶段：

- **`.cshrc` 管启动前的 Linux/UNIX Shell 环境**：可执行文件在哪里、License 指向哪里、是否额外加载当前目录的 `.cdsenv`；
- **`.cdsenv` 管 Cadence 工具的默认选项**：Layout、Schematic、ViVA、ADE 等工具的环境变量；
- **`.cdsinit` 是启动时执行的 SKILL 脚本**：既能设置同样的工具选项，也能加载脚本、定义快捷键、判断文件是否存在并执行自动化逻辑。

> **一句话记忆**：`.cshrc` 决定“怎样启动 Cadence”，`.cdsenv` 决定“工具默认长什么样”，`.cdsinit` 决定“启动时还要执行什么”。

本文示例以常见的 IC6.1.x / ViVA 环境为主。不同 ISR、ICADVM 版本、PDK 和公司站点加载链可能改名或覆盖选项，**不要把本文路径和数值视为所有工艺的统一推荐值**。

## 1. 三个文件的核心区别

| 文件 | 实际解释者 | 生效阶段 | 典型语法 | 最适合放什么 | 不适合放什么 |
|---|---|---|---|---|---|
| `~/.cshrc` | `csh` / `tcsh` | 启动 `virtuoso` 之前 | `setenv`、`set path`、`alias` | 安装路径、`PATH`、License、Shell 环境变量、启动别名 | SKILL 的 `envSetVal()` |
| `.cdsenv` | Cadence 环境系统 | Cadence 初始化时，通常早于 `.cdsinit` | `工具域 变量名 类型 值` | 单纯的工具默认选项、GUI 偏好 | 条件判断、函数定义、快捷键脚本 |
| `.cdsinit` | Virtuoso 的 SKILL 解释器 | `.cdsenv` 之后的初始化阶段 | `envSetVal()`、`load()`、`when()` | SKILL 初始化、加载个人脚本、快捷键、需要逻辑判断的配置 | Shell 的 `setenv`、Linux `alias` |

一个简化启动过程如下：

```text
登录 Shell / 启动终端
        │
        ├─ 读取 ~/.cshrc（使用 csh/tcsh 时）
        │    设置 PATH、License、CDS_LOAD_ENV 等
        ▼
执行 virtuoso
        │
        ├─ 加载安装版、站点版、用户版 .cdsenv
        │
        ├─ 按站点定义的加载链执行 .cdsinit / .cdsinit_personal 等
        │    后执行的 envSetVal() 可能覆盖先前 .cdsenv 中的同名选项
        ▼
CIW、Library Manager、Schematic / Layout / ADE / ViVA
```

需要注意：**“后加载覆盖先加载”是理解同名配置的原则，不代表你的站点一定逐字采用上述文件名。** 有些站点实际加载的是 `~/.cdsinit_personal`、项目目录的 `./.cdsinit_local`，而 `~/.cdsinit` 反而需要被显式 `load()` 才会执行。

## 2. `.cshrc`：配置启动前的 Shell 环境

只有当前登录 Shell 是 `csh` 或 `tcsh` 时，`~/.cshrc` 才会按这里的方式生效。如果使用的是 Bash，对应文件通常是 `~/.bashrc`，语法也应改为 `export`。很多公司还会通过统一的项目启动脚本设置环境，此时应优先沿用该脚本，不要另建一套互相覆盖的路径。

### 2.1 常用示例

```csh
# Cadence 安装根目录：按本机实际路径修改
setenv IC_DIR /opt/cadence/IC618

# 把 Cadence 可执行文件目录加入 csh 的 path 列表
set path = (${IC_DIR}/tools/bin ${IC_DIR}/tools/dfII/bin $path)

# License 示例：端口和服务器名按管理员提供的信息填写
setenv CDS_LIC_FILE 5280@lic-server.example.com

# 某些环境使用 LM_LICENSE_FILE；是否同时设置取决于站点许可配置
# setenv LM_LICENSE_FILE 5280@lic-server.example.com

# 除默认搜索位置外，再加载启动目录中的 ./.cdsenv
setenv CDS_LOAD_ENV addCWD

# 个人启动别名：在终端输入 vv 即可后台启动
alias vv 'virtuoso &'
```

### 2.2 常用 Shell 命令速查

| 命令 | 释义 |
|---|---|
| `setenv IC_DIR /opt/cadence/IC618` | 设置安装根目录变量，便于后续脚本复用；变量名本身不是固定要求，关键是与站点脚本一致 |
| `set path = (${IC_DIR}/tools/bin $path)` | 在 `csh/tcsh` 中把工具目录加入可执行文件搜索路径 |
| `setenv CDS_LIC_FILE 5280@server` | 指定 Cadence License 服务；实际端口和服务器以站点为准 |
| `setenv CDS_LOAD_ENV addCWD` | 将当前工作目录的 `./.cdsenv` 加入加载范围，适合项目级偏好 |
| `alias vv 'virtuoso &'` | 创建后台启动 Virtuoso 的终端别名 |
| `source ~/.cshrc` | 让当前 Shell 重新读取配置；不会自动改变已经运行的 Virtuoso 进程 |
| `printenv IC_DIR` | 检查某个 Shell 环境变量是否已设置 |
| `which virtuoso` | 检查终端实际找到的 `virtuoso` 来自哪个目录 |
| `echo $path` | 检查 `csh/tcsh` 当前的可执行文件搜索路径 |

> `setenv` 设置的是 **操作系统/Shell 环境变量**；`envSetVal()` 设置的是 **Cadence 工具环境变量**。二者名字相似，但不能互相替代。

## 3. `.cdsenv`：用四列语法保存工具默认选项

### 3.1 基本语法

```text
工具域    变量名    类型    值
```

例如：

```text
; 新建 Symbol 时使用 analog 模板
schematic tsgTemplateType string "analog"

; ViVA 波形图白底黑字
viva.rectGraph background string "white"
viva.rectGraph foreground string "black"

; ViVA 默认粗实线
viva.trace lineThickness string "thick"
viva.trace lineStyle string "solid"

; Layout 十字光标
layout cursorShape boolean t
```

常见类型如下：

| 类型 | 示例 | 说明 |
|---|---|---|
| `string` | `"analog"`、`"white"` | 字符串，通常保留双引号 |
| `int` | `5`、`0`、`32` | 整数 |
| `float` | `0.005`、`0.1` | 浮点数 |
| `boolean` | `t` / `nil` | 真 / 假；不要随手写成 Shell 风格的 `yes/no` |
| `cyclic` | `"ignored"` | 从预定义集合中取值的枚举型选项 |

### 3.2 文件放在哪里

典型搜索顺序包括：

1. `$IC_DIR/tools/dfII/etc/tools/<application>/.cdsenv`：安装版工具默认值；
2. `$IC_DIR/tools/dfII/local/.cdsenv`：站点公共配置；
3. `~/.cdsenv`：个人配置；
4. `./.cdsenv`：项目目录配置，**某些默认加载链不会自动读取它**，可在 `.cshrc` 中设置 `setenv CDS_LOAD_ENV addCWD`，或在个人 `.cdsinit` 中显式调用 `envLoadFile("./.cdsenv")`。

安装目录通常自带模板：

```csh
ls $IC_DIR/tools/dfII/samples/.cdsenv
ls $IC_DIR/tools/dfII/etc/tools/schematic/.cdsenv
```

最稳妥的个人配置方法是：**在 GUI 中调好选项，再通过 CIW 的 Options → Save Defaults 等入口保存，观察生成的 `.cdsenv` 条目。** 这样得到的工具域、类型和枚举值最符合当前版本。

## 4. `.cdsinit`：在启动时执行 SKILL

### 4.1 `envSetVal()` 与 `.cdsenv` 的对应关系

```lisp
envSetVal("工具域" "变量名" '类型 值)
```

例如，用户最常见的 Symbol 默认模板配置是：

```lisp
envSetVal("schematic" "tsgTemplateType" 'string "analog")
```

它等价于 `.cdsenv` 中的：

```text
schematic tsgTemplateType string "analog"
```

该设置让新建 Symbol 时默认采用 `analog` 模板。大家常说的“Symbol 的 cdsterm/端子模板默认设置”，实际写入的是 `schematic` 工具域下的 `tsgTemplateType` 变量；不同模板最终提供的端子和图形属性仍以当前模板定义为准。

### 4.2 一份可复制的最小模板

```lisp
; ---------- Symbol / Schematic ----------
envSetVal("schematic" "tsgTemplateType" 'string "analog")

; ---------- ViVA ----------
; IC617 及更早版本常用 rectGraph
envSetVal("viva.rectGraph" "background" 'string "white")
envSetVal("viva.rectGraph" "foreground" 'string "black")
envSetVal("viva.trace" "lineThickness" 'string "thick")
envSetVal("viva.trace" "lineStyle" 'string "solid")

; ---------- Layout ----------
; 数值只是示例，应按工艺网格修改
envSetVal("layout" "gridSpacing" 'float 0.1)
envSetVal("layout" "gridMultiple" 'int 5)
envSetVal("layout" "xSnapSpacing" 'float 0.005)
envSetVal("layout" "ySnapSpacing" 'float 0.005)
envSetVal("layout" "cursorShape" 'boolean t)

; ---------- ADE ----------
envSetVal("asimenv.startup" "simulator" 'string "spectre")

printf("Personal Cadence settings loaded.\n")
```

请使用 ASCII 双引号和括号。复制网页时要特别检查是否把 `"` 变成了中文弯引号，或把 `nil` 自动替换成了其他字符。

### 4.3 查询、加载和调试命令

| 命令 | 释义 |
|---|---|
| `envGetVal("layout" "cursorShape")` | 在 CIW 查询当前 Cadence 环境变量值 |
| `envGetVal("schematic" "tsgTemplateType")` | 查询 Symbol 默认模板 |
| `envSetVal("layout" "cursorShape" 'boolean nil)` | 当前会话关闭十字光标；写入 `.cdsinit` 才会在后续启动时自动执行 |
| `envLoadFile("./.cdsenv")` | 显式加载指定 `.cdsenv` 文件 |
| `load("/home/user/skill/mySetup.il")` | 加载一个 SKILL 文件 |
| `when(isFile("/home/user/skill/project.il") load("/home/user/skill/project.il"))` | 文件存在时才加载，避免缺失文件直接中断初始化 |
| `printf("Loading personal settings\n")` | 在 CIW 打印标记，用来确认初始化文件确实执行到这里 |
| `editor = "/usr/bin/gvim"` | 某些版本可用该 SKILL 变量修改默认文本编辑器；程序路径按本机修改 |
| `virtuoso -nocdsinit` | 在终端以跳过 cdsinit 加载链的方式启动，适合隔离个人初始化错误；站点/PDK 初始化也可能同时被跳过，不建议作为日常工作方式 |

示例：安全加载个人快捷键文件。

```lisp
when(isFile("/home/user/skill/myBindKeys.il")
  load("/home/user/skill/myBindKeys.il")
)
```

示例：自定义一个原理图缩放快捷键。

```lisp
hiSetBindKey("Schematics" "<Key>f" "schZoomFit(1.0 0.9)")
```

快捷键会覆盖同键位的已有定义，修改前应备份安装版样例：

```text
$IC_DIR/tools/dfII/samples/local/schBindKeys.il
$IC_DIR/tools/dfII/samples/local/leBindKeys.il
```

也可以在 CIW → Options → Bindkeys 中查看当前定义。若不知道某个菜单操作对应的 SKILL 函数，先打开 CIW/日志的相关输出过滤，再手动执行一次菜单操作，通常能找到被调用的函数名。

## 5. ViVA：白底、前景、线宽、线型和字体

### 5.1 背景与曲线

以下写法针对 **ViVA 波形图**，不是 Schematic 或 Layout 画布。

| 配置 | 作用 |
|---|---|
| `envSetVal("viva.rectGraph" "background" 'string "white")` | 设置矩形波形图背景为白色 |
| `envSetVal("viva.rectGraph" "foreground" 'string "black")` | 设置波形图前景为黑色，改善白底下的坐标轴和文字可见性 |
| `envSetVal("viva.graphFrame" "background" 'string "white")` | 部分 IC618 及后续版本使用的图框背景项；旧版本不一定注册该变量 |
| `envSetVal("viva.trace" "lineThickness" 'string "thick")` | 默认曲线使用粗线 |
| `envSetVal("viva.trace" "lineStyle" 'string "solid")` | 默认曲线使用实线 |
| `envSetVal("asimenv.plotting" "useDisplayDrf" 'boolean nil)` | 不让 `display.drf` 的颜色/线型规则支配 ViVA 默认 Trace 显示；在部分版本中是白底配粗实线仍不生效的关键项 |

对应的 `.cdsenv` 写法：

```text
viva.rectGraph background string "white"
viva.rectGraph foreground string "black"
viva.trace lineThickness string "thick"
viva.trace lineStyle string "solid"
asimenv.plotting useDisplayDrf boolean nil
```

如果当前版本使用 `graphFrame`，再按本机生成的配置加入：

```text
viva.graphFrame background string "white"
```

> `useDisplayDrf` 在较新的 IC6.1.x ISR 中才出现。若 CIW 报“变量尚未注册”，不要继续强行设置，应删除该条或改用当前版本支持的入口。

### 5.2 字体、图例和有效数字

```lisp
; 坐标轴字体：下面只是旧式字体描述串示例
envSetVal("viva.axis" "font" 'string "Default,12,-1,5,50,0,0,0,0,0")

; A/B、Delta 等点标记字体
envSetVal("viva.pointMarker" "font" 'string "Default,12,-1,5,50,0,0,0,0,0")

; Trace Legend 字体；部分版本对该项的支持不完整
envSetVal("viva.traceLegend" "font" 'string "Default,12,-1,5,50,0,0,0,0,0")

; 图例位置，可选值以当前版本 GUI 为准
envSetVal("viva.rectGraph" "legendPosition" 'string "left")

; Calculator / 标注相关的显示有效位数
envSetVal("auCore.misc" "labelDigits" 'int 6)
```

字体描述串与操作系统、Qt/X11、已安装字体及 Virtuoso 版本有关。**优先在 ViVA 图形属性窗口里设置字体并保存默认值，再复制生成的字符串**，不要把上面的字体名当作跨平台通用值。

## 6. Layout：网格、捕捉、“分辨率”和 Cursor

### 6.1 先分清四个概念

| 概念 | 常见配置 | 实际影响 |
|---|---|---|
| 显示小网格 | `gridSpacing` | 屏幕上 Minor Grid 的间距，主要影响视觉参考 |
| 显示大网格 | `gridMultiple` | Major Grid 通常按小网格的倍数显示 |
| 编辑捕捉步长 | `xSnapSpacing` / `ySnapSpacing` | 创建或移动图形时坐标吸附的步长 |
| 工艺制造网格 / 数据库分辨率 | Technology File、PDK、DRC 规则 | 决定合法制造网格和数据库精度，不能靠上述显示选项替代 |

因此，“把默认版图分辨率设为 0.005”这句话通常实际指 **把 X/Y Snap Spacing 设为 0.005 个用户单位**。若当前工艺用户单位是 µm，它才对应 5 nm；若单位定义不同，物理含义也不同。该值必须符合工艺要求，不能因为某篇教程使用 0.005 就在所有 PDK 中照搬。

### 6.2 常用 Layout 配置

```lisp
; Minor Grid 间距示例
envSetVal("layout" "gridSpacing" 'float 0.1)

; Major Grid 为 5 个 Minor Grid
envSetVal("layout" "gridMultiple" 'int 5)

; X/Y 编辑捕捉步长示例
envSetVal("layout" "xSnapSpacing" 'float 0.005)
envSetVal("layout" "ySnapSpacing" 'float 0.005)

; 开启 / 关闭十字光标
envSetVal("layout" "cursorShape" 'boolean t)
envSetVal("layout" "cursorShape" 'boolean nil)

; 开启 / 关闭 Gravity，即对 Pin、Edge、Vertex 等对象特征的吸附
envSetVal("layout" "gravityOn" 'boolean t)
envSetVal("layout" "gravityOn" 'boolean nil)

; Gravity 搜索深度示例，具体像素语义以当前版本说明为准
envSetVal("layout" "gravityDepth" 'int 20)

; Gravity 吸附对象类型示例；字符串支持值随版本可能变化
envSetVal("layout" "gravityType" 'string "edge")

; 创建图形时的角度约束：正交
envSetVal("layout" "snapMode" 'string "orthogonal")

; 绘制 Path、Rect 等时显示辅助测量信息
envSetVal("layout" "measurementDisplayOn" 'boolean t)

; 默认层次显示范围示例
envSetVal("layout" "startLevel" 'int 0)
envSetVal("layout" "stopLevel" 'int 32)
```

对应 `.cdsenv` 示例：

```text
layout gridSpacing float 0.1
layout gridMultiple int 5
layout xSnapSpacing float 0.005
layout ySnapSpacing float 0.005
layout cursorShape boolean t
layout gravityOn boolean nil
layout gravityDepth int 20
layout gravityType string "edge"
layout snapMode string "orthogonal"
layout measurementDisplayOn boolean t
layout startLevel int 0
layout stopLevel int 32
```

要点如下：

- `cursorShape = t` 是十字光标，`nil` 恢复普通光标；
- `xSnapSpacing/ySnapSpacing` 是坐标网格捕捉，`gravityOn` 是对象特征吸附，两者可以同时存在，也可能互相产生“为什么吸到了别处”的错觉；
- `startLevel/stopLevel` 只控制层次显示范围，不会改变版图的物理精度；
- `snapMode` 常见取值有 `orthogonal`、`diagonal`、`anyAngle`，但工具域、类型和有效值最好用当前版本的 Save Defaults 结果核对；
- 某些 PDK 或窗口设置会在打开 CellView、切换 Entry Layer 时重新写入 Snap Spacing。启动时设置成功，不代表之后不会被窗口级或工艺级配置覆盖。

### 6.3 Layout XL 和默认打开方式

```lisp
; 新建 Mask Layout 时优先使用 Layout XL
envSetVal("graphic" "maskLayoutDefaultApp" 'string "Layout XL")

; 进入 XL 时不自动重排原理图和版图窗口
envSetVal("layoutXL" "autoArrange" 'boolean nil)

; 打开 Connectivity Reference 相关窗口/视图
envSetVal("layoutXL" "openConnRef" 'boolean t)
```

这些选项受许可证、已安装 Layout Suite、已有 CellView 属性及版本影响。例如新版本默认应用名称可能涉及 Layout EXL，旧变量不一定还能覆盖 GUI 的选择。应以当前版本的 Layout 启动选项和 `.cdsenv` 样例为准。

## 7. Schematic 常用配置

```lisp
; 新建 Symbol 默认采用 analog 模板
envSetVal("schematic" "tsgTemplateType" 'string "analog")

; 交叉但未连接的导线不自动生成连接点，并忽略相应提示
envSetVal("schematic" "srcSolderOnCrossover" 'cyclic "ignored")

; 原理图编辑角度模式示例
envSetVal("schematic" "snapMode" 'string "anyAngle")
```

`srcSolderOnCrossover` 改变的是交叉导线连接点的处理/检查行为，**不是简单的“隐藏警告”按钮**。修改前应确认团队对交叉连线、连接点和 ERC 的约定，避免把真正的误连接或漏连接掩盖掉。

## 8. ADE / Spectre 常用配置

```lisp
; 默认仿真器
envSetVal("asimenv.startup" "simulator" 'string "spectre")

; 默认仿真结果工程目录
envSetVal("asimenv.startup" "projectDir" 'string "/home/user/simulation")

; ADE State 默认保存目录
envSetVal("asimenv" "saveDir" 'string "/home/user/simulation_states")

; Spectre 模型搜索路径：按项目实际目录修改
envSetVal("spectre.envOpts" "modelPath" 'string "/home/user/models")
```

对应 `.cdsenv`：

```text
asimenv.startup simulator string "spectre"
asimenv.startup projectDir string "/home/user/simulation"
asimenv saveDir string "/home/user/simulation_states"
spectre.envOpts modelPath string "/home/user/models"
```

注意：

- `projectDir` 是仿真数据目录，`saveDir` 是 ADE State 相关目录，两者不是同一个概念；
- 共享服务器上建议使用个人可写目录，并考虑磁盘配额和仿真数据清理策略；
- 模型路径通常由 PDK 的项目脚本统一管理。个人 `.cdsinit` 若在 PDK 初始化之后再次覆盖，可能造成 model section、include 路径或版本混用；
- ADE Assembler、Explorer、XL、L 对 State 和结果目录的行为可能不同，应以当前 ADE 模式验证。

## 9. 为什么改了却不生效

按下面顺序排查，通常比反复重启更有效。

### 9.1 文件是否真的被加载

在个人初始化文件开头临时加入：

```lisp
printf("MY CDSINIT LOADED\n")
```

重启后检查 CIW。如果没有输出，先检查站点实际加载链，而不是继续修改后面的参数。`.cdsenv` 则可用一个容易识别且无副作用的选项测试，并检查 `CDS_LOAD_ENV` 和启动目录。

### 9.2 是否被后面的配置覆盖

可能的覆盖来源包括：

- 后加载的 `.cdsinit` 覆盖此前的 `.cdsenv`；
- 站点、项目、PDK 的 SKILL 脚本覆盖个人值；
- CellView、Library、Tech Library 保存的窗口属性覆盖全局默认值；
- ADE/ViVA 的已保存 State、Graph Setup 覆盖全局默认图形样式；
- 同名设置写了多次，以最后执行的一次为准。

可在 CIW 中查询：

```lisp
envGetVal("viva.rectGraph" "background")
envGetVal("viva.trace" "lineThickness")
envGetVal("layout" "xSnapSpacing")
envGetVal("layout" "cursorShape")
```

### 9.3 变量是否已注册、类型是否正确

典型报错是：

```text
*WARNING* envSetVal: Can't set the value of variable ...
it has not been registered
```

常见原因：

1. 当前版本根本没有这个变量；
2. 变量属于另一个工具域；
3. 对应工具尚未初始化，启动过早执行 `envSetVal()`；
4. 把 `cyclic` 写成 `string`，或把 `boolean` 写成字符串；
5. 使用了当前版本不接受的枚举值。

此时优先采用当前版本的 `.cdsenv` 模板或 GUI Save Defaults 生成条目。`envSetVal()` 执行成功也只说明环境值被接受，**不保证已经打开的窗口立即刷新，更不保证后续 PDK 脚本不会覆盖它**。

### 9.4 是否需要重启

- 修改 `.cshrc` 后，先 `source ~/.cshrc`，再从该终端重新启动 Virtuoso；
- 修改 `.cdsinit` 后，最可靠的验证方式是重启，也可在 CIW 手动 `load()` 做临时测试，但重复执行脚本可能有副作用；
- 修改 `.cdsenv` 后，可研究 `envLoadFile()` 做临时加载，但最终仍应通过全新启动验证；
- ViVA 已存在的 Graph、ADE 已保存的 Results/State、Layout 已打开的窗口都可能保留自己的属性，需要新建窗口或结果验证“默认值”。

## 10. 推荐的管理方式

1. **先备份再修改**：保留原始 `.cdsinit`、`.cdsenv` 和站点样例；
2. **简单选项优先放 `.cdsenv`**：可读性好，也较少受到 SKILL 执行时机影响；
3. **需要逻辑和加载脚本时放 `.cdsinit`**：例如存在性判断、个人 bindkey、项目自动加载；
4. **Shell 配置只负责启动环境**：不要把 SKILL 代码混进 `.cshrc`；
5. **个人配置与 PDK 配置分离**：模型路径、工艺网格等由项目脚本统一维护，个人文件只覆盖确有需要的偏好；
6. **用 GUI 反查变量**：先手动操作并观察 CIW/CDS.log，或 Save Defaults 后比较文件差异；
7. **一次只改一组并记录**：出现问题时容易定位，不要把几十条来源不明的配置一次性复制进去；
8. **保留版本说明**：记录 IC/ISR、PDK、操作系统和适用 ADE/ViVA 模式。

## 11. 速查：该写到哪里

| 需求 | 首选位置 | 关键命令/变量 |
|---|---|---|
| 设置安装路径、License、`PATH` | `.cshrc` 或站点启动脚本 | `setenv`、`set path` |
| 让项目目录 `.cdsenv` 被加载 | `.cshrc` | `setenv CDS_LOAD_ENV addCWD` |
| 单纯保存工具默认选项 | `.cdsenv` | `工具域 变量 类型 值` |
| 启动时执行条件判断、加载 SKILL | `.cdsinit` | `when()`、`isFile()`、`load()` |
| 新建 Symbol 默认 analog | 两者均可 | `schematic tsgTemplateType` |
| ViVA 白底黑字 | 两者均可 | `viva.rectGraph background/foreground` |
| ViVA 默认粗实线 | 两者均可 | `viva.trace lineThickness/lineStyle` |
| Layout 显示网格 | 两者均可 | `layout gridSpacing/gridMultiple` |
| Layout 编辑捕捉步长 | 两者均可 | `layout xSnapSpacing/ySnapSpacing` |
| Layout 十字光标 | 两者均可 | `layout cursorShape` |
| Layout 对象吸附 | 两者均可 | `layout gravityOn/gravityType` |
| 默认仿真器和数据目录 | 两者均可，注意 PDK 覆盖 | `asimenv.startup simulator/projectDir` |
| 自定义快捷键 | `.cdsinit` 或独立 `.il` 后加载 | `hiSetBindKey()` |
| 查询当前值 | CIW | `envGetVal()` |

## 参考资料

- [INFN：Cadence environment and setup files](https://wiki.to.infn.it/vlsi/workbook/analog/cdsenv)：配置文件搜索路径、加载顺序和样例位置。
- [Cadence Community：ViVA Customization using .cdsinit](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/33725/viva-customization-using-cdsinit)：ViVA Trace 线型、线宽和字体配置。
- [Cadence Community：Setting a default background color to white in ViVA](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/41531/setting-a-default-background-color-to-white-in-viva)：ViVA 背景和前景配置。
- [Cadence Community：Changing default settings of Virtuoso Layout XL](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/34823/changing-default-settings-of-virtuoso-layout-xl)：Layout 网格和捕捉选项。
- [Cadence Community：Bindkey for turning off the Cross Cursor in Layout](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/57809/bindkey-for-turning-off-the-cross-cursor-in-layout)：Layout Cross Cursor 与 `cursorShape`。

本机最权威的参考仍是当前安装版本的 *Virtuoso Software Licensing and Configuration User Guide*、对应工具环境变量手册，以及 `$IC_DIR/tools/dfII/samples/` 下的样例文件。
