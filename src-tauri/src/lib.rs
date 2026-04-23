use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

const MAX_TEXT_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    file_path: String,
    line: usize,
    column: usize,
    preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    theme: String,
    font_family: String,
    font_size: u16,
    tab_size: u8,
    word_wrap: String,
    autosave: bool,
    recent_files: Vec<String>,
    recent_folders: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "sublime".into(),
            font_family: "JetBrains Mono".into(),
            font_size: 14,
            tab_size: 2,
            word_wrap: "off".into(),
            autosave: false,
            recent_files: Vec::new(),
            recent_folders: Vec::new(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;
    Ok(base_dir.join("settings.json"))
}

fn should_skip_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|value| value.to_str()),
        Some(".git" | "node_modules" | "dist" | "target")
    )
}

fn build_tree(path: &Path) -> Result<FileNode, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let mut children = Vec::new();

    if metadata.is_dir() {
        let mut entries = fs::read_dir(path)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();

        entries.sort_by_key(|entry| {
            let entry_path = entry.path();
            (
                !entry_path.is_dir(),
                entry.file_name().to_string_lossy().to_ascii_lowercase(),
            )
        });

        for entry in entries {
            let entry_path = entry.path();
            if entry_path.is_dir() && should_skip_dir(&entry_path) {
                continue;
            }

            if let Ok(child) = build_tree(&entry_path) {
                children.push(child);
            }
        }
    }

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: metadata.is_dir(),
        children,
    })
}

fn normalize_recents(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .take(12)
        .collect()
}

fn normalize_theme(theme: String) -> String {
    if theme == "midnight" {
        "sublime".into()
    } else {
        theme
    }
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0)
}

#[tauri::command]
fn list_dir(path: String) -> Result<FileNode, String> {
    build_tree(Path::new(&path))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "File is too large to open safely ({} MB limit).",
            MAX_TEXT_FILE_BYTES / 1024 / 1024
        ));
    }

    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    if looks_binary(&bytes) {
        return Err("This looks like a binary file, so PPText Editor skipped opening it.".into());
    }

    String::from_utf8(bytes).map_err(|_| "This file is not valid UTF-8 text.".to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn search_in_workspace(query: String, root_path: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let needle = query.to_lowercase();
    let mut results = Vec::new();

    for entry in WalkDir::new(&root_path)
        .into_iter()
        .filter_entry(|entry| !(entry.file_type().is_dir() && should_skip_dir(entry.path())))
        .filter_map(Result::ok)
    {
        if entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let Ok(metadata) = fs::metadata(path) else {
            continue;
        };
        if metadata.len() > MAX_TEXT_FILE_BYTES {
            continue;
        }

        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        if looks_binary(&bytes) {
            continue;
        }

        let Ok(content) = String::from_utf8(bytes) else {
            continue;
        };

        for (line_index, line) in content.lines().enumerate() {
            if let Some(column) = line.to_lowercase().find(&needle) {
                results.push(SearchResult {
                    file_path: path.to_string_lossy().to_string(),
                    line: line_index + 1,
                    column: column + 1,
                    preview: line.trim().to_string(),
                });
            }

            if results.len() >= 200 {
                return Ok(results);
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut settings: AppSettings =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    settings.theme = normalize_theme(settings.theme);
    Ok(settings)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let normalized = AppSettings {
        theme: normalize_theme(settings.theme),
        recent_files: normalize_recents(settings.recent_files),
        recent_folders: normalize_recents(settings.recent_folders),
        ..settings
    };
    let content = serde_json::to_string_pretty(&normalized).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{looks_binary, normalize_recents, normalize_theme};

    #[test]
    fn recent_items_are_unique_and_trimmed() {
        let values = vec![
            "/tmp/a".to_string(),
            "/tmp/b".to_string(),
            "/tmp/a".to_string(),
            String::new(),
        ];

        let normalized = normalize_recents(values);
        assert_eq!(normalized, vec!["/tmp/a".to_string(), "/tmp/b".to_string()]);
    }

    #[test]
    fn detects_binary_content_by_nul_byte() {
        assert!(looks_binary(b"abc\0def"));
        assert!(!looks_binary("plain UTF-8 text".as_bytes()));
    }

    #[test]
    fn migrates_midnight_theme_to_sublime() {
        assert_eq!(normalize_theme("midnight".into()), "sublime");
        assert_eq!(normalize_theme("paper".into()), "paper");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_text_file,
            write_file,
            search_in_workspace,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
