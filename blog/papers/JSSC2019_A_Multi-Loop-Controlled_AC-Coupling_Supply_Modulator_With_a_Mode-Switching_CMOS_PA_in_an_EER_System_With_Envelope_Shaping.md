---
title: 多环控制 AC 耦合电源调制器 + 模式切换 CMOS PA：带包络整形的 EER 系统
date: 2026-10-11
tags: [power]
authors: Xun Liu, Heng Zhang, Philip K. T. Mok, Howard C. Luong
source: IEEE JSSC, vol. 54, no. 6, Jun. 2019, pp. 1553–1563（HKUST；Xun Liu 现就职 Qualcomm）
abstract: EER 系统的相位路径难做、PA 泄漏失真、SM 要求苛刻——EER-ES 用"原 RF 信号直接驱动 PA + 包络整形"一次解决三个问题：低功率模式 PA 线性区恒压供电、高功率模式开关区跟踪整形包络（PA 自身充当 limiter）。SM 侧：AC 耦合拓扑借整形包络抬高最低电压、降 LA 供电与功耗，三电平开关放大器（1.2V 器件堆叠 2.4V、25MHz、纹波 <1/4）+ 多环控制（低频感 V_LS、高频感 ia，UGF 650kHz→3.3MHz）+ HPF（带宽 33.9→69.2MHz、零额外电流）。LTE-20MHz 16QAM：SM 效率 88.7%，系统 PAE 35.7%、ACLR −32.1dBc，UMC 65nm，仅 1 片外电感 1 片外电容。
readtime: 8
---

> **原文**：*A Multi-Loop-Controlled AC-Coupling Supply Modulator With a Mode-Switching CMOS PA in an EER System With Envelope Shaping*, X. Liu, H. Zhang, P. K. T. Mok, H. C. Luong（HKUST）, IEEE JSSC, 2019.
> **TL;DR**：这是"系统级解耦"的教科书案例：EER 的三大痛点（相位路径生成、PA 泄漏失真、SM 带宽/噪声极限）被三个动作分别化解——①PA 直接吃原 RF 信号，开关/线性过渡区自己当 limiter；②包络整形把低电压段削平，SM 输出范围从 0.5–2.5 V 缩到 1.2–2.5 V；③SM 用 AC 耦合（借整形后的高最低电压降 LA 供电）+ 三电平 + 多环控制 + HPF。最终 2.4 V 供电、65 nm、1 个片外电感（206 nH）做到 88.7% / PAE 35.7%。

## 背景与动机

- LTE 高 PAPR 拖累线性 PA 效率；ET 对 SM 要求最苛刻（包络带宽 DC–100 MHz、摆幅 0.5–4.5 V、小纹波）；EER 用开关 PA（Class-C/D/E/F）效率最高、利于 CMOS 集成，但有三痛点：宽带 limiter、PA 低功率泄漏失真相位路径、包络恢复精度依赖 SM。
- **EER-ES（Fig. 3）**：相位路径直接用原 RF 信号驱动 PA——低输入功率 PA 工作在线性区（SM 恒压供电、输出忠实跟随输入），高输入功率进入压缩区（开关模式操作自身充当 limiter，SM 跟踪整形包络）——mode-switching PA 一次消掉 limiter 与相位生成模块；包络路径按 PA 开关/线性过渡区削低电压整形，SM 输出范围收窄（0.5–2.5 V → 1.2–2.5 V）。
- 系统供电 2.4 V（电池 2.7–4.2 V 只需高效 buck，>2.7 V 则要低效 buck-boost）；SM 带宽 >60 MHz、PAPR 7–9 dB、输出 >23 dBm。

## 关键方法

### 1. SM 拓扑对比：为什么要多环控制（Fig. 4–5）

