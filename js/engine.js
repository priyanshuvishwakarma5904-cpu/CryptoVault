/**
 * CryptoVault — Pixel Encryption Engine
 * engine.js — Core cryptographic pixel manipulation algorithms
 *
 * All operations are performed on raw RGBA pixel arrays.
 * No data is sent to any server — 100% client-side.
 */

'use strict';

const CryptoEngine = (() => {

  // ─── Key utilities ───────────────────────────────────────────────────────

  /**
   * Produces a 32-bit integer hash from an arbitrary string key.
   * Uses a modified DJB2 / FNV hybrid.
   */
  function keyHash(key) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  /**
   * Linear Congruential Generator seeded from key hash.
   * Returns a closure that yields pseudo-random numbers in [0, 1).
   */
  function makeLCG(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  /**
   * Expand a key string into a Uint8Array keystream of arbitrary length.
   */
  function expandKey(key, length) {
    const rand = makeLCG(keyHash(key));
    const stream = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      stream[i] = Math.floor(rand() * 256);
    }
    return stream;
  }

  /**
   * Evaluate key strength: 0 (very weak) to 5 (very strong).
   */
  function keyStrength(key) {
    if (!key || key.length === 0) return 0;
    let score = 0;
    if (key.length >= 8)  score++;
    if (key.length >= 14) score++;
    if (/[a-z]/.test(key)) score++;
    if (/[A-Z]/.test(key)) score++;
    if (/[0-9!@#$%^&*]/.test(key)) score++;
    return score;
  }

  // ─── Algorithm 1: XOR Cipher ─────────────────────────────────────────────

  /**
   * XOR each RGB channel with an expanded keystream.
   * Self-inverse: encrypt(encrypt(data, key), key) === data.
   */
  function xorCipher(data, key) {
    const out = new Uint8ClampedArray(data.length);
    const stream = expandKey(key, data.length);
    for (let i = 0; i < data.length; i += 4) {
      out[i]     = data[i]     ^ stream[i];
      out[i + 1] = data[i + 1] ^ stream[i + 1];
      out[i + 2] = data[i + 2] ^ stream[i + 2];
      out[i + 3] = data[i + 3]; // preserve alpha
    }
    return out;
  }

  // ─── Algorithm 2: Caesar Shift ───────────────────────────────────────────

  /**
   * Add a different key-derived offset to each RGB channel (mod 256).
   * Decryption subtracts the same offsets.
   */
  function caesarShift(data, key, decrypt = false) {
    const h = keyHash(key);
    const offsets = [h % 256, (h >> 8) % 256, (h >> 16) % 256];
    const out = new Uint8ClampedArray(data.length);
    const sign = decrypt ? -1 : 1;
    for (let i = 0; i < data.length; i += 4) {
      out[i]     = (data[i]     + sign * offsets[0] + 768) & 0xFF;
      out[i + 1] = (data[i + 1] + sign * offsets[1] + 768) & 0xFF;
      out[i + 2] = (data[i + 2] + sign * offsets[2] + 768) & 0xFF;
      out[i + 3] = data[i + 3];
    }
    return out;
  }

  // ─── Algorithm 3: Channel Swap ───────────────────────────────────────────

  // All 6 permutations of [R, G, B]
  const CHANNEL_PERMS = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2],
    [1, 2, 0], [2, 0, 1], [2, 1, 0]
  ];

  // Precomputed inverse permutations
  function invertPerm(p) {
    const inv = [0, 0, 0];
    for (let i = 0; i < 3; i++) inv[p[i]] = i;
    return inv;
  }

  /**
   * Shuffle RGB channels using a key-derived permutation.
   * Decrypt uses the inverse permutation.
   */
  function channelSwap(data, key, decrypt = false) {
    const h = keyHash(key);
    const perm = CHANNEL_PERMS[h % 6];
    const map  = decrypt ? invertPerm(perm) : perm;
    const out  = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      out[i]     = data[i + map[0]];
      out[i + 1] = data[i + map[1]];
      out[i + 2] = data[i + map[2]];
      out[i + 3] = data[i + 3];
    }
    return out;
  }

  // ─── Algorithm 4: Bit Rotation ───────────────────────────────────────────

  function rotl8(b, n) { n &= 7; return ((b << n) | (b >>> (8 - n))) & 0xFF; }
  function rotr8(b, n) { n &= 7; return ((b >>> n) | (b << (8 - n))) & 0xFF; }

  /**
   * Rotate each channel byte left/right by N bits.
   * N is derived from key hash, range 1–7.
   */
  function bitRotation(data, key, decrypt = false) {
    const n = ((keyHash(key) % 7) + 1);
    const op = decrypt ? rotr8 : rotl8;
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      out[i]     = op(data[i],     n);
      out[i + 1] = op(data[i + 1], n);
      out[i + 2] = op(data[i + 2], n);
      out[i + 3] = data[i + 3];
    }
    return out;
  }

  // ─── Algorithm 5: Block Scramble ─────────────────────────────────────────

  const BLOCK_SIZE = 16; // px

  /**
   * Seeded Fisher-Yates shuffle of block indices.
   */
  function shuffleIndices(n, rand) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Scramble image by shuffling 16×16 blocks.
   * encrypt=true: scatter blocks; encrypt=false: restore.
   */
  function blockScramble(data, width, height, key, encrypt = true) {
    const cols  = Math.ceil(width  / BLOCK_SIZE);
    const rows  = Math.ceil(height / BLOCK_SIZE);
    const n     = cols * rows;
    const rand  = makeLCG(keyHash(key));
    const order = shuffleIndices(n, rand); // dest → source mapping when encrypting

    // Build inverse (source → dest) for decryption
    const inverse = new Array(n);
    for (let i = 0; i < n; i++) inverse[order[i]] = i;

    const srcMap = encrypt ? order : inverse;

    const out = new Uint8ClampedArray(data.length);
    // Copy pixels that won't be touched (edge partial blocks) as-is
    out.set(data);

    for (let di = 0; di < n; di++) {
      const si = srcMap[di];
      const dc = di % cols, dr = Math.floor(di / cols);
      const sc = si % cols, sr = Math.floor(si / cols);

      for (let by = 0; by < BLOCK_SIZE; by++) {
        const dy = dr * BLOCK_SIZE + by;
        const sy = sr * BLOCK_SIZE + by;
        if (dy >= height || sy >= height) continue;

        for (let bx = 0; bx < BLOCK_SIZE; bx++) {
          const dx = dc * BLOCK_SIZE + bx;
          const sx = sc * BLOCK_SIZE + bx;
          if (dx >= width || sx >= width) continue;

          const dp = (dy * width + dx) << 2;
          const sp = (sy * width + sx) << 2;
          out[dp]     = data[sp];
          out[dp + 1] = data[sp + 1];
          out[dp + 2] = data[sp + 2];
          out[dp + 3] = data[sp + 3];
        }
      }
    }
    return out;
  }

  // ─── Algorithm 6: Combined ───────────────────────────────────────────────

  /**
   * Triple-layer: XOR → Caesar Shift → Channel Swap.
   * Decrypt reverses: Channel Swap → Caesar Shift → XOR.
   */
  function combined(data, width, height, key, decrypt = false) {
    const k1 = key + '_xor';
    const k2 = key + '_shift';
    const k3 = key + '_ch';

    if (!decrypt) {
      let d = xorCipher(data, k1);
      d = caesarShift(d, k2, false);
      d = channelSwap(d, k3, false);
      return d;
    } else {
      let d = channelSwap(data, k3, true);
      d = caesarShift(d, k2, true);
      d = xorCipher(d, k1);
      return d;
    }
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────

  /**
   * Run the selected algorithm.
   * @param {Uint8ClampedArray} data  Raw pixel array (RGBA)
   * @param {number}            width
   * @param {number}            height
   * @param {string}            key
   * @param {string}            algo  One of: xor|shift|channel|bitrot|block|combined
   * @param {boolean}           decrypt
   * @returns {Uint8ClampedArray}
   */
  function run(data, width, height, key, algo, decrypt = false) {
    const src = new Uint8ClampedArray(data);
    switch (algo) {
      case 'xor':      return xorCipher(src, key);
      case 'shift':    return caesarShift(src, key, decrypt);
      case 'channel':  return channelSwap(src, key, decrypt);
      case 'bitrot':   return bitRotation(src, key, decrypt);
      case 'block':    return blockScramble(src, width, height, key, !decrypt);
      case 'combined': return combined(src, width, height, key, decrypt);
      default:         throw new Error(`Unknown algorithm: ${algo}`);
    }
  }

  // ─── Entropy analysis ────────────────────────────────────────────────────

  /**
   * Compute a simple byte-level Shannon entropy on the R channel.
   * Returns a value in [0, 8] bits.
   */
  function shannonEntropy(data) {
    const freq = new Float64Array(256);
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) freq[data[i]]++;
    let H = 0;
    for (let v = 0; v < 256; v++) {
      if (freq[v] === 0) continue;
      const p = freq[v] / n;
      H -= p * Math.log2(p);
    }
    return H;
  }

  /**
   * Count unique RGBA colors (capped at 100 000 for performance).
   */
  function uniqueColors(data) {
    const set = new Set();
    const cap = Math.min(data.length, 400000);
    for (let i = 0; i < cap; i += 4) {
      set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return set.size;
  }

  /**
   * Average perceived brightness (0–255).
   */
  function avgBrightness(data) {
    let sum = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / n;
  }

  /**
   * Build a per-channel histogram (256 bins each).
   * Returns { r, g, b } arrays.
   */
  function histogram(data) {
    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      r[data[i]]++;
      g[data[i + 1]]++;
      b[data[i + 2]]++;
    }
    return { r, g, b };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    run,
    keyHash,
    keyStrength,
    shannonEntropy,
    uniqueColors,
    avgBrightness,
    histogram,
    ALGORITHMS: ['xor', 'shift', 'channel', 'bitrot', 'block', 'combined'],
  };

})();

// Make available globally
window.CryptoEngine = CryptoEngine;
