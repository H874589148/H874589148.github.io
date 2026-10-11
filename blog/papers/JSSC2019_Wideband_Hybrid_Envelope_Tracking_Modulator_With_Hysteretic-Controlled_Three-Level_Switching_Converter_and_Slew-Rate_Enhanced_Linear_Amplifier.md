---
title: 迟滞控制三电平开关变换器 + 压摆增强线性放大器：宽带混合 ET 调制器（JSSC 扩展版）
date: 2026-10-11
tags: [power]
authors: Parisa Mahmoudidaryan, Debashis Mandal, Bertan Bakkaloglu, Sayfe Kiaei
source: IEEE JSSC, vol. 54, no. 12, Dec. 2019, pp. 3336–3347（ASU；会议版为 ISSCC 2019 27.5；一作现就职 Qualcomm）
abstract: ISSCC 2019 27.5 的期刊扩展版：迟滞控制三电平开关变换器（3L-SWC）+ 压摆增强 LA。JSSC 版新增三电平 vs 二电平的开关/导通损耗建模与飞电容 C_F 尺寸优化（12 nF、损耗 0.85×二电平）、压摆率直方图论证 SRE 按需启用、MCS 电路细节（GBW 随输入共模仅 8% 变化 vs 无 MCS 可达 50%）。迟滞环 >80 MHz 开关频率、每周期主环内并发调节 V_CF 免除校准环；SRE 电流差分辅助路径直注末级栅极主极点电容（SR 178→325 V/μs、−169→−307 V/μs、BW 275 MHz）。65 nm CMOS：LTE-40 MHz 93% 峰值效率 @1 W（SRE 关）、LTE-80 MHz 91%（SRE 开），仅 1 片外电感、无 AC 耦合电容。
readtime: 8
---

> **原文**：*Wideband Hybrid Envelope Tracking Modulator With Hysteretic-Controlled Three-Level Switching Converter and Slew-Rate Enhanced Linear Amplifier*, P. Mahmoudidaryan, D. Mandal, B. Bakkaloglu, S. Kiaei（ASU）, IEEE JSSC, 2019.
> **TL;DR**：这是站内 [ISSCC 2019 27.5 会议版](ISSCC2019_27.5_A_91-Efficiency_Envelope-Tracking_Modulator_Using_Hysteresis-Controlled_Three-Level_Switching_Regulator_and_Slew-Rate-Enhanced_Linear_Amplifier_for_LTE-80MHz_Applications.md)的 JSSC 扩展。会议版 3 页只能给结论，期刊版补齐了三块干货：①三电平 vs 二电平的解析损耗模型与飞电容选型（为什么是 12 nF）；②MCS/SRE 电路逐支路实现（GBW 恒定、SR 提升倍数公式）；③效率 backoff 曲线与商用 PA 联测。迟滞控制替代 PWM 是全文枢纽——一个控制环同时解决三电平的同步、稳定与 V_CF 校准三个问题。

## 背景与动机

- 混合 ET 调制器：SWC 供低频大电流（高效）、LA 补高频纹波（低效）。既有提效路线各有短板：AC 耦合 LA 解耦供电但高频交流电流仍主要来自 LA 且需大片外电容；给 LA 专用 buck/buck-boost 需额外电感；多电平 buck 替代 LA 带宽受限；跟踪 LA 平均电流的带宽限 10 MHz。
- 三电平变换器（3L-SWC）本可实现快响应小电感，但 **PWM 控制有四大挑战**：①环路带宽只是开关频率一小部分 → 高开关损耗；②环路稳定需补偿电路降带宽；③两对功率开关需精确 180° 相移同步信号；④V_CF 需调节到特定值（防环路不稳与薄栅氧管过应力），但 PVT、失配、占空比误差、寄生都会使其偏移 → 需要额外校准环（复杂度再加一）。
- LA 侧：高 UGBW 不够，还要高压摆率驱动 PA 大负载；按最大 SR 偏置则静态电流浪费、效率降。

## 关键方法

### 1. 三电平 vs 二电平损耗建模与 C_F 优化（Section II）

