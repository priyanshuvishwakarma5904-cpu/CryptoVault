# CryptoVault — Pixel Encryption Engine

> A production-grade, browser-based image encryption tool using pixel-level manipulation. No servers, no uploads — every operation runs entirely in your browser via the Canvas API.

![CryptoVault Screenshot](assets/preview.png)

---

## Features

- **6 Encryption Algorithms** — XOR Cipher, Caesar Shift, Channel Swap, Bit Rotation, Block Scramble, and a Combined triple-layer mode
- **Real-time Entropy Analysis** — Shannon entropy, unique color count, average brightness, and a live RGB histogram
- **Key Strength Meter** — Visual feedback on passphrase security
- **Diff View** — See exactly what changed between original and encrypted images
- **Operation History** — Timestamped log of all encrypt/decrypt operations
- **Zero data transmission** — 100% client-side; your images never leave the browser
- **Download as PNG** — Lossless output guaranteed

---

## Algorithms

| # | Name | Type | Decryptable |
|---|------|------|-------------|
| 1 | XOR Cipher | Key-expanded bitwise XOR per channel | Self-inverse |
| 2 | Caesar Shift | Modular offset per RGB channel | Yes (subtract) |
| 3 | Channel Swap | RGB permutation (6 possible) | Yes (inverse perm) |
| 4 | Bit Rotation | Circular bit-shift within each byte | Yes (rotate opposite) |
| 5 | Block Scramble | Seeded Fisher-Yates block shuffle | Yes (inverse order) |
| 6 | Combined (Max) | XOR + Caesar + Channel Swap chained | Yes (reverse chain) |

---

## Project Structure

```
cryptovault/
├── index.html          # Main HTML shell
├── css/
│   └── style.css       # Full design system — dark terminal aesthetic
├── js/
│   ├── engine.js       # Core crypto engine (algorithms, entropy, key utils)
│   └── ui.js           # DOM controller (tabs, canvas, drag-drop, history)
├── assets/
│   └── preview.png     # Screenshot for README
└── README.md
```

---

## How It Works

### Key Derivation
All algorithms derive their parameters from the user's passphrase using:
1. **DJB2/FNV hybrid hash** → 32-bit integer key hash
2. **Linear Congruential Generator (LCG)** seeded from the hash → pseudo-random keystream

### XOR Cipher
```
keystream = LCG(hash(key))
out[i] = pixel[i] XOR keystream[i]
```
Self-inverse — the same operation both encrypts and decrypts.

### Caesar Shift
```
offsets = [hash % 256, (hash>>8) % 256, (hash>>16) % 256]
out[R] = (pixel[R] + offsets[0]) mod 256
```
Decryption subtracts the same offsets.

### Channel Swap
One of 6 RGB permutations is selected:
```
perm = PERMUTATIONS[hash % 6]
[out.R, out.G, out.B] = [pixel[perm[0]], pixel[perm[1]], pixel[perm[2]]]
```
Decryption applies the mathematically inverse permutation.

### Bit Rotation
```
n = (hash % 7) + 1   // 1–7 bits
out[i] = rotl8(pixel[i], n)   // circular left rotation
```
Decryption rotates right by the same amount.

### Block Scramble
```
blocks = divide_image(width, height, 16px)
order = fisher_yates_shuffle(blocks, seed=hash(key))
scrambled = rearrange(blocks, order)
```
Decryption computes the inverse permutation and restores block positions.

### Combined (Max Security)
```
E(x) = channelSwap(caesarShift(xorCipher(x, k1), k2), k3)
D(x) = xorCipher(caesarShift(channelSwap(x, k3), k2, inv), k1)
```
Three separate key variants (derived from `key + '_xor'`, `key + '_shift'`, `key + '_ch'`) are used for each layer.

---

## Important Notes

- **Always save as PNG** — JPEG re-encoding alters pixel values, breaking decryption
- **Keep your key safe** — There is no key recovery mechanism
- **Same key + same algorithm** must be used for decryption
- All operations preserve the alpha channel

---

## Tech Stack

| Technology | Usage |
|------------|-------|
| HTML5 Canvas API | Pixel-level image read/write |
| Vanilla JavaScript (ES6+) | Zero dependencies |
| CSS Custom Properties | Theme system, dark mode |
| Syne (Google Fonts) | Display typography |
| Space Mono (Google Fonts) | Monospaced UI text |
| Web Crypto (key hashing) | LCG + DJB2 hash |
| Blob/URL API | Lossless PNG download |
| localStorage | Persistent operation counter |

---

## Getting Started

No build steps. No package manager. No dependencies.

```bash
# Clone or download the project
git clone https://github.com/yourusername/cryptovault.git

# Open in browser
open index.html
# or serve with any static file server:
npx serve .
```

---

## License

MIT License — free to use, modify, and distribute.

---

*Built as a portfolio project demonstrating pixel manipulation, cryptographic concepts, and production-grade vanilla JavaScript.*
