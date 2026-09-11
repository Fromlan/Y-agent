use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use std::path::{Path, PathBuf};

const KEY_FILE: &str = "secret.key";

/// 用本地主密钥加密 API Key，避免明文落盘。
/// 主密钥在用户机器上随机生成并保存在 app_data_dir/secret.key。
/// 注意：这不是对抗性威胁模型，目标是防止误拷贝泄露。生产环境应使用 OS keychain。
pub struct KeyCipher {
    key: [u8; 32],
}

impl KeyCipher {
    pub fn load_or_create(app_dir: &Path) -> anyhow::Result<Self> {
        let key_path: PathBuf = app_dir.join(KEY_FILE);
        let key = if key_path.exists() {
            let bytes = std::fs::read(&key_path)?;
            if bytes.len() != 32 {
                anyhow::bail!("secret.key length invalid");
            }
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            arr
        } else {
            std::fs::create_dir_all(app_dir)?;
            let mut arr = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut arr);
            std::fs::write(&key_path, arr)?;
            arr
        };
        Ok(Self { key })
    }

    pub fn encrypt(&self, plaintext: &str) -> anyhow::Result<String> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;
        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);
        Ok(B64.encode(combined))
    }

    pub fn decrypt(&self, encoded: &str) -> anyhow::Result<String> {
        let raw = B64.decode(encoded)?;
        if raw.len() < 12 {
            anyhow::bail!("ciphertext too short");
        }
        let (nonce_bytes, ciphertext) = raw.split_at(12);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let nonce = Nonce::from_slice(nonce_bytes);
        let plain = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e}"))?;
        Ok(String::from_utf8(plain)?)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// 拿一个唯一的临时目录,测试结束自动清理
    fn fresh_tempdir(label: &str) -> std::path::PathBuf {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("y-agent-crypto-test-{label}-{pid}-{id}"));
        // 残留就清掉
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 加密 → 解密 完整往返
    #[test]
    fn encrypt_decrypt_round_trip() {
        let cipher = KeyCipher { key: [7u8; 32] };
        let plain = "doubao-seedream-test-key-abc123";
        let enc = cipher.encrypt(plain).unwrap();
        assert!(!enc.is_empty());
        let dec = cipher.decrypt(&enc).unwrap();
        assert_eq!(dec, plain);
    }

    /// 中文 / Emoji / 长字符串都能正常加解密
    #[test]
    fn encrypt_decrypt_unicode() {
        let cipher = KeyCipher { key: [1u8; 32] };
        let plain = "中文密钥 🎨 ñ ü — Hello";
        let enc = cipher.encrypt(plain).unwrap();
        let dec = cipher.decrypt(&enc).unwrap();
        assert_eq!(dec, plain);
    }

    /// 同一明文每次加密密文不同（nonce 随机）
    #[test]
    fn encrypt_produces_different_ciphertexts() {
        let cipher = KeyCipher { key: [9u8; 32] };
        let plain = "same-plaintext";
        let enc1 = cipher.encrypt(plain).unwrap();
        let enc2 = cipher.encrypt(plain).unwrap();
        assert_ne!(enc1, enc2, "nonce 必须随机,否则重放风险");
        assert_eq!(cipher.decrypt(&enc1).unwrap(), plain);
        assert_eq!(cipher.decrypt(&enc2).unwrap(), plain);
    }

    /// 不同密钥解密失败
    #[test]
    fn decrypt_with_wrong_key_fails() {
        let cipher1 = KeyCipher { key: [1u8; 32] };
        let cipher2 = KeyCipher { key: [2u8; 32] };
        let enc = cipher1.encrypt("secret").unwrap();
        let result = cipher2.decrypt(&enc);
        assert!(result.is_err(), "不同 key 必须解密失败");
    }

    /// load_or_create 首次创建文件,二次加载得到相同 key
    #[test]
    fn load_or_create_is_idempotent() {
        let app_dir = fresh_tempdir("idempotent");
        let cipher1 = KeyCipher::load_or_create(&app_dir).unwrap();
        let enc = cipher1.encrypt("hello").unwrap();
        let cipher2 = KeyCipher::load_or_create(&app_dir).unwrap();
        let dec = cipher2.decrypt(&enc).unwrap();
        assert_eq!(dec, "hello");
        let _ = std::fs::remove_dir_all(&app_dir);
    }

    /// 损坏的 secret.key(长度不对)必须报错而非 panic
    #[test]
    fn load_or_create_rejects_wrong_length() {
        let app_dir = fresh_tempdir("badkey");
        let key_path = app_dir.join("secret.key");
        std::fs::write(&key_path, [0u8; 16]).unwrap();
        let result = KeyCipher::load_or_create(&app_dir);
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(&app_dir);
    }

    /// 损坏的 secret.key(空文件)必须报错
    #[test]
    fn load_or_create_rejects_empty_file() {
        let app_dir = fresh_tempdir("empty");
        let key_path = app_dir.join("secret.key");
        std::fs::write(&key_path, []).unwrap();
        let result = KeyCipher::load_or_create(&app_dir);
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(&app_dir);
    }
}