- 每管电压减半 → 可用 1.2 V 薄栅氧管（寄生约为 280 nm 厚栅管的 1/2、R_ON 相同）；V_SW 减半 → 输出电流纹波至少减 50%。
- 开关损耗比（含飞电容底板寄生 $\rho C_F$ 的贡献）：
$$\frac{P_{SW,3L}}{P_{SW,2L}} = \frac{2C_{P,3L} + \rho C_F}{4C_{P,2L}}$$
  可见 **C_F 是优化变量**：3L 的开关损耗优势随 C_F 增大而缩水。nMOS deep-n-well 电容密度高、底板寄生 $C_{pF}=0.8\% C_F$；$C_F<15.2$ nF 时 3L 开关损耗小于 2L。
- C_F 下限由每周期 V_CF 允许波动 ΔV_CF 决定（±125 mV，由薄栅管耐压设定）：
$$C_{F,\min} = \frac{V_{DD}}{R_L \cdot 2f_{SW} \cdot \Delta V_{CF}}$$
  代入 V_DD=2.4 V、f_SW=100 MHz、R_L=4.7 Ω → 10.6 nF → 选 **12 nF**（开关损耗 0.85×二电平）。
- 导通损耗：等导通损耗要求 3L 每管 R_ON 为 2L 的一半——薄栅氧管在 65 nm 恰好满足。

### 2. 迟滞控制 + 并发 V_CF 调节（Fig. 5/10/11）

- 控制环输入三个量：V_CF、包络 V_ENV、传感电压 V_SENS（R_SENS 把输出电流缩为 Class-AB 输出级 1/N，传感损耗移出主电流路径）。V_ENV < V_DD/2 时 V_SW 在 0↔V_DD/2 间切换，>V_DD/2 时在 V_DD/2↔V_DD 间切换（Ctrl-a/Ctrl-b 两条路径，简单逻辑+比较器实现，小延迟扛高频）。
- **CMVS**（电流模电压传感）：V_CF 经二极管连接管+电阻转为 I_CF（20 μA，兼顾高速与防 V_CF 放电），与从 V_DD/2 生成的两路参考电流 I_REF/2±ΔI 比较，RS 锁存器产生 V_C——按 V_CF 低于/高于 V_DD/2 选择 C_F 充电或放电路径。
- **迟滞控制的四个红利**：①宽负载范围固有稳定、免补偿电路 → 简化环路、更高带宽；②环路带宽可达开关频率（>80 MHz）而不增开关损耗；③免同步信号发生器；④**V_CF 每个开关周期都在主控制环内被传感与调节** → 校准环整个消失（对比站内 [HKUST 三电平的实时校准环](JSSC2019_A_Multi-Loop-Controlled_AC-Coupling_Supply_Modulator_With_a_Mode-Switching_CMOS_PA_in_an_EER_System_With_Envelope_Shaping.md)：同样调节 V_CF，但那是独立辅助环）。

### 3. LA：MCS 保 GBW 恒定（Fig. 12）

- rail-to-rail 输入的固有问题：输入 CM 扫过中点时 nMOS/pMOS 对交接，gm 与 Class-AB 偏置电流波动（无 MCS 时 GBW 变化可达 50%）。
- **MCS（最大电流选择）**：nMOS/pMOS 两路各镜像出 I_NMCS/I_PMCS，比较后取大者定末级电流——高 CM 时只有 nMOS 对导通，I_NMCS=I_B/(2K₁) 直接定末级；中点附近 I_MP6 与 I_PMCS 竞争、取大者与 I_B/2 之和定 pull-up 电流。GBW 恒定：
$$GBW_{main} = \frac{K_2}{K_1}\cdot\frac{g_m}{C_M}$$
  （C_M 为末级栅节点 VX/VY 等效电容，K₂/K₁=3 为末级/输入级电流镜像比）。实测 GBW 随 CM 仅 8% 变化（203→221 MHz）。

### 4. SRE：电流差分辅助路径 + Class-AB 偏置调节（Fig. 13–15）

- SR 直方图（QPSK LTE-80/40 MHz，2.4 Vpp、PAPR 7.84/8.06 dB）：峰值 SR 达 ±300 V/μs，但 **±100 V/μs 以下密度极高** → 按峰值 SR 偏置整个 LA 不划算 → SRE 按需启用。
- 结构：并行 SRE 路径以 γ=1/16 镜像输入级四支路电流，两两相减后按 α（可调 1×3/16 至 15×3/16）放大成辅助电流 I_SR_D/I_SR_C，**直接注入末级栅极主极点电容 VX/VY**——不经中间级，中间级相位延迟不进入 SRE 相位裕度；小信号时两支路电流相等、差值为零，不影响 LA 工作点与 DC 增益。
- 压摆率（式 8/10 自洽）：
$$SR_{OFF} = \frac{K_2}{K_1}\cdot\frac{I_B}{C_M}, \qquad \frac{SR_{ON}}{SR_{OFF}} = 1 + \alpha\frac{K_1}{K_2}$$
  仿真（α=4×3/16）：+178→**325 V/μs**、−169→**−307 V/μs**；GBW 借 SRE 内小信号路径提升至 **275 MHz**。
