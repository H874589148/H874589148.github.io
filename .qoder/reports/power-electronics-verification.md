# 电力电子波形工具 · 验收报告

- 日期：2026-09-25
- 被验对象：`tools/power-electronics/`（engine.js、worker.js、script.js、topologies.js、index.html、style.css、razavi 图纸渲染）
- 原始需求：核验各拓扑波形是否正确、是否与输入信息匹配；原始缺陷为「Buck 输出电压纹波并非由用户输入的输出电容、开关频率、电感电流等参数计算得到」
- 方法：本地静态服务 `127.0.0.1:8791` + 浏览器逐项取证（观察取证，不改产品代码）；截图证据见同目录 `pe-verify-evidence/`
- 前置：55 项自动化测试全绿后方可进入浏览器轮

## 一、总体结论

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 通过 | 47 项断言 | 六拓扑数值与参数关联、模式判定、守恒诊断、异常路径、防抖/取消、拓扑存储、主题、光标读数 |
| 未验证 | 4 项 | 窄屏真实布局、CSV 真实下载、pointerleave 真实鼠标、第 4 轮截图证据（见第四节） |
| 失败 | 0 | 与需求无遗留不一致，无需切换模型后返工 |

原始缺陷已修复并经参数变化反向验证：Buck 纹波由 Vin、D、L、Cout、fsw、Iout 同一状态方程解出，与解析公式 \(\Delta V_{out}=\Delta i_L/(8 f_{sw} C_{out})\) 一致。

## 二、自动化测试（前置门槛）

共 55 项全部通过（`node --test`，node 绝对路径运行）：

| 文件 | 项数 | 覆盖 |
| --- | --- | --- |
| tests/engine.test.js | 39 | 六拓扑默认/轻载稳态、独立 RK4 交叉验证、参数依赖矩阵（全字段）、逐段 KVL/KCL 与二极管约束、失败保护（超时/极端占空比/LLC 重载，错误码白名单） |
| tests/ui.test.js | 10 | 可控 DOM/Canvas/Worker 夹具：输入解析、初始计算、CSV 数据、DPR、mV/µV 刻度、单位切换、拓扑独立存储、过期/防抖/迟到结果、取消与错误、锁定纵轴、卸载清理、Worker 协议 |
| tests/topologies.test.js | 6 | 六拓扑 Razavi 图纸引脚网络连通（含 Buck 双模式、反相极性、DSD 两相、隔离参考地）、SVG 无 NaN/undefined |

`node --check` 全部脚本通过；`git diff --check` 无空白问题；变更仅限 `tools/power-electronics/` 与测试文件。

## 三、浏览器逐项取证

### 3.1 第 1 轮：Buck 主链路与显示控制（9 项通过）

| # | 输入 | 预期 | 实测 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 默认 Vin=12 V、D=0.5、L=10 µH、Cout=100 µF、fsw=500 kHz、Iout=2 A | Vout≈6 V、CCM；周期 T=2 µs | Vout=6 V、ΔVout=1.5002 mV、T=2 µs、iL pp=600.05 mA、模式 CCM、状态栏「周期稳态已求得…已通过周期闭合、守恒及采样加密检查」 | 01-buck-default.png |
| 2 | Cout 100→200 µF | 纹波减半（∝1/Cout） | ΔVout=750.04 µV | 02-buck-cout200.png |
| 3 | fsw 500→1000 kHz | iL pp 与 ΔVout 均减半 | iL pp=300.01 mA、ΔVout=375.01 µV | 03-buck-fsw1000.png |
| 4 | 输出电压视图=完整 Vout | 显示含直流的完整波形 | 刻度与曲线为完整 Vout（非去直流纹波） | 04-vout-dc.png |
| 5 | Cout=1 µF（大纹波场景）+ 纵轴锁定后改参 | ΔVout=ΔiL/(8·fsw·Cout)=0.6/(8×5e5×1e-6)≈0.15 V；锁定后改参提示「超出锁定范围」 | ΔVout=151.58 mV（与公式一致；校验清单原预期「~15 mV」为笔误，已按公式修正）；裁剪提示出现 | 05-locked-clip.png |
| 6 | 指针悬停波形（pointermove） | 读数行随位置给出 t 与通道值 | t=1.7784→1.7984 µs 连续读数 | 06-cursor.png |
| 7 | 修改输入触发过期 | 光标行加「旧结果（已过期）」前缀、导出按钮禁用 | 前缀出现、按钮禁用、状态栏提示旧结果不代表当前输入 | 07-stale.png |
| 8 | 同步模式、Iout=0.1 A | 允许反向电感电流、Vout 维持 6 V；通道含 iReturn、无 iD | iL min=−200.03 mA、Vout=6 V、存在 iReturn 通道 | 08-sync-light.png |
| 9 | 二极管续流、轻载 | 自动进入 DCM、Vout 高于 CCM 值 | 模式 DCM、Vout=9.0002 V | 09-buck-dcm.png |

