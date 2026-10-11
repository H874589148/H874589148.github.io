---
title: 混合 PA 电源调制器的环路分析与稳定性：电流环放大"等效跨导"
date: 2026-10-11
tags: [power]
authors: Xun Liu, Junmin Jiang, Cheng Huang, Philip K. T. Mok
source: IEEE TCAS-II, vol. 69, no. 10, Oct. 2022, pp. 4143–4147（CUHK-Shenzhen + 南方科大 + HKUST + Iowa State；65 nm CMOS）
abstract: 混合 SM 的电压环（LA）与电流环（ia→id）相依，但文献少有完整建模。本文推导：负载总电流 ≈ (1+id/ia(s))·gm_AB·v_AB，即电流环把 Class-AB 输出级"等效跨导"放大 A_cur 倍 → SM 电压环 DC 增益 ×A_cur、主极点 ÷A_cur，而 UGF 与 PM 完全不变（新极点 p3 与 LHP 零点 z2 自动对消）。id/ia(s) 的增益与 UGF 决定 SWC/LA 电流分配（即效率）：UGF 1 MHz vs 100 kHz 的两个 SM 在中频段效率差 1–4%；相位裕度不足不影响稳定但电感电流振铃（15° vs 90° PM 对比）。65 nm 流片验证：buck 25 MHz + 206 nH，20 MHz LTE 包络 85% 峰值效率。
readtime: 7
---

> **原文**：*Loop Analysis and Stability Considerations of Hybrid PA Supply Modulators*, X. Liu, J. Jiang, C. Huang, P. K. T. Mok, IEEE TCAS-II, 2022.
> **TL;DR**：这是站内 [HKUST JSSC 2019 多环控制 SM](JSSC2019_A_Multi-Loop-Controlled_AC-Coupling_Supply_Modulator_With_a_Mode-Switching_CMOS_PA_in_an_EER_System_With_Envelope_Shaping.md) 一作回到理论层的姊妹篇：把"混合拓扑里 LA 传感自己的电流去指挥 SWC"这个人人都在用的结构，第一次用完整传递函数讲清楚——**电流环的作用等价于把 LA 输出级的跨导放大 A_cur 倍**，于是电压环增益变高、主极点内推、UGF/PM 纹丝不动。另一条实用结论：电流环相位裕度差不会让输出失稳，但会让电感电流振铃、白白损耗功率——稳定性和效率在这里是解耦的两件事。

## 背景与动机

- ET 对 SM 的带宽要求：LTE 100 MHz → 5G NR 1 GHz。混合拓扑（Wang 2007）里 LA 立即响应参考做电压调节，其输出电流 $i_a$ 被传感、补偿、生成 buck 占空比，决定开关电流 $i_d$——电流环（迟滞变频或定频 PWM）与电压环同时工作、互相依赖，但既有文献只分别补偿两环，缺完整建模与交互分析。

## 关键方法

### 1. $i_d/i_a(s)$ 决定电流分配，即效率（Section II-A）

- 仿真 1 MHz 正弦：$i_d$ 有 300 mA DC + 97 mA AC，$i_a$ 的 DC 分量被压到 ~2 mA；$i_d/i_a$ DC 增益 44 dB（150×）、1 MHz 处 9.5 dB（3×），两者相位差约 45°。
- 同一频率下三种 $i_d/i_a$ 情形：(a) 增益>1、90° 相差 → $i_d$ 供绝大部分电流，效率最高；(b) 增益=1、90° → 变差；(c) 增益=1、120° → $i_d$ 与 $i_a$ 幅值都增大，最差；等幅 180° 反相则完全对消、LA 独扛。**UGF 处必须留足相位裕度**。
- 效率 ∝ $i_d/i_a(s)$ 的增益与 UGF：两个仅电流环 UGF 不同（1 MHz vs 100 kHz）的 SM 跟踪 10 kHz–10 MHz 正弦，200 kHz–2 MHz 中频段前者效率高 1–4%。

### 2. 电流环补偿：把功率级化简成单极点（Section II-B）

- 线性化模型：电流传感 $A_S$、type-II 补偿 $Z_I$、开关级 $A_M$（同 buck）、负载 $Z_{LD}=R/(1+sRC)$（R≈3–10 Ω、C≈100 pF、L>100 nH）。推导得：
$$\frac{i_d}{i_a}(s) = A_S Z_I A_M\cdot\frac{1+sRC}{1+sL/R+s^2LC}$$
  代入典型无源值，$\frac{sL}{R}+s^2LC \approx (1+\frac{sL}{R})(1+sRC)$——功率级给出两个**独立**实极点 $\frac{1}{LRC}$（6.4 MHz）与 $\frac{1}{RC}$（398 MHz），且 $(1+sRC)$ 零点被对消 → 化简为单极点系统。
- type-II 补偿（$Z_I=\frac{r_{OS}(1+sR_ZC_Z)}{1+s\,r_{OS}C_Z}$）：$r_{OS}C_Z$ 造主极点、$R_ZC_Z$ 零点对消低频极点 $sL/R$、$C_I\approx C_Z/10$ 压高频噪声。补偿后 UGF 1.4 MHz、PM 90°，10 MHz 以下 behaves 如单极点系统。

