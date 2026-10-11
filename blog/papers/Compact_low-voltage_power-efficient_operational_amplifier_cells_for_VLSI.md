---
title: 面向 VLSI 的紧凑低电压高能效运算放大器单元（折叠网孔 class-AB 输出级）
date: 2026-10-11
tags: [analog]
authors: Klaas-Jan de Langen, Johan H. Huijsing
source: IEEE JSSC, vol. 33, no. 10, Oct. 1998, pp. 1482–1496（Delft 理工；标准数字 1.6 μm CMOS）
abstract: 两级紧凑运放的最低电源由输出级决定：常规前馈 class-AB mesh 需 2V_GS+V_DSsat，本文把 class-AB 控制从前馈浮动电压源改成"测流管 + 控制块 + 折叠网孔"的反馈结构（folded mesh），最低电源降到 1V_GS+2V_DSsat≈1.8 V，且不增加噪声/失调（复用求和电路偏置电流）。配套无电阻简单 minimum selector 维持最小电流。R-R 输入版用第二个折叠网孔实现浮动电流源 + 3:1 电流开关 gm 控制，输出电流与共模无关。0.08/0.1 mm² 两款：UGF 4 MHz、PM 67°@5 pF、供电电流 184/230 μA、最低 1.8 V（R-R 版 2.5 V）。
readtime: 7
---

> **原文**：*Compact Low-Voltage Power-Efficient Operational Amplifier Cells for VLSI*, K.-J. de Langen, J. H. Huijsing（Delft 理工）, IEEE JSSC, 1998.
> **TL;DR**：站内 [Hogervorst 1994](A_compact_power-efficient_3_V_CMOS_rail-to-rail_input_output_operational_amplifier_for_VLSI_cell_libraries.md) 把库单元运放做到 3 V 全轨输入输出，这篇是同门的后传：电源再砍到 **1.8 V**。关键一步是认清"两级紧凑运放的电源下限卡在输出级的 class-AB 控制上"——常规头对头 mesh 需要 2V_GS+V_DSsat。作者把浮动电压源**折叠**：输出管电流先被测流管测出来，经控制块（内含 minimum selector）生成控制电压去驱动折叠网孔管。前馈变反馈，2V_GS 变 1V_GS+2V_DSsat，还顺便白拿了一个最小电流保持功能。0.08 mm²、184 μA、UGF 4 MHz——这就是"cell"该有的样子。

## 背景与动机

- 混合信号 VLSI 里数字 cell 随工艺缩小直接受益，模拟 cell 却因噪声/失调不能用最小尺寸管、低电源又逼出复杂电路——唯一的追赶方式是**高能效拓扑**：低电压 + 高效率 + 小面积三者兼得。
- 两难现状：要到极限低电源（1V_GS+1V_DSsat）需要至少四级结构（如站内 [Eschauzier 1.5 V HNMC](A_programmable_1.5_V_CMOS_class-AB_operational_amplifier_with_hybrid_nested_Miller_compensation_for_120_dB_gain_and_6_MHz_UGF.md)）；而简单两级拓扑（Miller 补偿、两级增益）通常要 2.7–3.0 V。
- 两级紧凑拓扑的电源下限分析：输出级供电 = 输出管 V_GS(N) + class-AB 控制浮动电压源 V_AB。理想 class-AB 控制 $V_{AB}=V_{GS,P,ref}+V_{GS,N,ref}$（式 1，V_GS,N,ref 在低压下可为负）——理论上限极低，实际被实现方式卡住：**前馈 mesh 实现要求浮动电压源两端各再叠一个 V_GS（2V_GS+V_DSsat）**。

## 关键方法

### 1. 三代 class-AB 控制的演进（Section II）

| 方案 | 结构 | 最低电源 | 问题 |
|---|---|---|---|
| 常规 mesh（Fig 2） | 头对头互补管前馈浮动电压源 | 2V_GS+V_DSsat | 两个 V_GS 串联抬高压端 |
| mesh+二极管移位（Fig 3） | 二极管管挪进 mesh 做电平移位 | 1V_GS+… | 深驱动时输出管 cutoff；电流源/cascode 无偏置空间；增益不足 |
| **折叠网孔反馈（Fig 4）** | 测流管→控制块（含 minimum selector）→控制电压 V_C 驱动折叠 mesh 管 | **1V_GS+2V_DSsat（≈1.8 V）** | 多一个 class-AB 反馈环需稳定 |

- **mesh 阻抗的两面性**（式 2–9）：静态时 mesh 阻抗低（式 9，$Z_{mesh}\approx 1/(g_{m,AB}\cdot g_m/(\cdots))$ 量级），把两输出管栅"并联"起来维持 V_AB；当一管大电流时其栅压被控制环钳住、另一测流管关断（gm→0），mesh 阻抗变大——信号电流经 cascode **全部**导向导通的输出管，一个都不浪费。这正是前馈 mesh 想要的"浮动电压源"行为，但用反馈实现。
- **零成本噪声/失调**：mesh 管偏置电流直接复用求和电路（电流镜+cascode）已有的偏置电流，不加电流源；对 class-AB 共模信号 mesh 管是差分对（不进输出路径），对正常差模信号是 cascode（不贡献噪声）——class-AB 功能免费。
- **class-AB 环稳定性**（式 10–12）：环可视为单级跨导放大器，负载是 Miller 电容与栅源电容的并联。静态 UGF 最小；一管大电流时 UGF 升高（双极/弱反型下与状态无关，强反型下只升 √2）。设计约束：class-AB 环 UGF 应**高于**主环 UGF（保证全带宽内偏置受控）、**低于** minimum selector 的寄生极点；相位裕度最差点在 PMOS 输出管大电流时（控制路径最长），必要时降控制放大器 gm 修复。