### 3.2 第 2 轮：Boost / Buck-Boost / Flyback / DSD、拓扑存储与图纸（23 项通过）

关键断言：

- Boost（Vin=12 V、D=0.5）：Vout=23.999 V（理想 24 V，含器件压降修正）。证据 10-boost.png
- Buck-Boost：Vout=−11.999 V（−D/(1−D)·Vin=−12 V）；iCout 均值 80.566 pA≈0（电容电荷守恒）。证据 11-buckboost.png
- Flyback（n=2）：Vout=5.999 V（Vin/n=6 V）；isec=2 A；VDS max=24.016 V（Vin+n·Vout=24 V）。证据 12-flyback.png
- DSD（两相）：Vout=1.5 V；i1、i2 各 1000 mA（2 A 负载两相均流）。证据 13-dsd.png
- DSD D=51 → 报错「占空比超出允许范围」，不生成结果。证据 14-dsd-error.png
- 拓扑独立存储：Buck 的 L=23 µH 切换到其他拓扑再切回后保留；切回时波形区清空、等待当前拓扑计算。证据 15-store.png
- LLC 参数面板：无占空比 D 字段；fsw 输入框反填 232.15133666992188 kHz（由 Lr、Cr 算出的谐振频率全精度字符串）。证据 16-llc-params.png
- 六拓扑电路图渲染：引脚网络连通、无 NaN/undefined 文本、随拓扑切换更新。证据 16-fig-boost / 16-fig-buckboost / 16-fig-flyback / 16-fig-llc / 16-fig-dsd.png（13-dsd.png 兼证）

### 3.3 第 3 轮：LLC、异常输入、取消与防抖（全部通过）

- LLC 默认参数：状态栏「整流连续传能（周期稳态）」；参考频率 fr=232.15 kHz、fm=97.237 kHz；11 张波形卡片（vHB、ir、im、iTransfer、isec、vCr、vp、Vout、iCout、Q1、Q2）。证据 17-llc.png
- LLC fsw=500 kHz、Iout=2 A：明确报错 `[POLARITY] LLC 候选工作点的输出极性失效`，旧结果标记过期，不生成示意幅值。证据 18-llc-error.png
- 异常输入三类文案：空值→「请输入有效数值」；Iout=0→「空载工作不在当前模型范围」；负值→「必须为有限正数」。证据 19a/19b/19c-input-*.png
- 取消：计算进行中点击「取消」成功终止，状态复位且旧结果过期（第 3 次尝试内成功，前两次因计算过快未捕获运行态）。证据 20-cancel.png
- 150 ms 防抖：连续快速输入仅触发一次计算，最终按 fsw=1000 kHz 求解、iL pp=300.01 mA。证据 21-debounce.png

### 3.4 第 4 轮：主题、显示周期数、AC 光标（程序化取证通过，截图缺失）

