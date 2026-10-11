---
title: 宽带 Class-AB 功率放大器的 29–57 GHz AM-PM 补偿：PMOS 变容管 + 宽带变压器四阶匹配
date: 2026-10-11
tags: [rf]
authors: Marco Vigilante, Patrick Reynaert
source: IEEE JSSC, vol. 53, no. 5, May 2018, pp. 1288–1301（KU Leuven ESAT-MICAS；0.9 V 28 nm bulk CMOS、无 ultra-thick top metal）
abstract: 宽带调制信号下 AM-PM 是第一瓶颈（5° AM-PM 对 64-QAM EVM 的劣化相当于 1 dB 增益压缩；单音 CW 提取的行为模型在 RF BW>100 MHz 时过度乐观）。失真源分解：非线性 C_IN（Miller 反射放大 (1+gm(Ro∥RL))）、非线性 Gm 与非纯阻负载、级联二阶非线性产生的 IM3 与记忆效应。方案：输入 PMOS varactor 对消 C_IN 失真 + 宽带变压器四阶级间匹配（双谐振峰、kQ 乘积理论、级间 k_int≈0.4）。0.9 V 28 nm：S21 29–57 GHz（65%）、|AM-PM|<1°@P_1dB（V_cnt 可调）、P_sat 15.1 dBm、峰值 PAE 24.2%；1.5/3/6 Gb/s 64-QAM 平均 Pout 10.1/8.9/5.9 dBm，EVM<−25 dB、ACPR<−30 dBc 无 DPD。
readtime: 10
---

> **原文**：*A Wideband Class-AB Power Amplifier With 29–57-GHz AM–PM Compensation in 0.9-V 28-nm Bulk CMOS*, M. Vigilante, P. Reynaert（KU Leuven）, IEEE JSSC, 2018.
> **TL;DR**：站内 [ISSCC 2023 ET 教程](ISSCC2023_T2_Bridging_RF_and_Power_An_Introduction_to_Envelope_Tracking_System_and_Building_Blocks.md)说"PA 要保证 EVM 优于 −25 dB"——那个判据的出处就是本文引用的 Shakib 28 GHz PA 研究。这篇论文则回答 PA 侧怎么做：**宽带调制下相位失真比幅度失真更要命**，而它的第一来源竟然是"还没放大就被非线性输入电容失真"。解法出奇克制：一个 PMOS 变容管对消 C_IN + 把窄带级间匹配换成宽带变压器四阶网络。没有 DPD、没有谐波陷阱、没有甜点偏置——0.9 V 28 nm 普通金属层做出 65% 分数带宽、全带 |AM-PM|<1°。

## 背景与动机

- 5G mm-wave 相控阵选 CMOS（良率/成本/集成度/数字处理），但 V_DD<1 V + 64-QAM PAPR 8–10 dB 严重压缩最大线性平均输出功率；大阵列 + 宽调制带宽让数字预失真的实现成本爆炸。
- **AM-PM 的权重被系统性低估**：5° AM-PM 对 64-QAM EVM 的劣化 ≈1 dB 增益压缩 [6]；深 class-AB 偏置下 AM-PM 在增益压缩 onset 之前就显著。更关键：**从单音 CW 提取的 AM-AM/AM-PM 行为模型无法预测宽带 EVM**，RF BW>100 MHz 时尤其乐观 [4]——所以宽带调制下 AM-PM 线性度是第一优先级。

## 关键方法

### 1. AM-PM 来源分解（Section II–III）

