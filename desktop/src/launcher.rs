//! Stable bootstrapper for the updateable native ChibiMadness game host.
//!
//! This executable deliberately contains no game or WebView logic. It can be
//! kept installed while versioned game-host directories are replaced safely
//! before each launch.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    error::Error,
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const DEFAULT_NATIVE_MANIFEST_URL: &str =
    "https://github.com/r3t4rd/chibimadness/releases/latest/download/native-patch-manifest.json";
const DEFAULT_NATIVE_BUNDLE_URL: &str =
    "https://github.com/r3t4rd/chibimadness/releases/latest/download/native-patch.zip";
const NATIVE_PATCH_FORMAT_VERSION: u8 = 1;
const GAME_EXECUTABLE: &str = "chibimadness-game.exe";
const MAX_NATIVE_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_NATIVE_PATCH_BYTES: usize = 512 * 1024 * 1024;
const MAX_NATIVE_FILE_BYTES: usize = 512 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeManifest {
    format_version: u8,
    version: String,
    files: Vec<NativeFile>,
}

#[derive(Clone, Deserialize, Serialize)]
struct NativeFile {
    path: String,
    sha256: String,
    size: usize,
}

fn main() -> Result<(), Box<dyn Error>> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    let game = game_for_launch()?;
    Command::new(game).args(arguments).spawn()?;
    Ok(())
}

fn game_for_launch() -> Result<PathBuf, Box<dyn Error>> {
    let cache_root = native_cache_root()?;
    let cached = load_active_game(&cache_root);
    match fetch_manifest() {
        Ok(manifest) => match install_or_load_game(&cache_root, &manifest) {
            Ok(game) => Ok(game),
            Err(error) => {
                eprintln!("ChibiMadness native update ignored: {error}");
                cached.or_else(initial_game).ok_or_else(|| error)
            }
        },
        Err(error) => {
            eprintln!("ChibiMadness native update check skipped: {error}");
            cached
                .or_else(initial_game)
                .ok_or_else(|| "no usable ChibiMadness game host is installed".into())
        }
    }
}

fn native_cache_root() -> Result<PathBuf, Box<dyn Error>> {
    let base = env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .ok_or("Windows application-data directory is unavailable")?;
    let root = PathBuf::from(base)
        .join("ChibiMadness")
        .join("native-versions");
    fs::create_dir_all(root.join("versions"))?;
    Ok(root)
}

fn initial_game() -> Option<PathBuf> {
    let executable = env::current_exe().ok()?;
    let game = executable.parent()?.join("runtime").join(GAME_EXECUTABLE);
    game.is_file().then_some(game)
}

fn fetch_manifest() -> Result<NativeManifest, Box<dyn Error>> {
    let bytes = download_bytes(
        option_env!("CHIBIMADNESS_NATIVE_MANIFEST_URL").unwrap_or(DEFAULT_NATIVE_MANIFEST_URL),
        MAX_NATIVE_MANIFEST_BYTES,
    )?;
    let manifest = serde_json::from_slice::<NativeManifest>(&bytes)?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn install_or_load_game(root: &Path, manifest: &NativeManifest) -> Result<PathBuf, Box<dyn Error>> {
    let destination = version_directory(root, &manifest.version);
    if let Ok(game) = verified_game(&destination, manifest) {
        set_active_version(root, &manifest.version)?;
        return Ok(game);
    }

    let bundle = download_bytes(
        option_env!("CHIBIMADNESS_NATIVE_BUNDLE_URL").unwrap_or(DEFAULT_NATIVE_BUNDLE_URL),
        MAX_NATIVE_PATCH_BYTES,
    )?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let staging = root
        .join("versions")
        .join(format!(".{}-{stamp}.partial", manifest.version));
    fs::create_dir_all(&staging)?;
    let result = unpack_bundle(&bundle, &staging, manifest).and_then(|()| {
        fs::write(
            staging.join("native-patch-manifest.json"),
            serde_json::to_vec(manifest)?,
        )
        .map_err(Into::into)
    });
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_dir_all(&destination)?;
    }
    fs::rename(&staging, &destination)?;
    let game = verified_game(&destination, manifest)?;
    set_active_version(root, &manifest.version)?;
    Ok(game)
}

fn load_active_game(root: &Path) -> Option<PathBuf> {
    let version = fs::read_to_string(root.join("active-version"))
        .ok()?
        .trim()
        .to_owned();
    if !is_safe_version(&version) {
        return None;
    }
    let directory = version_directory(root, &version);
    let bytes = fs::read(directory.join("native-patch-manifest.json")).ok()?;
    let manifest = serde_json::from_slice::<NativeManifest>(&bytes).ok()?;
    if manifest.version != version || validate_manifest(&manifest).is_err() {
        return None;
    }
    verified_game(&directory, &manifest).ok()
}

