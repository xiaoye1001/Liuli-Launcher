"""原创氛围音乐合成：柔和钢琴 + 长音铺底 + 轻混响，每首约两分钟、首尾可以无缝循环。

所有旋律与和声都是在这里按规则生成的原创作品，不引用任何现有曲目。
用法：python3 music.py <输出目录>
"""
import sys, wave, math
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(name):
    """'C4' → 60"""
    pitch = name[:-1]
    octave = int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def freq(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def piano(f, dur, vel=0.6, bright=1.0):
    """简单的钢琴音色：几条衰减速度不同的泛音 + 轻微失谐 + 击弦瞬态"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (amp, decay) in enumerate([(1.0, 1.4), (0.45, 2.2), (0.22 * bright, 3.4), (0.12 * bright, 4.8), (0.06 * bright, 6.5), (0.03 * bright, 8.0)]):
        h = k + 1
        inharm = 1 + 0.0004 * h * h
        detune = 1 + (rng.random() - 0.5) * 0.0006
        out += amp * np.sin(2 * np.pi * f * h * inharm * detune * t + rng.random() * 6.28) * np.exp(-t * decay * (0.6 + f / 900))
    attack = np.minimum(1, t / 0.008)
    release = np.minimum(1, (dur - t) / 0.25).clip(0, 1)
    hammer = lowpass_fast(rng.standard_normal(n) * np.exp(-t * 120), 3000) * 0.012
    return (out * attack * release + hammer) * vel


def pad(f, dur, vel=0.18, warmth=1.0):
    """柔和的长音铺底：几条略微失谐的锯齿波经过低通，慢慢淡入淡出"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-0.004, 0.0, 0.0035):
        ph = 2 * np.pi * f * (1 + d) * t + rng.random() * 6.28
        # 前几条泛音近似柔和的锯齿波
        for h in range(1, 7):
            out += np.sin(ph * h) / h * (warmth ** (h - 1))
    env = np.minimum(1, t / 1.6) * np.minimum(1, (dur - t) / 1.8).clip(0, 1)
    lfo = 1 + 0.08 * np.sin(2 * np.pi * 0.17 * t + rng.random() * 6)
    return out / 3 * env * lfo * vel


def bell(f, dur, vel=0.25):
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 6)
    return out * np.exp(-t * 1.1) * np.minimum(1, t / 0.003) * vel


def lowpass(x, cutoff):
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lowpass_fast(x, cutoff):
    """一阶低通（向量化：分块用指数核卷积近似）"""
    a = math.exp(-2 * math.pi * cutoff / SR)
    k = int(min(SR * 0.05, math.log(1e-4) / math.log(a)))
    kernel = (1 - a) * a ** np.arange(k)
    return np.convolve(x, kernel)[: len(x)]


def reverb(x, mix=0.32, size=1.0):
    """梳状 + 全通的简单混响（Schroeder）"""
    out = np.zeros_like(x)
    for delay, fb in [(1557, 0.84), (1617, 0.83), (1491, 0.85), (1422, 0.86), (1277, 0.87), (1356, 0.86)]:
        d = int(delay * size)
        y = np.zeros(len(x) + d)
        y[: len(x)] = x
        # 反馈梳状滤波：分块向量化
        buf = np.zeros(len(x))
        for start in range(0, len(x), d):
            end = min(len(x), start + d)
            prev = buf[start - d : end - d] if start >= d else np.zeros(end - start)
            buf[start:end] = x[start:end] + fb * prev
        out += buf
    out /= 6
    for delay, g in [(225, 0.5), (556, 0.5), (441, 0.5)]:
        y = np.zeros_like(out)
        for start in range(0, len(out), delay):
            end = min(len(out), start + delay)
            xin = out[start:end]
            yprev = y[start - delay : end - delay] if start >= delay else np.zeros(end - start)
            xprev = out[start - delay : end - delay] if start >= delay else np.zeros(end - start)
            y[start:end] = -g * xin + xprev + g * yprev
        out = y
    return x * (1 - mix) + out * mix