- **AC 耦合拓扑**（$C_{LS}$ 串在 LA 输出与负载间，$V_{PA}=V_{O\_LIN}+V_{LS}$）：LA 供电 $V_{DDL}$ 可降（$V_{O\_LIN}$ 最低 ~0.1 V 保增益）、$C_{LS}$ 消除 LA 直流电流、$V_{PA}$ 可瞬时超 $V_{DD}$——与 ES 天作之合（ES 抬高 $V_{PA,min}$ → $V_{LS}$ 可增大 → $V_{DDL}$ 进一步降）；但其 $i_b/i_a(s)$（式 7）有原点极点 + 两个 RHP 零点（$C_{LS}$ ESR 不可预测），补偿困难，UGF 受限 → 开关放大器慢、效率低；
- **混合拓扑**（LA 电流 $i_a$ 传感控制开关放大器）：$i_b/i_a(s)$（式 8）两实极点 + LHP 零点对消，type-II 补偿后 UGF 可达开关频率 1/5（最激进实用值）；
- **多环控制取两家之长**：$i_b/i_a$ 的增益与 UGF 决定高效开关级/低效线性级的功率分配——直接决定效率。

### 2. 三电平开关放大器 + 飞电容校准

两个 1.2 V 器件堆叠支持 2.4 V 供电（标准器件、短沟道、开关损耗小）；$f_{sw}$=25 MHz。$V_X$ 按输出电平在 0↔$V_{DD}/2$ 或 $V_{DD}/2$↔$V_{DD}$ 间切换：电感电流纹波斜率减半、频率加倍 → **纹波 <同 LC 二电平的 1/4**、输出纹波约一半、开关噪声推到 2$f_{sw}$（PA 带内噪声衰减）；$V_O=V_{DD}/2$ 处电流纹波仅 1/10、LA 功耗省 22 mW；小电感（206 nH）进一步加快跟踪。校准环传感 $C_F$ 两端 $V_A/V_B$ 与 $V_{DD}$、$V_{DD}/2$ 比较，经斜坡比较生成 D/DS 调节至 $V_{CF}=V_{DD}/2$（方法同站内三电平分析 [23]）。

### 3. 带 HPF 的 Class-AB 线性放大器（Fig. 8–11）

- 两级：高增益折叠共源共栅 + Class-AB 输出级（静态 10 mA，$P_1/N_1$ 为 3.5 mm/60 nm 与 1.4 mm/60 nm 应对 500 mA）；$C_{MP}/C_{MN}$ Miller 补偿，$R_1/R_2/C_C$ 反馈网络；
- 负载电流依赖的稳定性（$R$=3.9 Ω、$C$=68 pF）：零输出电流 DC 增益 ~40 dB/UGF 100 MHz/PM 90°；≥100 mA 时 >50 dB/200 MHz/70°；
- **HPF 扩带宽**：$R_3/R_4/C_F$ 网络（式 9），$R_3=R_4$ 且 $C_F>C_P$ 时形成高通——与 LA 自身的低通级联，$V_{PA}/V_{ELP}$ 的 −3 dB 带宽从 40 扩到 149 MHz（实测 33.9→**69.2 MHz**），**零额外静态电流**；SR 需求 754 V/μs（120 MHz、0.5–2.5 V）驱动了输出管尺寸与偏置设计。

### 4. 多环控制（Fig. 12–15）

- $C_{LS}$ 两端电压经 DDA 与参考比较（低频 V_LS 环）；电流镜（1/1750 缩放，$r_{OS}$=60 kΩ）传感 $i_a$ 经 $C_{ML}$=2 pF 耦合进 DDA 输出（高频 ia 环）——$C_{ML}$ 天然是 HPF：$V_{EA}$ 低频≈$V_{LS}$ 信号、高频≈$i_a$ 信号，UGF 附近由 ia 环主导 → 只需补偿 ia 环；
- ia 环：功率级两极点 3/680 MHz、DC 35 dB；type-II 补偿（$C_Z$=40 pF、$R_Z$=2.5 kΩ、$C_I$=8 pF）→ UGF 3.3 MHz、PM 56°；
- 效果：$i_b/i_a$ UGF 从 650 kHz 扩到 **3.3 MHz**（继承高增益）；且 $V_{LS}$ 被主动调节到接近整形电平（而非自由运行的随机值）。

