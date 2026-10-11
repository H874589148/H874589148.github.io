---
title: 采用混合嵌套 Miller 补偿的可编程 1.5 V CMOS class-AB 运算放大器（120 dB 增益、6 MHz UGF）
date: 2026-10-11
tags: [analog]
authors: Ruud G. H. Eschauzier, Ron Hogervorst, Johan H. Huijsing
source: IEEE JSSC, vol. 29, no. 12, Dec. 1994
abstract: 为摆脱 cascode 对电源与阈值电压的双重限制，Delft 组提出四级共源级联 + 混合嵌套 Miller 补偿（HNMC）：两级 Miller 环并置同层，嵌套层级从 NMC 的三层减到两层，四级带宽追平三级 NMC；再加 multipath 输入级直驱输出管（MHNMC）带宽再翻倍。0.8 μm CMOS 实测 120 dB/6 MHz @1.5 V/300 μA，可编程至 16 μA/1.1 V/400 kHz。
readtime: 6
---

> **原文**：*A Programmable 1.5 V CMOS Class-AB Operational Amplifier with Hybrid Nested Miller Compensation for 120 dB Gain and 6 MHz UGF*, R. G. H. Eschauzier, R. Hogervorst, J. H. Huijsing（Delft 理工大学）, IEEE JSSC, 1994.
> **TL;DR**：cascode 拿增益的老路被两把刀架着——最低电源高出一个 $V_{DSAT}$，且未来低阈值工艺会把 cascode 管撑爆（阈值低于约 350 mV 即失效）。本文用**四级反相共源级联**替代 cascode 拿 120 dB 增益，难点（四级频率补偿）用 **HNMC** 解决：把两级 Miller 环放到同一嵌套层级，嵌套层数减一，四级运放的带宽等于三级 NMC；**MHNMC** 再用 multipath 输入级直接驱动输出管，带宽翻倍到 6 MHz。静态电流还可编程：300 μA→16 μA 时最低电源 1.1 V、总功耗 17 μW。

## 背景与动机

CMOS 运放靠 cascode 拿增益，但 cascode 有两个根本限制：

1. **最低电源电压**：驱动电路中输出管栅源之上叠着两个 cascode 的漏源电压，$V_{DD,min} = V_{GS,out,max} + 2V_{DSAT}$，比理论极限高一个饱和压降；
2. **低阈值工艺不友好**：输出管 $V_{GS}$ 随 $V_{th}$ 等比例下降，而 $V_{DSAT}$ 不降——当堆叠的 $2V_{DSAT}$ 塞不进 $V_{GS}$ 时必须把 cascode 管加宽，但 $V_{DSAT}$ 有亚阈值饱和电压（约 100 mV）的物理下限；叠加阈值失配的 3σ（约 150 mV），可推得 cascode 运放可存在的最低工艺阈值约 350 mV。阈值持续下降的趋势意味着这一大类电路终将失效。

"终极低电压"（ultimate low-voltage）拓扑的两条设计律：**输出管栅源之间至多一个堆叠 $V_{DS}$，其上至多再叠一个 $V_{DS}$**。四级共源级联能满足，但四级运放的频率补偿是公认难题——传统嵌套 Miller 补偿（NMC）虽可补偿四级，却在输出管栅源间引入两个堆叠 $V_{DS}$，违背设计律，且每加一层嵌套带宽约折半。

## 关键方法

### 1. HNMC：同层并置的两级 Miller 环

四级结构：输入差分级 → 三个共源级（含推挽输出级）。HNMC 的关键是 $C_{m1}$、$C_{m2}$ **处于同一嵌套层级**（而不是像 NMC 那样逐级嵌套三层），最外层 $C_{m3}$ 从输出端反馈到第二级输入。所有反馈环符号验证为负（传统 NMC 的中间电容会闭合正反馈环）。逐级极点分裂后得到 20 dB/dec 滚降。

按最大平坦（Butterworth）响应设计，尺寸方程与**三级 NMC 相同**（仅多出 $C_{m3}/C_{m2}$ 因子）——因为四级 HNMC 只有两个嵌套层级，带宽损失等于三级 NMC，即相对普通单 Miller 只降 $\sqrt{2}$ 倍：

