use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager,
};
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
    #[serde(default)]
    github: GitHubConnectionSettings,
    #[serde(default)]
    workspace: PersistedWorkspaceState,
    recent_files: Vec<String>,
    recent_folders: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubConnectionSettings {
    connected: bool,
    token: String,
    username: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceState {
    root_path: Option<String>,
    expanded_nodes: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "ember".into(),
            font_family: "JetBrains Mono".into(),
            font_size: 14,
            tab_size: 2,
            word_wrap: "off".into(),
            autosave: false,
            github: GitHubConnectionSettings::default(),
            workspace: PersistedWorkspaceState::default(),
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
    let legacy_dark_theme = ["sub", "lime"].concat();
    if theme == "midnight" || theme == legacy_dark_theme {
        "ember".into()
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
fn create_text_file(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    if file_path.exists() {
        return Err("A file or folder already exists at this path.".into());
    }

    fs::write(file_path, "").map_err(|error| error.to_string())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    let directory_path = Path::new(&path);
    if directory_path.exists() {
        return Err("A file or folder already exists at this path.".into());
    }

    fs::create_dir(directory_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn rename_path(path: String, new_path: String) -> Result<(), String> {
    let source = Path::new(&path);
    let destination = Path::new(&new_path);
    if destination.exists() {
        return Err("A file or folder already exists at the destination path.".into());
    }

    fs::rename(source, destination).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    let metadata = fs::metadata(target).map_err(|error| error.to_string())?;

    if metadata.is_dir() {
        fs::remove_dir_all(target).map_err(|error| error.to_string())
    } else {
        fs::remove_file(target).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn create_print_preview(name: String, html: String) -> Result<String, String> {
    let safe_name = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(48)
        .collect::<String>();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let file_name = format!(
        "pptext-print-{}-{}.html",
        if safe_name.is_empty() {
            "untitled"
        } else {
            &safe_name
        },
        timestamp
    );
    let path = std::env::temp_dir().join(file_name);

    fs::write(&path, html).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
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
    fn migrates_legacy_dark_themes_to_ember() {
        assert_eq!(normalize_theme("midnight".into()), "ember");
        assert_eq!(normalize_theme(["sub", "lime"].concat()), "ember");
        assert_eq!(normalize_theme("paper".into()), "paper");
    }

    #[test]
    fn settings_without_github_connection_still_load() {
        let content = r#"{
            "theme": "ember",
            "fontFamily": "JetBrains Mono",
            "fontSize": 14,
            "tabSize": 2,
            "wordWrap": "off",
            "autosave": false,
            "recentFiles": [],
            "recentFolders": []
        }"#;

        let settings: super::AppSettings = serde_json::from_str(content).unwrap();
        assert!(!settings.github.connected);
        assert!(settings.github.username.is_empty());
        assert!(settings.workspace.root_path.is_none());
        assert!(settings.workspace.expanded_nodes.is_empty());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let action = |id: &str, text: &str, accelerator: Option<&str>| {
                MenuItem::with_id(app, id, text, true, accelerator)
            };
            let disabled =
                |id: &str, text: &str| MenuItem::with_id(app, id, text, false, None::<&str>);
            let about = AboutMetadata {
                name: Some("PPText Editor".into()),
                version: Some(app.package_info().version.to_string()),
                ..Default::default()
            };

            let app_menu = Submenu::with_items(
                app,
                "PPText Editor",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About PPText Editor"), Some(about))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "settings", "Settings...", true, Some("Cmd+,"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, Some("Services"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("Hide PPText Editor"))?,
                    &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit PPText Editor"))?,
                ],
            )?;
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &action("native.new-file", "New File", Some("Cmd+N"))?,
                    &action("native.open-file", "Open File...", Some("Cmd+O"))?,
                    &action("native.open-folder", "Open Folder...", Some("Cmd+Shift+O"))?,
                    &disabled("native.open", "Open...")?,
                    &Submenu::with_items(
                        app,
                        "Open Recent",
                        true,
                        &[
                            &disabled("native.reopen-closed-file", "Reopen Closed File")?,
                            &PredefinedMenuItem::separator(app)?,
                            &disabled("native.clear-recent", "Clear Items")?,
                        ],
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &action("native.save", "Save", Some("Cmd+S"))?,
                    &action("native.save-as", "Save As...", Some("Cmd+Shift+S"))?,
                    &disabled("native.save-all", "Save All")?,
                    &action("native.print", "Print...", None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.new-window", "New Window")?,
                    &PredefinedMenuItem::close_window(app, Some("Close Window"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &action("native.close-file", "Close File", Some("Cmd+W"))?,
                    &disabled("native.revert-file", "Revert File")?,
                    &disabled("native.close-all-files", "Close All Files")?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &Submenu::with_items(
                        app,
                        "Line",
                        true,
                        &[
                            &action("native.indent", "Indent", Some("Cmd+]"))?,
                            &action("native.unindent", "Unindent", Some("Cmd+["))?,
                            &disabled("native.reindent", "Reindent")?,
                            &action("native.swap-line-up", "Swap Line Up", Some("Ctrl+Cmd+Up"))?,
                            &action(
                                "native.swap-line-down",
                                "Swap Line Down",
                                Some("Ctrl+Cmd+Down"),
                            )?,
                            &action(
                                "native.duplicate-line",
                                "Duplicate Line",
                                Some("Cmd+Shift+D"),
                            )?,
                            &action("native.delete-line", "Delete Line", Some("Ctrl+Shift+K"))?,
                            &disabled("native.join-lines", "Join Lines")?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Comment",
                        true,
                        &[
                            &action("native.toggle-comment", "Toggle Comment", Some("Cmd+/"))?,
                            &action(
                                "native.toggle-block-comment",
                                "Toggle Block Comment",
                                Some("Cmd+Alt+/"),
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Convert Case",
                        true,
                        &[
                            &disabled("native.title-case", "Title Case")?,
                            &disabled("native.upper-case", "Upper Case")?,
                            &disabled("native.lower-case", "Lower Case")?,
                            &disabled("native.swap-case", "Swap Case")?,
                        ],
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &action(
                        "native.show-completions",
                        "Show Completions",
                        Some("Ctrl+Space"),
                    )?,
                    &disabled("native.sort-lines", "Sort Lines")?,
                ],
            )?;
            let selection_menu = Submenu::with_items(
                app,
                "Selection",
                true,
                &[
                    &disabled("native.split-selection-into-lines", "Split into Lines")?,
                    &disabled("native.single-selection", "Single Selection")?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                    &disabled("native.expand-selection", "Expand Selection")?,
                    &disabled("native.expand-selection-line", "Expand Selection to Line")?,
                    &disabled("native.expand-selection-word", "Expand Selection to Word")?,
                    &disabled("native.expand-selection-block", "Expand Selection to Block")?,
                    &disabled("native.expand-selection-scope", "Expand Selection to Scope")?,
                    &disabled(
                        "native.expand-selection-brackets",
                        "Expand Selection to Brackets",
                    )?,
                    &disabled(
                        "native.expand-selection-indentation",
                        "Expand Selection to Indentation",
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.add-previous-line", "Add Previous Line")?,
                    &disabled("native.add-next-line", "Add Next Line")?,
                ],
            )?;
            let find_menu = Submenu::with_items(
                app,
                "Find",
                true,
                &[
                    &action("native.find", "Find...", Some("Cmd+F"))?,
                    &action("native.find-next", "Find Next", Some("Cmd+G"))?,
                    &action("native.find-previous", "Find Previous", Some("Cmd+Shift+G"))?,
                    &disabled("native.incremental-find", "Incremental Find")?,
                    &PredefinedMenuItem::separator(app)?,
                    &action("native.replace", "Replace...", Some("Cmd+Alt+F"))?,
                    &disabled("native.replace-next", "Replace Next")?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.quick-find", "Quick Find")?,
                    &disabled("native.quick-find-all", "Quick Find All")?,
                    &disabled("native.quick-add-next", "Quick Add Next")?,
                    &PredefinedMenuItem::separator(app)?,
                    &action(
                        "native.find-in-files",
                        "Find in Files...",
                        Some("Cmd+Shift+F"),
                    )?,
                    &Submenu::with_items(
                        app,
                        "Find Results",
                        true,
                        &[
                            &disabled("native.show-find-results", "Show Find Results")?,
                            &disabled("native.next-result", "Next Result")?,
                            &disabled("native.previous-result", "Previous Result")?,
                        ],
                    )?,
                    &disabled("native.cancel-find-in-files", "Cancel Find in Files")?,
                ],
            )?;
            let view_menu = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &Submenu::with_items(
                        app,
                        "Side Bar",
                        true,
                        &[
                            &action("native.toggle-sidebar", "Toggle Side Bar", Some("Cmd+K"))?,
                            &action("native.show-open-files", "Show Open Files", None)?,
                        ],
                    )?,
                    &disabled("native.toggle-minimap", "Toggle Minimap")?,
                    &disabled("native.toggle-tabs", "Toggle Tabs")?,
                    &disabled("native.toggle-status-bar", "Toggle Status Bar")?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                    &disabled("native.distraction-free", "Enter Distraction Free Mode")?,
                    &PredefinedMenuItem::separator(app)?,
                    &Submenu::with_items(
                        app,
                        "Layout",
                        true,
                        &[
                            &disabled("native.layout-single", "Single")?,
                            &disabled("native.layout-columns-2", "Columns: 2")?,
                            &disabled("native.layout-columns-3", "Columns: 3")?,
                            &disabled("native.layout-rows-2", "Rows: 2")?,
                            &disabled("native.layout-grid-4", "Grid: 4")?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Indentation",
                        true,
                        &[
                            &disabled("native.indent-spaces", "Indent Using Spaces")?,
                            &PredefinedMenuItem::separator(app)?,
                            &action("native.tab-size-2", "Tab Width: 2", None)?,
                            &action("native.tab-size-4", "Tab Width: 4", None)?,
                            &action("native.tab-size-8", "Tab Width: 8", None)?,
                        ],
                    )?,
                    &action("native.toggle-word-wrap", "Word Wrap", None)?,
                ],
            )?;
            let goto_menu = Submenu::with_items(
                app,
                "Goto",
                true,
                &[
                    &action("native.goto-anything", "Goto Anything...", Some("Cmd+P"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.goto-symbol", "Goto Symbol...")?,
                    &disabled("native.goto-symbol-project", "Goto Symbol in Project...")?,
                    &disabled("native.goto-definition", "Goto Definition...")?,
                    &disabled("native.goto-reference", "Goto Reference...")?,
                    &action("native.goto-line", "Goto Line...", Some("Ctrl+G"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.jump-back", "Jump Back")?,
                    &disabled("native.jump-forward", "Jump Forward")?,
                    &Submenu::with_items(
                        app,
                        "Switch File",
                        true,
                        &[
                            &action("native.next-file", "Next File", Some("Cmd+Alt+Right"))?,
                            &action(
                                "native.previous-file",
                                "Previous File",
                                Some("Cmd+Alt+Left"),
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Bookmarks",
                        true,
                        &[
                            &disabled("native.toggle-bookmark", "Toggle Bookmark")?,
                            &disabled("native.next-bookmark", "Next Bookmark")?,
                            &disabled("native.previous-bookmark", "Previous Bookmark")?,
                            &disabled("native.clear-bookmarks", "Clear Bookmarks")?,
                        ],
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.matching-bracket", "Jump to Matching Bracket")?,
                ],
            )?;
            let tools_menu = Submenu::with_items(
                app,
                "Tools",
                true,
                &[
                    &action(
                        "native.command-palette",
                        "Command Palette...",
                        Some("Cmd+Shift+P"),
                    )?,
                    &disabled("native.snippets", "Snippets...")?,
                    &PredefinedMenuItem::separator(app)?,
                    &Submenu::with_items(
                        app,
                        "Build System",
                        true,
                        &[
                            &disabled("native.build-system-auto", "Automatic")?,
                            &disabled("native.new-build-system", "New Build System...")?,
                        ],
                    )?,
                    &disabled("native.build", "Build")?,
                    &disabled("native.build-with", "Build With...")?,
                    &disabled("native.cancel-build", "Cancel Build")?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.record-macro", "Record Macro")?,
                    &disabled("native.playback-macro", "Playback Macro")?,
                    &disabled("native.save-macro", "Save Macro...")?,
                    &PredefinedMenuItem::separator(app)?,
                    &Submenu::with_items(
                        app,
                        "Developer",
                        true,
                        &[
                            &disabled("native.new-plugin", "New Plugin...")?,
                            &disabled("native.new-snippet", "New Snippet...")?,
                            &disabled("native.new-syntax", "New Syntax...")?,
                            &disabled("native.show-scope-name", "Show Scope Name")?,
                        ],
                    )?,
                ],
            )?;
            let project_menu = Submenu::with_items(
                app,
                "Project",
                true,
                &[
                    &disabled("native.open-project", "Open Project...")?,
                    &disabled("native.switch-project", "Switch Project...")?,
                    &disabled("native.quick-switch-project", "Quick Switch Project...")?,
                    &Submenu::with_items(
                        app,
                        "Open Recent",
                        true,
                        &[
                            &disabled(
                                "native.project-recent-empty",
                                "Recent projects will appear here",
                            )?,
                            &PredefinedMenuItem::separator(app)?,
                            &disabled("native.clear-recent-projects", "Clear Items")?,
                        ],
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &disabled("native.save-project-as", "Save Project As...")?,
                    &disabled("native.close-project", "Close Project")?,
                    &disabled("native.edit-project", "Edit Project")?,
                    &PredefinedMenuItem::separator(app)?,
                    &action(
                        "native.add-folder",
                        "Add Folder to Project...",
                        Some("Cmd+Shift+O"),
                    )?,
                    &disabled("native.remove-folders", "Remove all Folders from Project")?,
                    &action("native.refresh-folders", "Refresh Folders", None)?,
                ],
            )?;
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                ],
            )?;
            let help_menu = Submenu::new(app, "Help", true)?;

            Menu::with_items(
                app,
                &[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &selection_menu,
                    &find_menu,
                    &view_menu,
                    &goto_menu,
                    &tools_menu,
                    &project_menu,
                    &window_menu,
                    &help_menu,
                ],
            )
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "settings" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("native-menu-settings", ());
                }
            } else if id.starts_with("native.") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("native-menu-command", id.to_string());
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_text_file,
            write_file,
            create_text_file,
            create_directory,
            rename_path,
            delete_path,
            create_print_preview,
            search_in_workspace,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