fn set_active_version(root: &Path, version: &str) -> Result<(), Box<dyn Error>> {
    let temporary = root.join(".active-version.partial");
    fs::write(&temporary, version)?;
    let active = root.join("active-version");
    if active.exists() {
        fs::remove_file(&active)?;
    }
    fs::rename(temporary, active)?;
    Ok(())
}

fn version_directory(root: &Path, version: &str) -> PathBuf {
    root.join("versions").join(version)
}

fn verified_game(root: &Path, manifest: &NativeManifest) -> Result<PathBuf, Box<dyn Error>> {
    validate_manifest(manifest)?;
    for file in &manifest.files {
        let content = fs::read(root.join(&file.path))?;
        if content.len() != file.size || sha256(&content) != file.sha256 {
            return Err("cached native file does not match its manifest".into());
        }
    }
    let game = root.join(GAME_EXECUTABLE);
    if !game.is_file() {
        return Err("native patch does not include the game host".into());
    }
    Ok(game)
}

fn unpack_bundle(
    bytes: &[u8],
    destination: &Path,
    manifest: &NativeManifest,
) -> Result<(), Box<dyn Error>> {
    let expected = manifest
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect::<BTreeMap<_, _>>();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    if archive.len() != expected.len() {
        return Err("native archive file list does not match its manifest".into());
    }
    let mut total = 0usize;
    let mut seen = BTreeSet::new();
    for index in 0..archive.len() {
        let mut source = archive.by_index(index)?;
        let path = source.name().replace('\\', "/");
        let Some(file) = expected.get(path.as_str()) else {
            return Err("native archive contains an unexpected file".into());
        };
        if !seen.insert(path.clone()) || source.is_dir() || source.size() != file.size as u64 {
            return Err("native archive contains an invalid file entry".into());
        }
        let mut content = Vec::with_capacity(file.size);
        source
            .by_ref()
            .take((file.size + 1) as u64)
            .read_to_end(&mut content)?;
        total = total
            .checked_add(content.len())
            .ok_or("native archive is too large")?;
        if content.len() != file.size
            || total > MAX_NATIVE_PATCH_BYTES
            || sha256(&content) != file.sha256
        {
            return Err("native file does not match its manifest".into());
        }
        let output = destination.join(&path);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output, content)?;
    }
    if seen.len() != expected.len() {
        return Err("native archive is missing a manifest file".into());
    }
    Ok(())
}

fn validate_manifest(manifest: &NativeManifest) -> Result<(), Box<dyn Error>> {
    if manifest.format_version != NATIVE_PATCH_FORMAT_VERSION
        || manifest.files.is_empty()
        || !is_safe_version(&manifest.version)
        || !manifest
            .files
            .iter()
            .any(|file| file.path == GAME_EXECUTABLE)
    {
        return Err("native patch manifest has an unsupported format".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0usize;
    for file in &manifest.files {
        if !is_safe_relative_path(&file.path)
            || !paths.insert(file.path.as_str())
            || file.size > MAX_NATIVE_FILE_BYTES
            || !is_sha256(&file.sha256)
        {
            return Err("native patch manifest contains an invalid file".into());
        }
        total = total
            .checked_add(file.size)
            .ok_or("native patch manifest is too large")?;
    }
    if total > MAX_NATIVE_PATCH_BYTES {
        return Err("native patch manifest is too large".into());
    }
    Ok(())
}

fn is_safe_version(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn is_safe_relative_path(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('\\')
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn download_bytes(url: &str, limit: usize) -> Result<Vec<u8>, Box<dyn Error>> {
    let response = ureq::get(url).timeout(Duration::from_secs(30)).call()?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err("download exceeds the configured limit".into());
    }
    Ok(bytes)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(path: &str) -> NativeManifest {
        NativeManifest {
            format_version: NATIVE_PATCH_FORMAT_VERSION,
            version: "v1.2.3".to_owned(),
            files: vec![NativeFile {
                path: path.to_owned(),
                sha256: "0".repeat(64),
                size: 1,
            }],
        }
    }

    #[test]
    fn native_manifest_requires_the_game_host_and_safe_paths() {
        assert!(validate_manifest(&manifest(GAME_EXECUTABLE)).is_ok());
        assert!(validate_manifest(&manifest("../chibimadness-game.exe")).is_err());
        assert!(validate_manifest(&manifest("bin\\chibimadness-game.exe")).is_err());
    }

    #[test]
    fn native_manifest_rejects_invalid_hashes() {
        let mut invalid = manifest(GAME_EXECUTABLE);
        invalid.files[0].sha256 = "not-a-hash".to_owned();
        assert!(validate_manifest(&invalid).is_err());
    }
}
