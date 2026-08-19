use crate::crypto::KeyCipher;
use crate::storage::Storage;
use std::path::PathBuf;

pub struct AppState {
    pub storage: Storage,
    pub cipher: KeyCipher,
    #[allow(dead_code)]
    pub app_dir: PathBuf,
}

impl AppState {
    pub fn new(app_dir: PathBuf) -> anyhow::Result<Self> {
        let storage = Storage::open(&app_dir)?;
        let cipher = KeyCipher::load_or_create(&app_dir)?;
        Ok(Self {
            storage,
            cipher,
            app_dir,
        })
    }
}
