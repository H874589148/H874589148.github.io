---
title: Buck 变换器数字控制器设计：Type-III 补偿与环路带宽优化
date: 2023-11-12
tags: [power, control]
authors: 示例作者 et al.
source: IEEE TPEL
abstract: 针对 Buck 变换器的数字电压模式控制，本文推导了 Type-III 补偿器的零极点配置方法，分析了相位裕度与环路带宽的设计权衡，给出了完整的 Bode 图设计流程。
readtime: 8
---

> **原文**：*Digital Voltage-Mode Control of Buck Converters with Type-III Compensation*, 示例作者 et al., IEEE TPEL, 2023。
> **TL;DR**：环路带宽取开关频率的 1/10～1/20，相位裕度不低于 45°；Type-III 双零点用于补偿 LC 谐振峰，高频双极点用于抑制开关纹波与 ESR 零点后的增益抬升。

## 背景与动机

数字电压模式控制中，占空比到输出的功率级传函带有双极点谐振特性，若仅用积分补偿，环路穿越处相位裕度不足。Type-III 补偿器通过两个零点抬升穿越频率附近的相位，是电流环缺失时的标准解法。

## 关键方法

功率级占空比-输出传函：

$$G_{vd}(s) = V_{in} \cdot \frac{1 + s/\omega_{esr}}{1 + s/(\omega_0 Q) + s^2/\omega_0^2}$$

Type-III 补偿器传函：

$$G_c(s) = \frac{G_{c0}\,(1 + s/\omega_{z1})(1 + s/\omega_{z2})}{s\,(1 + s/\omega_{p1})(1 + s/\omega_{p2})}$$

零极点配置准则：

- $\omega_{z1}, \omega_{z2}$ 置于 $\omega_0$ 的 0.5～1 倍附近，补偿谐振峰带来的相位跌落；
- $\omega_{p1}$ 置于开关频率的一半，$\omega_{p2}$ 置于 ESR 零点之后，共同抑制高频增益；
- 穿越频率 $f_c$ 取 $f_{sw}/10 \sim f_{sw}/20$。

## 零极点配置伪代码

```python
# Type-III 零极点配置（示例流程）
fc = fsw / 15            # 目标环路带宽
wz1 = 0.5 * w0           # 补偿 LC 谐振峰
wz2 = 1.0 * w0
wp1 = pi * fsw           # 抑制开关纹波
wp2 = 5 * w_esr          # ESR 零点之后收敛增益
# 扫描 Q 与 Vin 角点，校验相位裕度 >= 45deg
```

## 实验结果与性能指标

| 指标 | 本文结果 | 参考值 |
| --- | --- | --- |
| 环路带宽 | 66 kHz | 50 kHz |
| 相位裕度 | 52° | 45° |
| 负载阶跃（1A/u s）ΔVout | 48 mV | 80 mV |
| 纹波 | 12 mVpp | 20 mVpp |

## 个人思考与总结

- 数字实现中离散化延迟（ZOH + 计算延迟）会额外吃掉相位，高频极点需要留更大裕量。
- Type-III 的四个零极点对元件漂移敏感，量产上建议配合在线辨识做自适应整定。
- 论文给出的角点扫描流程可以直接搬到 Bode 图工具里逐点验证。

> **可关联工具**：使用 [零极点 Bode 图](../../tools/bode-plot/index.html) 与 [密勒补偿 Bode 图](../../tools/miller-comp/index.html) 直观验证补偿前后的环路特性。