def place(buf, sig, at):
    i = max(0, int(at * SR))
    end = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:end] += sig[: end - i]


def compose(spec):
    """
    spec: key（主音 MIDI）、scale（音阶半音列表）、progression（和弦级数列表，每个和弦占一小节）、
    bpm、bars、style 参数。生成：左手分解和弦、右手按音阶随机游走的旋律、长音铺底、偶尔的铃声点缀。
    """
    bpm = spec['bpm']
    beat = 60 / bpm
    bar = beat * 4
    bars = spec['bars']
    total = bar * bars
    tail = 6.0
    L = np.zeros(int(SR * (total + tail)))
    R = np.zeros_like(L)
    key = spec['key']
    scale = spec['scale']
    prog = spec['progression']
    r = np.random.default_rng(spec['seed'])

    def degree(d, octave=0):
        o, i = divmod(d, len(scale))
        return key + scale[i] + 12 * (o + octave)

    melody_pos = 7  # 旋律在音阶上的位置（从中音区开始）
    for b in range(bars):
        root = prog[b % len(prog)]
        t0 = b * bar
        chord = [degree(root, -1), degree(root + 2, -1), degree(root + 4, -1)]
        # 铺底：每小节一个和弦
        if spec.get('pad', 0.18) > 0:
            for m in chord:
                p = pad(freq(m), bar + 1.8, spec.get('pad', 0.18), spec.get('warmth', 0.75))
                place(L, p * 0.9, t0)
                place(R, p, t0 + 0.012)
        # 低音
        bass = piano(freq(degree(root, -2)), bar * 1.2, 0.5 * spec.get('bass', 1.0), 0.6)
        place(L, bass, t0)
        place(R, bass * 0.9, t0)
        # 左手分解和弦
        pattern = spec.get('arp', [0, 1, 2, 1, 0, 2, 1, 2])
        step = bar / len(pattern)
        for i, idx in enumerate(pattern):
            if r.random() < spec.get('arp_skip', 0.08):
                continue
            m = chord[idx] + (12 if (i % 4 == 3 and r.random() < 0.3) else 0)
            s = piano(freq(m), step * 3, 0.26 * spec.get('arp_vel', 1.0), 0.8)
            place(L, s * 1.1, t0 + i * step + r.normal(0, 0.006))
            place(R, s * 0.8, t0 + i * step + r.normal(0, 0.006))
        # 右手旋律：前后两小节一句，句尾停在和弦音上
        if b >= spec.get('melody_from', 2) and (b < bars - 1):
            rhythm = spec['rhythms'][r.integers(len(spec['rhythms']))]
            t = t0
            for k, dur in enumerate(rhythm):
                if dur < 0:
                    t += -dur * beat
                    continue
                move = r.choice([-2, -1, -1, 0, 1, 1, 2, 3, -3], p=[0.1, 0.2, 0.0, 0.05, 0.25, 0.0, 0.15, 0.1, 0.15])
                melody_pos = int(np.clip(melody_pos + move, 4, 13))
                if k == len(rhythm) - 1:
                    # 句尾落到最近的和弦音
                    targets = [root + 7, root + 9, root + 11, root + 14]
                    melody_pos = min(targets, key=lambda x: abs(x - melody_pos))
                m = degree(melody_pos)
                s = piano(freq(m), dur * beat + 1.6, 0.42 * spec.get('mel_vel', 1.0), spec.get('bright', 1.0))
                place(L, s * 0.85, t)
                place(R, s, t + 0.008)
                t += dur * beat
        # 点缀的铃声
        if spec.get('bells', 0) and r.random() < spec['bells']:
            m = degree(root + r.choice([7, 9, 11, 14]), 1)
            s = bell(freq(m), 3.5, 0.12)
            place(L, s, t0 + beat * r.integers(4))
            place(R, s * 0.7, t0 + beat * r.integers(4) + 0.02)
    # 混响与淡入淡出；尾巴叠回开头，循环时没有断点
    L = reverb(L, spec.get('reverb', 0.35), spec.get('room', 1.0))
    R = reverb(R, spec.get('reverb', 0.35), spec.get('room', 1.07))
    n = int(SR * total)
    t_len = len(L) - n
    L[:t_len] += L[n:]
    R[:t_len] += R[n:]
    L, R = L[:n], R[:n]
    fade = int(SR * 0.05)
    peak = max(np.abs(L).max(), np.abs(R).max())
    gain = 0.85 / peak
    stereo = np.stack([L, R], axis=1) * gain
    stereo[:fade] *= np.linspace(0, 1, fade)[:, None] ** 0.5
    stereo[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 0.5
    return stereo


MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
DORIAN = [0, 2, 3, 5, 7, 9, 10]
LYDIAN = [0, 2, 4, 6, 7, 9, 11]
PENTA_MAJ = [0, 2, 4, 7, 9]

SPECS = {
    # 晨光平原：明亮的 D 大调，6/8 感的分解和弦，温暖
    'plains': dict(seed=1, key=midi('D4'), scale=MAJOR, progression=[0, 4, 5, 3, 0, 4, 3, 4], bpm=72, bars=34,
                   rhythms=[[1, 1, 2], [1.5, 0.5, 2], [2, 1, 1], [1, -1, 1, 1], [0.5, 0.5, 1, 2]], bells=0.25, pad=0.14, reverb=0.32),
    # 樱花之境：五声音阶的 F 大调，轻盈、铃声多一些
    'cherry': dict(seed=2, key=midi('F4'), scale=PENTA_MAJ, progression=[0, 3, 4, 2, 0, 3, 1, 4], bpm=66, bars=30,
                   rhythms=[[1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 1, 1], [3, 1]], bells=0.5, pad=0.12, arp=[0, 2, 1, 2, 0, 2, 1, 2], reverb=0.36, bright=1.2),
    # 雪原极光：E 小调，慢、空旷，混响大
    'aurora_night': dict(seed=3, key=midi('E4'), scale=MINOR, progression=[0, 5, 2, 6, 0, 3, 5, 4], bpm=56, bars=26,
                         rhythms=[[2, 2], [3, 1], [1, 1, 2], [-1, 1, 2]], bells=0.45, pad=0.2, warmth=0.6, arp=[0, 1, 2, 1], arp_vel=0.8, reverb=0.48, room=1.25, bright=0.8),
    # 下界熔岩海：C 小调多利亚，低沉的低音、稍紧张
    'nether': dict(seed=4, key=midi('C4'), scale=DORIAN, progression=[0, 0, 6, 5, 0, 3, 6, 4], bpm=64, bars=30,
                   rhythms=[[1, 1, 2], [0.5, 0.5, 1, 2], [2, 2], [1, 1, 1, 1]], bells=0.1, pad=0.22, warmth=0.85, bass=1.4, arp=[0, 2, 0, 1, 0, 2, 0, 1], reverb=0.38, bright=0.7, mel_vel=0.85),
    # 末地星海：G 利底亚，梦幻、悬浮感
    'the_end': dict(seed=5, key=midi('G4'), scale=LYDIAN, progression=[0, 1, 0, 6, 0, 1, 4, 3], bpm=60, bars=28,
                    rhythms=[[2, 1, 1], [1, 1, 2], [3, 1], [-2, 1, 1]], bells=0.6, pad=0.2, warmth=0.7, arp=[0, 1, 2, 1, 2, 1], reverb=0.5, room=1.3, bright=1.1),
}


def write_wav(path, stereo):
    data = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == '__main__':
    out = sys.argv[1]
    names = sys.argv[2:] or list(SPECS)
    for name in names:
        audio = compose(SPECS[name])
        write_wav(f'{out}/{name}.wav', audio)
        print(name, f'{len(audio) / SR:.1f}s')