$$
\omega_t \approx \frac{g_{m10}}{2\pi C_L}\;\Big/\sqrt{2}\quad\text{（HNMC）}
\qquad\text{vs.}\qquad
\omega_t \Big/ 2\quad\text{（四级 NMC）}
$$

另要求"电压放大器"（第三级 $M_{30}$ 与 $C_{m2}$ 构成的积分器）自身的极点 $g_{m30}/C_{m3}$ 远在其反馈闭环 UGF 之上，以消除该极点的影响。

### 2. MHNMC：multipath 输入级直驱输出管

HNMC 带宽仍比两级 Miller 低 $\sqrt{2}$。MHNMC 增加一路**附加输入级直接驱动输出管**：高带宽、低增益的两级通路（附加输入级+输出级）与低带宽、高增益的四级 HNMC 通路并联合成，UGF 由高带宽通路决定，比 HNMC 式再翻一倍：

$$
\omega_{t,\text{MHNMC}} = 2\,\omega_{t,\text{HNMC}} \approx \frac{g_{m,\text{mp}}}{2\pi C_L}
$$

偏置电流分配因子（1/20 与 1/10）使四级主通路电流大幅降低，正好抵消 multipath 输入级的额外电流——**带宽提升几乎不付功耗代价**，且更高带宽允许更小的补偿电容，面积不增。multipath 特有的极零 doublet 只依赖跨导比与电容比，标准 CMOS 可匹配到 1%（阶跃响应无可检出的慢建立分量）。

### 3. 反馈式 class-AB 控制

测量管 $M_{580}/M_{590}$ 采样两输出管电流并转为栅压，控制放大器中的判决对（$M_{510}/M_{520}$）**选出较小电流者**与参考电压比较，修正信号馈入第三级维持最小静态电流；同时一路相同的修正信号经电流镜**直连输出管**（绕过第三级的低增益高频平行路径），保证 class-AB 控制环自身稳定——与整体补偿中的 multipath 思想同构。该控制电路器件尺寸极小，版图面积可忽略。

## 实验结果与性能指标

标准 $V_{th}$=0.6 V、0.8 μm CMOS，芯片 0.05 mm²，负载 10 kΩ ∥ 10 pF，100 mV 阶跃：

| 工作点 | HNMC | MHNMC |
|---|---|---|
| 电源电流 300 μA @ 1.5 V | UGF 2 MHz | **UGF 6 MHz** |
| DC 增益 | 120 dB | 120 dB |
| 建立时间（1%） | 320 ns | 140 ns |
| 电源电流 16 μA（可编程） | UGF 400 kHz | UGF 400 kHz（带宽同比缩） |
| 最低电源 / 总功耗 | **1.1 V / 17 μW** | 同左 |

输出级为 rail-to-rail 推挽（P 输入对 + 折叠共源共栅保证含负轨的共模范围，电流镜 $M_{160}/M_{180}$ 完成差分-单端转换）。两个版本的芯片面积几乎相同——multipath 输入级没有面积代价。

## 个人思考与总结

- **"用级联换 cascode"是低电压高增益的范式转移**：cascode 用电压堆叠换增益（阻抗提升），级联用级数换增益（跨导串联）——前者被电源和阈值双重挤压，后者只要补偿跟得上就能一路降到"每输出管只叠一个 $V_{DS}$"的物理极限。HNMC/MHNMC 正是让级联路线在四级下仍可被稳定补偿的使能技术。
- **嵌套层级数 = 带宽货币**：本文给出一条清晰的量化规律——每多一层嵌套，带宽约折半。HNMC 的本质贡献是把四级运放的嵌套层级从 3 压到 2，"结构层级数"成为可以显式优化的设计变量，而非性能的被动结果。
- **可编程性是"一次流片、多个规格"的杠杆**：300 μA/16 μA 两挡对应 6 MHz/400 kHz 与 1.5 V/1.1 V，验证了 HNMC 尺寸方程在偏置大幅缩放下的鲁棒性。对库单元型 IP，这比单一最优点更有价值。

> **可关联工具**：多级补偿的极点分裂与 Butterworth 响应可用 [Bode 图绘制](../../tools/bode-plot/index.html) 与[传递函数工具](../../tools/transfer-function/index.html)对照验证。
