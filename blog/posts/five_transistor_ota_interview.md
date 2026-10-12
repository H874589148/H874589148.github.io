---
title: 模拟 IC 设计面试之 5 管 OTA：高频问题与推导全集
date: 2026-10-12
tags: [analog]
abstract: 5 管 OTA（差分对 + 电流镜负载 + 尾电流源）是模拟面试出现率最高的电路，没有之一。本文按面试问答组织：增益为什么是 gm1(ro2||ro4) 而非 2gm1、GBW 与主极点、镜像节点的 pole-zero doublet 如何毁掉建立时间、输入共模范围与输出摆幅的边界推导、VDS3≠VDS4 引起的系统性失调、PSRR+/PSRR− 为什么不对称、输入参考噪声的四管贡献、SR=ID5/CL、CMRR 与尾阻抗，最后附"参数扰动"追问速查表。
readtime: 13
---

> **TL;DR**：5 管 OTA 的面试本质是考"镜像负载带来的不对称性"：增益 $A_v=g_{m1}(r_{o2}\|r_{o4})$（镜像把两边电流汇合，是 $g_{m1}$ 不是 $2g_{m1}$）；镜像节点引入相距一倍的 pole-zero doublet（$\omega_z\approx2\omega_p$），对相位裕度影响小却拖出**慢建立尾**；静态时 $V_{DS3}\ne V_{DS4}$ 产生系统性失调；PSRR 对正负电源不对称（PSRR⁺≈2·Av 差，PSRR⁻ 好）；噪声由 4 管贡献 $\overline{v_{n,in}^2}=2\big[\overline{v_{n1}^2}+(g_{m3}/g_{m1})^2\overline{v_{n3}^2}\big]$；SR $=I_{D5}/C_L$；CMRR 由尾阻抗决定并随频率滚降。以下逐题给推导与物理图像。

## 1. 电路与记号

M1/M2：NMOS 差分输入对；M3/M4：PMOS 电流镜负载（M3 二极管连接，镜像节点记为 X）；M5：尾电流源（$I_{D5}$，输出阻抗 $r_{o5}$）。输出在 M2/M4 漏端，负载 $C_L$。静态 $I_{1..4}=I_{D5}/2$。

## 2. Q1：低频增益——为什么是 $g_{m1}$ 而不是 $2g_{m1}$？

差模激励 $v_{id}/2$、$-v_{id}/2$：

- M1 侧电流增量 $g_{m1}v_{id}/2$ 流入二极管 M3，被 1:1 镜像到 M4，**推向输出**；
- M2 侧电流增量 $g_{m1}v_{id}/2$ 直接**从输出拉走**；
- 两路在输出节点同向汇合：$i_{out}=g_{m1}v_{id}$。

$$A_v=g_{m1}\left(r_{o2}\|r_{o4}\right)$$

**考点**：电流镜完成了差分到单端的转换且**不损失电流信息**（对比电阻负载半边电路只有一半电流被利用），所以是 $g_{m1}$ 整倍；也正因为两边贡献各 $g_{m1}/2$，不要错答成 $2g_{m1}$（那是 $g_m R$ 对全差分双端输出的情形）。

## 3. Q2：GBW 与主极点

主极点在输出节点：$\omega_{p1}=1/\big[(r_{o2}\|r_{o4})C_L\big]$，于是

$$GBW=A_v\cdot\omega_{p1}=\frac{g_{m1}}{2\pi C_L}$$

——$GBW$ 只由 $g_{m1}$ 与 $C_L$ 决定，与 ro 无关；要更大带宽就加电流或加大输入对 $g_m$（gm/ID 选择见站内 [gm/ID 设计法](gm_id_methodology.md)）。

## 4. Q3：镜像节点的 pole-zero doublet 与建立时间（进阶高频题）

镜像节点 X 的对地阻抗 $\approx1/g_{m3}$（二极管连接），寄生 $C_p\approx C_{gs3}+C_{gs4}+C_{db1}+C_{db3}$，产生非主极点

$$\omega_p\approx\frac{g_{m3}}{C_p}$$

信号到输出有**两条路径**：M2 直通（即时）与 M1→镜像（经 $\omega_p$ 延迟）。低频同相相加得 $g_{m1}$，高频镜像路径滚降后只剩直通的一半 → 传递函数出现一个零点

$$\omega_z\approx2\omega_p$$

**考点三连**：