- 细节：D1–D4 二极管连接管工作在亚阈值，小信号下仍贡献增益（SRE 使能时 GBW 提升的来源）；SRE 强拉一根输出轨时会强迫另一管截止形成死区 → **浮动电压源 V_PAB/V_NAB 随 βI_SR_D 动态调整**，维持最小静态电流 I_Q 消除交越失真。

## 实验结果与性能指标

65 nm CMOS；core 1.7×1.6 mm²（含 12 nF 片上飞电容）；SWC 用 1.2 V 薄栅氧管、V_DD=2.4 V；片外电感 538 nH；4.7 Ω 恒定电阻负载。

| 指标 | 数值 |
|---|---|
| 开关频率 / 环路带宽 | **>80 MHz**（迟滞控制） |
| V_SW 三电平 | 0 / 1.2 / 2.4 V（仅包络 >1.2 V 时切到 2.4 V） |
| V_CF 调节精度 | 1.2 V ± 40 mV（每周期并发调节，免校准环） |
| LA SR（仿真） | 178→325 / −169→−307 V/μs（SRE ON） |
| LA GBW | 275 MHz（SRE+bias adj.）；随输入 CM 仅 8% 变化 |
| 跟踪延迟 | ~6 ns |
| 跟踪误差 | LTE-40 MHz（SRE 关）<2.3%；LTE-80 MHz（SRE 开）<3.2% |
| 峰值效率 | **93% @1 W（LTE-40，SRE 关）；91%（LTE-80，SRE 开）** |
| Backoff 效率 | 500 mW（−3 dB）>76%；300 mW（−5.2 dB）>68% |
| PA 联测 | 商用 PA、24 dBm、ACLR −32.5 dBc（65 nm CMOS 供电低所致） |
| 片外元件 | 1 电感、**无 AC 耦合电容** |

## 个人思考与总结

- **会议版→期刊版的扩写范式**：JSSC 版相对 [ISSCC 27.5](ISSCC2019_27.5_A_91-Efficiency_Envelope-Tracking_Modulator_Using_Hysteresis-Controlled_Three-Level_Switching_Regulator_and_Slew-Rate-Enhanced_Linear_Amplifier_for_LTE-80MHz_Applications.md) 没有新架构，而是把三件事写透——损耗解析模型（让 12 nF 有出处）、每个电路块的支路级实现、backoff 效率曲线。读会议版记结论、读期刊版学方法，两者配合价值最大。
- **迟滞控制是"用鲁棒性换校准"**：PWM 三电平要同步信号+补偿网络+V_CF 校准环三个附属系统；迟滞控制把它们全塞进一个环——代价是开关频率随负载/纹波漂移（本文未深究 EMI 谱）。与站内 [HKUST 多环方案](JSSC2019_A_Multi-Loop-Controlled_AC-Coupling_Supply_Modulator_With_a_Mode-Switching_CMOS_PA_in_an_EER_System_With_Envelope_Shaping.md)（保留校准环但频率确定）是同一问题的两种取舍。
- **SRE 直注末级栅极 = 旁路小信号路径的相位延迟**：传统自适应偏置让增大的电流先过输入级再传到末级，路径上每级极点都吃相位裕度；本文把辅助电流在末级栅电容处"空投"，主路径工作点纹丝不动——这与站内 [trellis-search ETSM](Envelope_Tracking_Supply_Modulator_with_Trellis-Search-Based_Switching_and_160-MHz_Capability.md) 的思路异曲同工：**把控制量作用在最需要它的节点上，而不是沿信号链逐级传递**。

> **可关联工具**：三电平损耗模型与 C_F 选型可用站内 [功率电子工具箱](../../tools/power-electronics/index.html) 复算；SR 直方图与效率 backoff 曲线可用 [波形绘制](../../tools/wavedrom/index.html) 与 [Chart](../../tools/gaussian/index.html) 类工具复现。
