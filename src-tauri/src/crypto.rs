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