1. $\omega_z=2\omega_p$ 靠得很近，幅相曲线近似互相抵消 → **对相位裕度影响小**（前提 $\omega_p>GBW$）；
2. 但闭环阶跃响应含双时间常数项 → **慢建立尾（settling tail）**：快速冲到 99% 后，残差以 doublet 间距决定的慢时间常数爬完最后 0.1%——S/H、ADC 驱动等精密建立场景的死穴；
3. 改善方向：镜像管**短 L、小面积**减 $C_p$，取较大 $g_{m3}$（小 gm/ID），必要时 cascode 隔断 $C_{db1}$。

## 5. Q4：输入共模范围（ICMR）推导

**下限**（M5 别出饱和 + M1 导通）：

$$V_{IC,min}=V_{GS1}+V_{OV5}=V_{T1}+V_{OV1}+V_{OV5}$$

**上限**（M1 别进线性区：漏极 $V_X=V_{DD}-|V_{GS3}|$ 须满足 $V_X\ge V_{IC}-V_{T1}$）：

$$V_{IC,max}=V_{DD}-|V_{GS3}|+V_{T1}=V_{DD}-|V_{OV3}|-\big(|V_{T3}|-V_{T1}\big)$$

**考点**：若 $V_{T1}\approx|V_{T3}|$，上限 $\approx V_{DD}-|V_{OV3}|$——NMOS 输入对的共模可以**顶到接近正电源**（轨到轨的高端）；反之低端离 VSS 隔着 $V_{GS1}+V_{OV5}$。要低端够低就换 PMOS 输入对（镜像翻到 NMOS 侧，结论对偶）。

## 6. Q5：输出摆幅——低侧有个坑

- 高侧（M4 饱和）：$V_{out}\le V_{DD}-|V_{OV4}|$；
- 低侧（M2 饱和）：$V_{out}\ge V_S+V_{OV2}$，而 $V_S=V_{IC}-V_{GS1}$。

**坑点**：低侧摆幅不是 $V_{OV2}+V_{OV5}$，而是受**输入共模电平**约束——$V_{IC}$ 抬高时 $V_S$ 跟抬，输出下摆幅被同步压缩。答"单位增益缓冲器的动态范围"时必须把 ICMR 与摆幅联立。

## 7. Q6：系统性失调——$V_{DS3}\ne V_{DS4}$

静态（$v_{id}=0$）要求 $I_2=I_4$。但 M3 二极管连接：$V_{DS3}=|V_{GS3}|$；M4：$V_{DS4}=V_{DD}-V_{out}$。$\lambda\ne0$ 时

$$I_4=I_3\cdot\frac{1+\lambda(V_{DD}-V_{out})}{1+\lambda|V_{GS3}|}\neq I_3\quad\text{除非}\ V_{out}=V_X$$

失衡 $\Delta I$ 折算输入失调 $V_{OS,sys}=\Delta I/g_{m1}$。**数值例**：$\lambda=0.05$/V、$V_{DD}-V_{out}=0.9$ V、$|V_{GS3}|=0.7$ V → $\Delta I/I\approx1\%$；$I=50$ µA、$g_{m1}=1$ mS → $V_{OS}\approx0.5$ mV。

**对策**：静态输出电平设计在 $V_X$ 附近（下一级输入共模匹配）；cascode 镜像（同时等长 $V_{DS}$）；负载管长 L 减 $\lambda$。随机失调（$V_T$ 失配经 gm/ID 放大）叠加其上，见 [gm/ID 设计法](gm_id_methodology.md) 第 3 节。

## 8. Q7：PSRR⁺ 与 PSRR⁻ 为什么不对称

**PSRR⁺（VDD 扰动）——差**。输入接地时 $I_3$ 恒定 → $|V_{GS3}|$ 恒定 → $\Delta V_X=\Delta V_{DD}$ → M4 的 $V_{SG4}$ 不变，受控源不动；只剩 $r_{o4}$ 从 VDD 到输出的直接馈通，与 $r_{o2}$ 分压：

$$A_{vdd+}=\frac{r_{o2}}{r_{o2}+r_{o4}}\approx\frac{1}{2}\ \Rightarrow\ PSRR^+\approx2A_v$$

**PSRR⁻（VSS 扰动）——好**。扰动须经尾管 $r_{o5}$ 转化为共模波动，再被镜像的共模抑制（见 Q10）衰减：$PSRR^-\approx A_v\cdot(2g_{m3}r_{o5})$，比 PSRR⁺ 高约 $2g_{m3}r_{o5}$ 倍。

**结论与对策**：正电源是软肋（$PSRR^+$ 只有 ~2·Av，且随 $C_L$ 滚降）；改善靠 cascode 输出级、干净 LDO/RC 滤波供电。这也是两级 OTA 与 LDO 级联时 PSRR 预算的常客。