### 5. mode-switching PA（Fig. 16–18）

- 差分共源共栅、单功率级；bonding wire 作 DC 馈电电感（Q 高于片上）；开关操作瞬时漏极电压达 7.2 V → 1.2 V 薄氧 + 2.5 V 厚氧堆叠防击穿；
- cascode 共栅电压 $V_{BCG}$ 按瞬时供电动态偏置到最优 → 效率最高 +4%；CCAT 电容充电加速 [6]；输出串联功率合成（单单元最优馈电电感太小不实际 + 摊薄单元电流便于布局）；
- **二次谐波治理**：PA 谐波电流全部涌到供电端，而快变供电不能加大去耦电容、SM 又不覆盖 GHz——把变压器中心抽头**接地**（常规悬浮）提供低阻回路，偏转约 50% 二次谐波电流 → E-ACLR 改善 ~2 dB。

## 实验结果与性能指标

UMC 65 nm；SM 1875×1875 μm、PA 1875×1000 μm；7 nF $C_F$ 片上（MIM+MOM+MOS 堆叠）；片外 206 nH + 1 μF。

| 指标 | 数值 |
|---|---|
| SM 输出范围 | 0.5–2.5 V（2.4 V 输入，标准 1.2 V 器件） |
| SM 效率（LTE-20MHz 16QAM 包络，3.9 Ω） | **88.7%**（多环 vs 仅 V_LS 控制：未整形 +4%、整形 +3%） |
| SM 带宽 | 33.9 → **69.2 MHz**（HPF） |
| V_PA 纹波 | <20 mV；$V_X$ 开关 50 MHz（2.4/1.2/0 V 三电平） |
| EER-ES 系统（23.9 dBm） | PAE **35.7%**（ES +2%）、ACLR −32.1 dBc（中心抽头接地 +2 dBc） |
| 片外元件 | 1 电感 + 1 电容（对比 [21] 的 4 个） |

## 个人思考与总结

- **"整形包络"是系统与电路的接口契约**：ES 不是免费的（PA 增益随供电变化要靠 ES 表查表补偿、ACLR 有代价），但它把 SM 的输出范围下限抬高 0.7 V——对 AC 耦合拓扑而言，这个 0.7 V 直接转化为 LA 供电与功耗的节省。跨模块优化的本质是找到"一方的边际成本低于另一方的边际收益"的交换点。
- **多环控制 = 按频段切换控制源**：低频用 $V_{LS}$ 环（稳精度）、高频用 $i_a$ 环（快响应），$C_{ML}$ 的 HPF 特性让两环在频域自动交接、UGF 附近只补一个环——这与站内 [KAIST 2007 前馈+反馈](JSSC2007_A 2W CMOS Hybrid Switching Amplitude Modulator for EDGE Polar Transmitters.md)、[SIDO-PED](ISSCC2017_2.3_A_single-inductor_dual-output_converter_with_linear-amplifier-driven_cross_regulation_for_prioritized_energy-distribution_control_of_envelope-tracking_supply_modulator.md) 一脉相承：**混合架构的控制设计就是给"快路径"与"准路径"分配频段**。
- **中心抽头接地是"寄生回路资源化"又一例**：二次谐波无处可去是开关 PA 供电调制的老大难，本文让变压器中心抽头（原本悬浮）接地，把谐波偏转到地——思路与站内 [SIDO 利用交叉调节](ISSCC2017_2.3_A_single-inductor_dual-output_converter_with_linear-amplifier-driven_cross_regulation_for_prioritized_energy-distribution_control_of_envelope-tracking_supply_modulator.md)同源：找到寄生回路，给它一个"正好需要它"的用途。

> **可关联工具**：站内 [功率电子工具箱](../../tools/power-electronics/index.html)；多环 Bode 与 HPF 极零点可用 [传递函数工具](../../tools/transfer-function/index.html) 与 [波形绘制](../../tools/wavedrom/index.html) 分析。
