"""Compact PhysNet-style 3D CNN waveform backbone.

Citation: Yu, Z., Li, X., & Zhao, G. Remote Photoplethysmograph Signal
Measurement from Facial Videos Using Spatio-Temporal Networks.
BMVC 2019.

This is a reasonable compact reimplementation for research scaffolding —
not a bit-exact reproduction of the original codebase.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class _ConvBlock3d(nn.Module):
    def __init__(
        self,
        in_ch: int,
        out_ch: int,
        kernel: tuple[int, int, int] = (3, 3, 3),
        stride: tuple[int, int, int] = (1, 1, 1),
        pool: bool = False,
    ) -> None:
        super().__init__()
        pad = tuple(k // 2 for k in kernel)
        layers: list[nn.Module] = [
            nn.Conv3d(in_ch, out_ch, kernel, stride=stride, padding=pad, bias=False),
            nn.BatchNorm3d(out_ch),
            nn.ReLU(inplace=True),
        ]
        if pool:
            layers.append(nn.MaxPool3d(kernel_size=(1, 2, 2), stride=(1, 2, 2)))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class PhysNet(nn.Module):
    """PhysNet-style encoder → temporal waveform of length T.

    Input:  ``(B, 3, T, H, W)`` face-crop video tensor.
    Output: ``(B, T)`` predicted rPPG waveform (same temporal length).
    """

    def __init__(self, frames: int = 128, base_ch: int = 16) -> None:
        super().__init__()
        self.frames = frames
        c = base_ch
        self.stem = _ConvBlock3d(3, c, pool=True)
        self.b1 = _ConvBlock3d(c, c * 2, pool=True)
        self.b2 = _ConvBlock3d(c * 2, c * 4, pool=True)
        self.b3 = _ConvBlock3d(c * 4, c * 4, pool=False)
        # Temporal refine (keep T), collapse spatial with adaptive pool
        self.temporal = nn.Sequential(
            nn.Conv3d(c * 4, c * 2, kernel_size=(3, 1, 1), padding=(1, 0, 0), bias=False),
            nn.BatchNorm3d(c * 2),
            nn.ReLU(inplace=True),
            nn.Conv3d(c * 2, 1, kernel_size=(1, 1, 1), bias=True),
        )
        self.spatial_pool = nn.AdaptiveAvgPool3d((None, 1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, 3, T, H, W)
        t = x.shape[2]
        h = self.stem(x)
        h = self.b1(h)
        h = self.b2(h)
        h = self.b3(h)
        h = self.spatial_pool(h)  # (B, C, T', 1, 1)
        h = self.temporal(h)  # (B, 1, T', 1, 1)
        wave = h.squeeze(1).squeeze(-1).squeeze(-1)  # (B, T')
        if wave.shape[-1] != t:
            wave = torch.nn.functional.interpolate(
                wave.unsqueeze(1),
                size=t,
                mode="linear",
                align_corners=False,
            ).squeeze(1)
        return wave