- 暗色主题：`data-theme="dark"` 生效；卡片背景 rgb(46,43,39)；SVG 电路图线条 rgb(232,228,220)；Canvas 重绘读取主题变量，波形文字/网格随主题变化。切回亮色恢复正常。
- 显示周期数 1→5：仅触发重绘，计算次数计数不变（不重算）。
- AC 光标读数：纹波视图下光标行输出「t=1.7654 µs · Vout=6.0005 V · Δvo=538.69 µV」（Δvo 为扣除均值后的瞬时值，与视图语义一致）。
- 截图故障：自本轮起截图返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`（浏览器视图不可见，visibilityState=hidden），补救轮（第 5 轮）同样失败；错误提示需在 IDE 中重新聚焦/打开 Browser 视图。22-dark、23-light-back、24-narrow、25a/25b、26a/26b 未获取，本节数据为浏览器内程序化断言取证。

## 四、未验证项及原因

| 项 | 原因 | 现有覆盖 |
| --- | --- | --- |
| 窄屏（<720 px）真实布局 | 浏览器工具无法调整视口（resizeTo 受安全限制，innerWidth 恒 1170 px） | CSS 媒体查询、`.pe-charts{min-width:0}`、按拓扑 svg min-width、canvas 最小宽 160 为静态核验；ui.test.js 已含窄宽断言（10 项之一） |
| CSV 真实下载 | 下载会落入 C 盘下载目录，违反本任务「不向 C 盘写临时数据」约束 | CSV 数据与波形同源（同一 result 序列化）由自动化覆盖；导出按钮状态（禁用/启用随过期切换）已经浏览器验证 |
| pointerleave 读数重置 | 合成派发事件未触发（合成事件局限），需真实鼠标复验 | pointermove 读数、键盘 ←/→ 光标均已浏览器验证 |
| 第 4 轮截图证据 | 浏览器视图未聚焦（NATIVE_BROWSER_VIEWPORT_UNAVAILABLE） | 本轮数据断言已程序化取证；如需留档，聚焦 Browser 视图后可补拍 |

## 五、与需求的差异核对

原始缺陷：Buck 输出纹波不是由输入参数计算得到。

核验证据链：

1. Cout 100→200 µF：1.5002 mV→750.04 µV（∝1/Cout）；
2. fsw 500→1000 kHz：iL pp 600.05→300.01 mA、ΔVout 1.5002→375.01 µV（∝1/fsw）；
3. Cout=1 µF：公式值 0.15 V，实测 151.58 mV；
4. 其余五拓扑输出/电流/磁通波形均与输入参数联动（Boost 23.999 V、Buck-Boost −11.999 V、Flyback 5.999 V、DSD 1.5 V 均流 1 A/相、LLC 谐振频率由 Lr/Cr 派生），且每次结果附带周期闭合、电荷/伏秒守恒、功率误差与采样加密诊断。

**结论：无遗留不一致，无需修改代码。**

## 六、证据索引

- 截图 30 张：`.qoder/reports/pe-verify-evidence/`（01–09 Buck、10–16 四拓扑与图纸、17–21 LLC/异常/取消/防抖；另有 01-buck-default-vout.png、01-buck-default-wave.png 为首轮分镜留存）
- 测试命令：`node --test tools/power-electronics/tests/engine.test.js tools/power-electronics/tests/ui.test.js tools/power-electronics/tests/topologies.test.js`
- 校验用静态服务已停止；`_tmp/` 任务临时文件（pe-server.js、pe-verify/）已按回收站规则清理

## 七、遗留建议

1. 如需补齐第 4 轮截图留档：在 IDE 中重新聚焦/打开 Browser 视图后即可补拍，无需代码改动。
2. 窄屏与真实鼠标 pointerleave 可在日常使用中顺手确认；自动化已覆盖核心逻辑。
3. CSV 下载如需人工核验，可在本地打开页面后自行点击导出（数据同源性已由测试保证）。