### 3. 电压环完整建模：电流环 = 跨导放大器（Section III）

- 良补偿电流环可视为单极点：$\frac{i_d}{i_a}(s)=\frac{A_{cur}}{1+s/p_c}$（$A_{cur}$ 为电流环 DC 增益）。于是流入负载的总电流：
$$i_o \approx (1+\tfrac{i_d}{i_a}(s))\cdot g_{m,AB}\,v_{AB}$$
  即 **Class-AB 输出级的等效跨导变为 $(1+\frac{i_d}{i_a})\cdot g_{m,AB}$**——低频≈$A_{cur}g_{m,AB}$、高频回到 $g_{m,AB}$。
- 代入两级 LA（Miller 补偿）环路 $T_{LIN}=-A_{LIN}\frac{1-s/z_1}{(1+s/p_1)(1+s/p_2)}$（$p_1=\frac{1}{R_{CAS}g_{m,AB}R_{C_M}}$ 主极点、$p_2=\frac{g_{m,AB}}{C_C}$、RHP 零点 $z_1=\frac{g_{m,AB}}{C_M}$），SM 整体环路变为：
$$T \approx -A_{cur}A_{LIN}\,\frac{(1-s/z_1)(1-s/z_2)}{(1+s\frac{A_{cur}}{p_1})(1+s/p_2)(1+s/(A_{cur}p_c))}$$
  要点：①DC 增益 ×$A_{cur}$；②主极点 ÷$A_{cur}$（等效跨导放大的直接后果）；③新增极点 $p_3=A_{cur}p_c$ 与 LHP 零点 $z_2=A_{cur}p_c$ **天然对消**；④UGF 与 PM 与 LA 单独工作时**完全相同**。

### 4. 反例验证：PM 15° vs 90°（Fig. 6–9）

- 把电流环 PM 降到 15°：SM 整体 UGF/PM 仍不变，但 ~1 MHz 处幅度凹陷 + 相位突变（极零对消不完美）；阶跃响应两者都稳，**但 15° 情形电感电流起始振铃**；正弦跟踪时电感电流峰峰幅度显著更大 → 效率更低。低 PM 使式(7)单极点假设失效、极零对消不成立。

## 实验结果与性能指标

65 nm CMOS；buck 开关 25 MHz + 标准 LA（高增益 OTA + Class-AB 输出级）；片外 206 nH；负载 3.8 Ω ∥ 68 pF；电流环 PM 补偿到 ~70°。

| 指标 | 数值 |
|---|---|
| 理论验证 | 1 MHz 正弦：V_PA 跟踪好、电感电流规律开关（与仿真一致） |
| 20 MHz 正弦 | V_PA 延迟/失真（LA 带宽限）；$i_d/i_a$<<1 → 电感只供 DC |
| **20 MHz LTE 包络** | V_PA 跟踪好，**峰值效率 85%** |

## 个人思考与总结

- **"等效跨导放大"是混合拓扑的第一性原理**：本文把 LA 消耗电流的"痛点"翻转成环路增益的"红利"——SWC 接管低频电流后，LA 的等效 gm 变大 $A_{cur}$ 倍，主极点随之内推、DC 增益外推，UGF 却不动。这解释了为什么混合 SM 的 LA 可以做得小而补偿保守。站内 [JSSC 2019 多环控制](JSSC2019_A_Multi-Loop-Controlled_AC-Coupling_Supply_Modulator_With_a_Mode-Switching_CMOS_PA_in_an_EER_System_With_Envelope_Shaping.md)的"$i_b/i_a$ UGF 决定功率分配"正是本文式(1)思想的实现版；[KAIST EDGE 调制器](JSSC2007_A 2W CMOS Hybrid Switching Amplitude Modulator for EDGE Polar Transmitters.md)的前馈+三阶纹波滤波器则是电流分配的早期工程化。
- **稳定性与效率解耦是巨大的设计自由度**：电流环 PM 差 75°（90°→15°）不改变输出稳定裕度，只产生电感电流振铃与损耗——意味着电流环可以激进设计 UGF 抢效率，只要 PM 别烂到让式(12)对消失效。对比站内 [迟滞控制 3L-SWC](JSSC2019_Wideband_Hybrid_Envelope_Tracking_Modulator_With_Hysteretic-Controlled_Three-Level_Switching_Converter_and_Slew-Rate_Enhanced_Linear_Amplifier.md)（固有稳定）与 [SIDO-PED](ISSCC2017_2.3_A_single-inductor_dual-output_converter_with_linear-amplifier-driven_cross_regulation_for_prioritized_energy-distribution_control_of_envelope-tracking_supply_modulator.md)（CR 直接进环路），本文给出了"哪些环决定稳定、哪些环只决定效率"的判据。
- **Brief 文体的范本**：5 页篇幅完成"建模→近似→反例→流片"闭环，两处近似（功率级两实极点、电流环单极点）都给了适用条件（无源值范围、PM 足够）——分析性论文的可信度来自近似的边界声明，而非近似本身。

> **可关联工具**：式(12) 的极零配置可用站内 [传递函数工具](../../tools/transfer-function/index.html) 画 Bode 对比；$i_d/i_a$ UGF 扫描效率可用 [功率电子工具箱](../../tools/power-electronics/index.html) 建立简化模型。
