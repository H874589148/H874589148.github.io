---
title: 轨到轨 CMOS 缓冲器的新电路方案：互补输入对的三重电流控制
date: 2026-10-11
tags: [analog]
authors: R. Caiulo, P. Malcovati, C. Bona, F. Maloberti
source: IEEE ISCAS 1995, pp. 1980–1983（Italtel SIT + ETH Zurich + University of Pavia；CEC Esprit 8795 AMFIS 项目）
abstract: 低压低功耗趋势下 rail-to-rail 运放/缓冲器要同时解决三件事：互补输入对的 CM 范围受镜像负载失配限制、跨导随输入 CM 变化导致谐波失真、Class-AB 输出级静态电流需恒定。方案：①折叠差分对替代镜像负载扩 CM 范围，输入管一分为二输出双路驱动信号 V_A/V_B 直驱 push-pull 输出级；②电流源拆成"固定+CM 控制+gm 控制"三分量，按输入 CM 实时调配；③交叉偏置（一级电流增、另一级按 K 因子减）近似平方根律，gm 偏差压到 10.5%。5 V 全摆幅、105 dB DC 增益、13 MHz GBW、驱动 50 pF 电容负载。
readtime: 6
---

> **原文**：*Novel Circuit Solutions for Rail-to-Rail CMOS Buffer*, R. Caiulo, P. Malcovati, C. Bona, F. Maloberti, IEEE ISCAS, 1995.
> **TL;DR**：1995 年的 rail-to-rail 输入/输出"三板斧"，是今天教科书内容的早期完整工程实现：互补差分对 + 折叠负载 + 拆分输入管直驱 Class-AB 输出级；四个偏置电流源各由三个并联分量（固定 A + 共模控制 B + 跨导控制 C）合成，一处控制电路管三件事。最有趣的是**用线性交叉控制近似平方根律**来恒定 gm——精确平方根律电路昂贵，选好 K₁/K₂ 用仿真定标即可把偏差压到 10.5%。三十年后站内 [JSSC 2019 ET 调制器的 MCS 电路](JSSC2019_Wideband_Hybrid_Envelope_Tracking_Modulator_With_Hysteretic-Controlled_Three-Level_Switching_Converter_and_Slew-Rate_Enhanced_Linear_Amplifier.md)做的仍是同一件事，只是换成了"选最大值"这种更鲁棒的组合方式。

## 背景与动机

- 工艺微缩降低器件击穿电压、便携系统兴起 → 低压低功耗模拟前端需要输入输出都摆到轨的运放/缓冲器，且要能驱动大电容负载。
- 三大经典难题：①互补差分对保证任一 CM 下至少一对工作，但电流镜作有源负载时输入 CM 上限受 nMOS/pMOS 阈值失配限制；②CM 接近轨时电流源被推入三极管区，总跨导随 CM 剧变 → 谐波失真；③push-pull 输出级需同时生成两管驱动信号并钳住静态电流。

## 关键方法

### 1. 输入级：折叠负载 + 拆分输入管（Fig. 2–4）

- 用**折叠（folded）结构替代电流镜有源负载**（Fig 2b）绕开镜像差分对的 CM 上限；两级差分对的折叠信号电流在高阻节点汇合完成电压放大。
- 关键技巧：把一个输入管**一分为二**，得到同一放大信号的两个版本 V_A 与 V_B——恰好作为 Class-AB 输出级 n/p 两管的驱动信号，省掉额外的电平适配（代价：DC 增益略降）。
- CM 接近正轨时电流源 I_B9 会被关断、电流平衡破坏使输出离开线性区 → 需要下述动态控制。

### 2. 电流源控制：三分量合成（Fig. 5）

- 电流源拆成固定分量 I_8B 与 CM 电压控制分量 I_8A；M10A/M6A/M7A 构成输入差分对的 replica，实时感知 CM。
- CM 趋近正轨、主管关断时，控制分量同步调整使电流平衡式仍然成立——**输入动态范围扩到轨**。四个偏置源（I_5/I_6/I_8/I_9）各由三分量并联：A（电流源控制块）+ B（V_A/V_B 控制块）+ C（gm 控制块），一套控制网络同时服务三个目标。

### 3. 跨导控制：线性交叉近似平方根律（Fig. 6–7）

- 恒定总 gm 的精确解要求偏置电流按**平方根律**随 CM 变化；本文改为**交叉控制**：一级电流增加时，另一级按因子 K₁(K₂) 放大后相应减少（线性近似），K₁/K₂ 由电路级仿真扫全 CM 范围取最优。
- n 沟道级的实现（Fig 7）中 K 由电流镜 M85–M86 的 W/L 比设定。实测 gm 标称 1.8 mA/V、全 CM（0–5 V）偏差 **10.5%**。

### 4. 输出级：差值钳位的 Class-AB 静态电流（Fig. 8–10)

- 输出级取最简 push-pull 反相器（只求电流驱动能力）；用两个差分级分别测量 V_A−V_B,nom 与 V_B−V_A,nom：两差相等时两差分对产生相同不平衡、低阻源节点 M35/M36 无电流流动；一旦 (V_A−V_B) 偏离标称值，I_9/I_10 出现不平衡并经反馈把 V_A/V_B 拉回——**静态电流与 CM、信号摆幅解耦**。

## 实验结果与性能指标

集成原型流片验证（Table 1，OCR 部分残缺，仅列可确认项）：

| 指标 | 数值 |
|---|---|
| 输入输出动态范围 | 5 V（rail-to-rail） |
| DC 增益 | 105 dB |
| GBW | 13 MHz |
| 电容负载 | ~50 pF（正文提取不清，数量级可信） |
| 标称 gm / 全 CM 偏差 | 1.8 mA/V / **10.5%** |
| THD | 在整个输入动态内基本恒定（数值提取残缺）——证明各控制环有效 |

## 个人思考与总结

- **"三分量电流源"是模拟电路里的可编程偏置雏形**：把一个偏置点表达为常数项、CM 项、gm 项的线性组合，各控制块独立设计、相加生效——比一整个专用非线性电路更可分解、可测试。这种"控制信号正交化"思路在今天的自适应偏置电路里仍随处可见。
- **线性近似替代精确非线性律的定标哲学**：平方根律用 K 因子线性交叉近似，K 由仿真定标——30 年前的做法放今天依然成立，因为偏差 10.5% 对 THD 的影响已经小于其它二阶效应。**先算清楚误差预算，再决定要不要为精确律付电路代价**。
- **从 1995 到 2019 的 rail-to-rail 进化路径**：本文用"交叉偏置 + 平方根近似"保 gm 恒定；[JSSC 2019 ET 调制器](JSSC2019_Wideband_Hybrid_Envelope_Tracking_Modulator_With_Hysteretic-Controlled_Three-Level_Switching_Converter_and_Slew-Rate_Enhanced_Linear_Amplifier.md)用 MCS"选最大电流"一步到位——不需要任何 gm 曲线配平，直接保证末级偏置与 GBW 恒定。问题没变，解法从"补偿误差"进化到"结构上不让误差发生"。

> **可关联工具**：gm 随 CM 的波动可用站内 [波形绘制](../../tools/wavedrom/index.html) 可视化；交叉控制的 K₁/K₂ 定标可用 [最小二乘拟合](../../tools/least-squares/index.html) 思路理解。