- **非线性 C_IN**：即使 driver 完全线性，信号在进入 PA 前就被非线性输入电容失真；C_GD 经 Miller 反射（系数 $1+g_m(R_o\parallel R_L)$）使输入电容即使 C_GD 线性也随幅度变化。设计例：中性化 CS 级小信号平均 $C_{IN,AV1}\approx128$ fF，1 dB 压缩点以上大信号平均升到 ≈133 fF——这一变化经级间匹配网络直接转成相位/幅度失真。
- **窄带 vs 宽带级间匹配**：窄带 L 谐振在 $C_O/2+C_{IN}$ 上，C_IN 漂移即失谐；宽带匹配下 $|AM\text{-}PM|$ 在整个 BW−3dB 显著改善，增益频率尖峰也被抑制（记忆效应随之受限）。
- **非线性 Gm + 非纯阻负载**：负载在基波非纯阻（class-J）或输出存在与基波相差 90° 的强二次谐波电压时，$I_{1f_0}$ 随幅度变化 → AM-PM。
- **记忆效应**：级联二阶非线性产生的低频包络分量与 2 次谐波附近分量也贡献输出 IM3 [14]；深工艺无 cascode、g_ds 恶化加剧；二阶电流流**共模**，而中性化 CS 级的 CM 隔离差（$2C_{GD}+2C_N$ 低阻路径）→ 需要低阻 CM 偏置网络 + 2 次谐波陷阱，调制 BW 越大越难做。

### 2. 五种线性化技术的取舍（Section III-B）

| 技术 | 原理 | 代价/限制 |
|---|---|---|
| 输入 PMOS varactor | 对消 NMOS 非线性 C_IN；V_cnt 可修 PVT/模型误差 | 增益 −1.8 dB；总 C_IN 升高但 R_IN 更低（de-Q 效应） |
| 互补 N-PMOS 级 | C_GS 与 Gm 失真同时对消 | 不利供电缩放；mm-wave PMOS 建模要求高；输出 CM 不定需反馈环 |
| 源极退化电感 | 软压缩改善、de-Q 级间网络 | 线性换增益（mm-wave 增益最贵） |
| 2 次谐波陷阱 | 压制深 class-AB 输出 2 次谐波（AM-PM 主因之一） | 滤波器 Q 决定抑制与 BW 折中；宽带 CM 低阻路径难做 |
| 甜点偏置 | 多失真机制在特定功率对消 | PVT 敏感，实验室好用、量产难 |

- 本文选择 **PMOS varactor + 宽带级间匹配**——在 <1 V 供电下鲁棒。偏置 PA/driver 于 135/90 μA/μm：P_1dB 处仿真 |AM-PM|<1°；代价 P_sat−P_1dB≈4 dB。若偏得更深可缩到 ~1 dB，但 post-layout 显示 UPA 漏源电压 2 次谐波/基波比增 >20 dB、AM-PM>8°，加理想谐波陷阱可救回 <3°——**作者演示了谐波陷阱的潜力后因宽带 CM 实现困难而放弃**，论证过程完整。

### 3. 宽带变压器四阶匹配网络与 kQ 理论（Section IV）

- 电路变换（Fig 7a）：磁耦合谐振器对实现 **1/n 阻抗缩放**（代价跨阻 Z21 降 1/√n），同时吸收跨导级与焊盘寄生、不加有损元件。中心频率与双谐振峰：
$$f_o=\frac{1}{\sqrt{2\pi L_{O,P}(1-k)C_O}},\quad \frac{f_H}{f_L}=\sqrt{\frac{1+|k_O|}{1-|k_O|}}$$
  谐振处实部 $\mathrm{Re}\{Z_{L,A}\}=R_L\cdot\frac{nL_{O,P}}{L_{O,S}nC_{PAD}}$，当 $C_O/n=C_{PAD}$ 时恰为 $R_L$——**用设计约束（C_O/n=C_PAD）换闭式对准**。