### 2. 简单 minimum selector（Fig 6，Section III）

- 测流管电流经镜像进入 selector：M_S 主要工作在线性区，静态时它与其串联管等效"双长管"——输出级静态电流由参考电流 I_ref 按固定比例设定（式 14）。
- 一管大电流时 selector 进入饱和，变成 cascoded 镜像，把**关断侧输出管的电流钳在 $I_{min}=I_Q/2$**（式 15），杜绝 cutoff 与交越失真。class-AB 特性曲线（式 16，仅 M_S 线性区有效）见 Fig 6(c)。
- 无电阻（对比 Fig 5 二极管 decision pair 需要精确大电阻）、组件最少、只需测流支路的偏置电流——能工作在最低电源（1V_GS+1V_DSsat，加上折叠网孔再 +1 V_DSsat）。

### 3. R-R 输入版：第二个折叠网孔 + 电流开关 gm 控制（Section IV）

- R-R 输入级需 2V_GS+2V_DSsat（2.5 V）。常规版需要"两镜像+浮动电流源"的特殊求和电路来吸收输入级电流随共模的变化；本文用**第二个折叠网孔**实现浮动电流源：class-A 控制环测 PMOS/NMOS 镜像偏置电流之和，反馈调节浮动电流源管栅压——与输出级 class-AB 控制完全同构。
- **gm 控制用电流开关**（避免电子齐纳二极管复杂反馈）：共模中间区电流开关抽走 3/4 偏置电流，使每个输入对 gm 减半；开关管与输入管构成 MOS translinear 环（式 24），W/L 比 3:1。极限情形 gm 偏差 13%（Fig 10(b)），实测 18%。
- Fig 12 改进：开关管一分为二、漏极接到对应输入管漏极——输入级**输出电流不再随共模变化**，于是能复用 PMOS 版的简单求和电路；代价是开关管与输入管并联贡献噪声（用小尺寸开关管控制）。

## 实验结果与性能指标

标准数字 1.6 μm CMOS；负载 10 kΩ∥5 pF；HP 4195A 网络分析仪。

| 指标 | PMOS 输入版 | R-R 输入版 |
|---|---|---|
| die 面积 | **0.08 mm²** | 0.1 mm² |
| 最低电源 | **1.8 V** | 2.5 V |
| UGF / PM | 4 MHz / 67° | 4 MHz / 67° |
| 供电电流 | 184 μA | 230 μA |
| DC 增益（10 kΩ） | >80 dB | >80 dB |
| 等效输入噪声@100 kHz | 38 nV/√Hz | — |
| 1 V 阶跃（1%/0.1% 建立时间） | 380/465 ns | 370/465 ns |
| 压摆率 | 4 V/μs | 4.5 V/μs |
| 带宽-功耗 FOM（式 25，C_L=10 pF） | **6 MHz/mW** | 4.8 MHz/mW |

- FOM 定义 $f_{UGF}C_L/P_{sup}$（式 25，加 C_L 项以便跨负载比较）——对比常规紧凑运放 4 MHz/mW，折叠网孔版本能效更高。
- 补偿与稳定性核算：C_M1=1.4 pF、C_M2=8 pF、C_L=2 pF、gm=1 mA/V → 第二极点 10 MHz（式 20），PM 60° 要求 UGF≈5 MHz；RHP 零点在 UGF 处仅 4° 相移（式 22–23），无需专门消除；20% 跨导失配 + 20 mV 控制放大器失调 → PM 只降 2–5°，60° 设计裕量足够。
- R-R 版失调随共模变化约 8 mV（电流开关切换区），使单位增益 THD 降至约 −40 dB；gm/UGF 随共模波动 18%（vs 理论 13%）。

## 个人思考与总结

- **"前馈改反馈"是低电压设计里被低估的杠杆**：浮动电压源（前馈）天生要承担信号路径的电压余量（2V_GS），改成"测量-控制"反馈环后电压余量只剩 1V_GS+2V_DSsat——作者付出的只是 class-AB 环稳定性分析（式 10–12）。这与站内 [混合 SM 环路分析](TCASII2022_Loop_Analysis_and_Stability_Considerations_of_Hybrid_PA_Supply_Modulators.md)"把线性辅助环拆成可控反馈环"的思路互为镜像：功率域用前馈抢速度、模拟域用反馈换余量。
- **minimum selector 与功率电子的"最小电流维持"同构**：输出级防 cutoff 的 I_min=I_Q/2 钳位，和站内 buck 的零电流检测、ET SM 的反向电流防护是同一设计约束（避免器件全关导致交越失真/振铃/削顶）在三个物理域的化身——跨域迁移时先找这种"结构性同题"。
- **库 cell 的价值观：FOM 把 C_L 归一化**：式 25 特意把负载电容写进品质因数，因为"cell"要在不同负载下被比较、被复用。0.08 mm² + 184 μA + 4 MHz 的意义不在绝对性能，而在**可移植的能效基准**——站内 [rail-to-rail 缓冲器](ISCAS1995_Novel_circuit_solutions_for_rail-to-rail_CMOS_buffer.md)的三分量电流源、本文的折叠网孔，都是"为库而设计"催生的结构创新。

> **可关联工具**：两级 Miller 补偿 + class-AB 环的双环稳定性可用站内 [Bode 绘图](../../tools/bode-plot/index.html) 与 [传递函数](../../tools/transfer-function/index.html) 复算式 19–23；gm 控制切换偏差可用 [高斯/统计工具](../../tools/gaussian/index.html) 评估失配预算。