## 9. Q8：输入参考噪声——4 只管子怎么折算

- M1/M2：直接 1:1 折算到输入；
- M3：噪声电流经镜像复制到 M4 进输出；M4：噪声电流直接进输出。输出电流噪声折算输入要除以信号跨导 $g_{m1}$：

$$\overline{v_{n,in}^2}=2\left[\overline{v_{n1}^2}+\left(\frac{g_{m3}}{g_{m1}}\right)^2\overline{v_{n3}^2}\right]$$

**降噪声手段**：$g_{m1}\uparrow$（电流或尺寸）、$g_{m3}\downarrow$（负载管同电流下大 $V_{OV}$、长 L——与 Q4 的 doublet 诉求一致：负载管本来就该小 gm/ID）；1/f 噪声靠输入对**面积**（$KF/(WL\cdot f)$），PMOS 输入对通常 1/f 更优。

## 10. Q9：压摆率与大信号限幅

差模输入超过约 $\pm\sqrt{2}\,V_{OV}$ 后一侧截止，尾电流 $I_{D5}$ 全部流经单边，镜像原样放大到输出 → 充放电对称：

$$SR=\frac{I_{D5}}{C_L}$$

**考点**：电流镜负载使正负 SR 相等（电阻负载差分级不对称）；小信号线性范围 $|v_{id}|\lesssim V_{OV}$，超出即失真，再超出 $\sqrt{2}V_{OV}$ 进入 slewing——$V_{OV1}$ 是线性度与效率（gm/ID）的折中点。

## 11. Q10：CMRR 与尾阻抗

尾阻抗有限使共模信号转化为尾电流波动 $\Delta I\approx v_{ic}/r_{o5}$；镜像两侧节点阻抗不对称（二极管低阻 vs 输出高阻）把共模波动转成差模输出。一阶估算：

$$A_{cm}\approx\frac{1}{2g_{m3}r_{o5}}\ \Rightarrow\ CMRR\approx g_{m1}\big(r_{o2}\|r_{o4}\big)\cdot2g_{m3}r_{o5}$$

**高频考点**：尾节点寄生电容 $C_5$ 使尾阻抗 $\propto1/sC_5$ 滚降 → **CMRR 自 $\omega\approx1/(r_{o5}C_5)$ 起 20 dB/dec 恶化**；改善：cascode 尾管（$r_{o5}$ 平方）、版图对称、单位增益应用时共模固定。

## 12. 参数扰动追问速查表

| 扰动 | 增益 | GBW | doublet | 噪声 | 失调 | ICMR | CMRR |
|---|---|---|---|---|---|---|---|
| M3/M4 W 加倍（I 不变） | — | — | $C_p\uparrow$ 拉近，settling 差 | $(g_{m3}/g_{m1})^2$ 项略升 | $g_{m3}$ 失配项变 | — | 略升 |
| 尾管加 cascode | — | — | — | — | — | $V_{IC,min}$ 抬高 | ↑↑ |
| 负载改 cascode 镜像 | ↑ | — | $C_p$ 隔断改善 | — | 系统失调↓ | — | 摆幅↓ |
| 输入对换 PMOS | 同构 | — | — | 1/f 通常更优 | — | 移向 VSS 侧 | — |
| $I_{D5}$ 加倍 | ro 减半→略降 | ↑√2 | $\omega_p$↑ | 热噪↓ | $V_{OS,sys}$ 折算↓ | 上下限内缩 | — |

## 13. 小结

- 一张总图：$A_v=g_{m1}(r_{o2}\|r_{o4})$、$GBW=g_{m1}/2\pi C_L$、$SR=I_{D5}/C_L$ 三式定主干；
- 全部"陷阱"都来自镜像负载的不对称：doublet、系统失调、PSRR 不对称、CMRR 高频滚降；
- 答题范式：先给公式，再给物理图像（哪条路径、哪个阻抗、哪个寄生），最后给改善手段（cascode/尺寸/gm-ID 折中）——三个层次层层递进即是面试加分点。

> **可关联工具**：$g_m$、GBW、$f_T$ 的数值核算见站内 [gm/ID 设计法](gm_id_methodology.md) 与 [Bode 绘图](../../tools/bode-plot/index.html)；热噪声代入可用 [噪声快速计算](../../tools/noise-calc/index.html)；失调/失配的统计分布换算见 [高斯/统计工具](../../tools/gaussian/index.html)；失调的电路级消除技术见站内 [chopper 工作原理](chopper_principles.md)；5 管 OTA 作为增益级在片上传感前端中的应用见 [仪表放大器常见结构](in_amp_topologies.md)。