- **kQ 乘积是预算货币**：$kQ=|k_O|\sqrt{Q_OQ_{load}}$（附录 I 从 $|Z_{21}|/\sqrt{R_{11}R_{22}-R_{12}R_{21}}$ 导出）。kO 必须尽量大才能在 BW−3dB 内合成所需阻抗；变压器有损（Q_P=Q_S=10）时第二谐振峰强衰减。无源损耗闭式（式 9）：Q=30/20/10、kint=0.4 时比 kO=0.8 多损 0.4/0.5/1.1 dB。
- **级间耦合系数故意取低**：kint=kO=0.8 时 f_H=3f_L、带内纹波大到 BW<15%；宽带设计取 kint≈0.4。设计例核算（式 10）：窄带 PAE 14.6% vs 宽带仅降 0.04%——**28 nm 的高 gm/ft 让"带宽-线性-效率"三角异常宽松**。
- 功率合成：三端口串联合成器吸收 GSG 焊盘寄生（L_PAD 最小化优先于一切）；两串联变压器间的**寄生磁耦合 k_par** 会让合成阻抗全带抬升（0→0.2 仿真）→ 版图上拉开+正交化布局把 40 GHz 处 k_par 压到 <0.01；最小无源损耗 −1.14 dB@35 GHz、BW−1dB 14–73 GHz。
- 深工艺版图约束的应对：栅方向全 wafer 统一（功率管不能旋转 90°）→ 变压器版图保证 PA/driver 同向；选变压器而非传输线（面积、ESD、balun、DC 馈电）。

## 实验结果与性能指标

0.9 V、28 nm bulk CMOS（无 ultra-thick top metal）；core 0.160 mm²；PA/driver 偏置 135/90 μA/μm；V_cnt 默认 0.7 V。

| 指标 | 数值 |
|---|---|
| S21 增益 / BW−3dB | 20.8 dB / **29–57 GHz（65%）**（最宽报道分数带宽） |
| P_sat / P_1dB（30 GHz） | 16.6 / 13.4 dBm（P_sat BW−1dB 56.6%） |
| PAE_max / PAE@P_1dB | **24.2%** / 12.6%（PAE BW−1dB 39.5%） |
| \|AM-PM\|@P_1dB | <1.8°（26–58 GHz，V_cnt=0.7 V）；调 V_cnt 0.5–0.9 V → **<1°** |
| 群时延波动 | <±10.3 ps（20–54 GHz） |
| 2/3 次谐波@P_1dB | <−50/−39 dBc（26–58 GHz，无片外滤波） |
| 调制（64-QAM，8.3 dB PAPR） | 1.5/3/6 Gb/s 平均 Pout **10.1/8.9/5.9 dBm**@34 GHz |
| EVM / ACPR | **<−25 dB / <−30 dBc（无 DPD）**；上下 ACPR 差 <2.2 dB（记忆效应小） |
| 对比 | 同 EVM/速率下平均 Pout 比 Shakib[4]/Kulkarni[5] 高 5.9/4.7 dB（且 VDD 更低） |

## 个人思考与总结

- **"模型什么时候失效"比"模型多精确"更重要**：本文最有价值的不是 varactor，而是第 II 节的证伪——单音 CW 提取的 AM-AM/AM-PM 模型在宽带调制下预测过于乐观。这与站内 [混合 SM 环路分析](TCASII2022_Loop_Analysis_and_Stability_Considerations_of_Hybrid_PA_Supply_Modulators.md)的"近似要声明边界"一脉相承：**分析性工作的可信度来自失效条件的明示**。
- **kQ 乘积 = 无源网络的统一货币**：阻抗变换比、带宽、损耗全用 kQ 结算（附录给出从 Z 参数到闭式的完整推导）。这套记账法对任何变压器匹配网络都适用——站内做 [bode-plot](../../tools/bode-plot/index.html) 或 [filter-design](../../tools/filter-design/index.html) 分析时，可以把它当成四阶带通的"品质因数预算"。
- **PA 与 SM 是同一份 EVM/ACLR 预算的两半**：教程里 ET 把 PA 驱进压缩区靠 shaping+DPD 兜底；本文则把 PA 自身的 AM-PM 压到 <1° 使得**无 DPD** 也能满足 64-QAM——两条路线本质是"预算花在调制器侧还是放大器侧"的分配问题，最终在系统 EVM 账本上会师。

> **可关联工具**：双谐振峰响应可用站内 [滤波器设计](../../tools/filter-design/index.html) 与 [Bode 绘图](../../tools/bode-plot/index.html) 复现；EVM-失真换算可用 [高斯/统计工具](../../tools/gaussian/index.html) 理解星座散布。
