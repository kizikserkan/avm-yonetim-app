/* =========================================================================
   Basit TOTP (Google Authenticator / Microsoft Authenticator uyumlu)
   yardımcıları — Yönetim girişinde iki aşamalı doğrulama (2FA) için.

   RFC 4226 (HOTP) ve RFC 6238 (TOTP) temel alınmıştır. Tarayıcının yerleşik
   Web Crypto API'si (SubtleCrypto) kullanılır, harici bir kütüphaneye
   gerek yoktur. 30 saniyelik standart zaman adımı ve 6 haneli kod
   kullanılır — bu, Google Authenticator'ın varsayılan ayarlarıyla
   birebir uyumludur.
   ========================================================================= */

const TOTP = {
  BASE32_ALPHABET: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",

  // Rastgele, Google Authenticator'ın kabul ettiği formatta bir secret üretir.
  generateSecret(byteLength = 20) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return this.base32Encode(bytes);
  },

  base32Encode(bytes) {
    let bits = "";
    for (const b of bytes) bits += b.toString(2).padStart(8, "0");
    let output = "";
    for (let i = 0; i + 5 <= bits.length; i += 5) {
      output += this.BASE32_ALPHABET[parseInt(bits.substr(i, 5), 2)];
    }
    const rem = bits.length % 5;
    if (rem > 0) {
      const last = bits.substr(bits.length - rem).padEnd(5, "0");
      output += this.BASE32_ALPHABET[parseInt(last, 2)];
    }
    return output;
  },

  base32Decode(str) {
    str = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
    let bits = "";
    for (const c of str) {
      const idx = this.BASE32_ALPHABET.indexOf(c);
      if (idx === -1) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    return new Uint8Array(bytes);
  },

  async hmacSha1(keyBytes, msgBytes) {
    const key = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
    return new Uint8Array(sig);
  },

  // 8 byte'lık büyük-uçlu (big-endian) sayaç (RFC 4226).
  counterToBytes(counter) {
    const bytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      bytes[i] = counter & 0xff;
      counter = Math.floor(counter / 256);
    }
    return bytes;
  },

  async generateCode(secretBase32, timeStepSeconds, forTimeMs) {
    timeStepSeconds = timeStepSeconds || 30;
    forTimeMs = forTimeMs || Date.now();
    const counter = Math.floor(forTimeMs / 1000 / timeStepSeconds);
    const key = this.base32Decode(secretBase32);
    const msg = this.counterToBytes(counter);
    const hmac = await this.hmacSha1(key, msg);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode = ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return (binCode % 1000000).toString().padStart(6, "0");
  },

  // Telefon/sunucu saatleri birebir aynı olmayabileceği için, girilen kod
  // şu anki 30 saniyelik pencerenin yanı sıra bir önceki ve bir sonraki
  // pencerede de denenir.
  async verifyCode(secretBase32, inputCode, windowSteps, timeStepSeconds) {
    windowSteps = windowSteps === undefined ? 1 : windowSteps;
    timeStepSeconds = timeStepSeconds || 30;
    const clean = String(inputCode || "").replace(/\D/g, "");
    if (clean.length !== 6) return false;
    const now = Date.now();
    for (let w = -windowSteps; w <= windowSteps; w++) {
      const code = await this.generateCode(secretBase32, timeStepSeconds, now + w * timeStepSeconds * 1000);
      if (code === clean) return true;
    }
    return false;
  },

  // Authenticator uygulamalarının QR ile okuduğu standart otpauth:// linki.
  otpAuthUri(secretBase32, accountLabel, issuer) {
    issuer = issuer || "Afium Portal";
    const label = encodeURIComponent(issuer + ":" + accountLabel);
    return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }
};

